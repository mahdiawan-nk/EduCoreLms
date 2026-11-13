import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  knowledgeCategories,
  knowledgeArticles,
  knowledgeArticleRoles,
  knowledgeTags,
  knowledgeArticleTags,
  knowledgeFaqs,
  knowledgeArticleVersions,
  roles,
  users,
} from '../db/schema.ts';
import {
  authenticateRequest,
  sendSuccess,
  sendError,
  recordAuditLog,
  AuthenticatedUser,
} from './security.ts';
import { ensureKnowledgeCenterSeeded } from './knowledgeSeed.ts';

function hasPerm(user: AuthenticatedUser, code: string): boolean {
  return user.permissions.includes(code) || user.roles.includes('SUPERADMIN');
}

function isAuditorUser(user: AuthenticatedUser): boolean {
  return user.roles.includes('AUDITOR') && !user.roles.includes('SUPERADMIN');
}

function isSuperadminManager(user: AuthenticatedUser): boolean {
  return (
    !isAuditorUser(user) &&
    user.roles.includes('SUPERADMIN') &&
    hasPerm(user, 'knowledge.manage')
  );
}

function canReadKnowledge(user: AuthenticatedUser): boolean {
  return hasPerm(user, 'knowledge.view') || hasPerm(user, 'knowledge.manage');
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function loadArticlesWithRelations(options: {
  user: AuthenticatedUser;
  includeUnpublished?: boolean;
  categorySlug?: string;
  tagSlug?: string;
  roleFilter?: string;
  q?: string;
  sort?: string;
}) {
  await ensureKnowledgeCenterSeeded();

  const canManage = isSuperadminManager(options.user);
  const allCategories = await db
    .select()
    .from(knowledgeCategories)
    .orderBy(asc(knowledgeCategories.sortOrder), asc(knowledgeCategories.name));
  const catById = new Map(allCategories.map((c) => [c.id, c]));

  const allArticles = await db
    .select()
    .from(knowledgeArticles)
    .orderBy(desc(knowledgeArticles.updatedAt));

  if (allArticles.length === 0) {
    return { articles: [], categories: allCategories, tags: [] };
  }

  const articleIds = allArticles.map((a) => a.id);

  const [articleRoleRows, articleTagRows, allTags] = await Promise.all([
    db
      .select({
        articleId: knowledgeArticleRoles.articleId,
        roleId: roles.id,
        roleName: roles.code,
      })
      .from(knowledgeArticleRoles)
      .innerJoin(roles, eq(knowledgeArticleRoles.roleId, roles.id))
      .where(inArray(knowledgeArticleRoles.articleId, articleIds)),
    db
      .select({
        articleId: knowledgeArticleTags.articleId,
        tagId: knowledgeTags.id,
        tagName: knowledgeTags.name,
        tagSlug: knowledgeTags.slug,
      })
      .from(knowledgeArticleTags)
      .innerJoin(knowledgeTags, eq(knowledgeArticleTags.tagId, knowledgeTags.id))
      .where(inArray(knowledgeArticleTags.articleId, articleIds)),
    db.select().from(knowledgeTags).orderBy(asc(knowledgeTags.name)),
  ]);

  const rolesByArticle = new Map<string, string[]>();
  for (const row of articleRoleRows) {
    const list = rolesByArticle.get(row.articleId) || [];
    list.push(row.roleName);
    rolesByArticle.set(row.articleId, list);
  }

  const tagsByArticle = new Map<
    string,
    { id: string; name: string; slug: string }[]
  >();
  for (const row of articleTagRows) {
    const list = tagsByArticle.get(row.articleId) || [];
    list.push({ id: row.tagId, name: row.tagName, slug: row.tagSlug });
    tagsByArticle.set(row.articleId, list);
  }

  const userRoles = new Set(options.user.roles);
  const queryLower = (options.q || '').trim().toLowerCase();

  let enriched = allArticles.map((a) => {
    const cat = catById.get(a.categoryId);
    const articleRoles = rolesByArticle.get(a.id) || [];
    const articleTags = tagsByArticle.get(a.id) || [];
    return {
      ...a,
      category: cat
        ? { id: cat.id, name: cat.name, slug: cat.slug, icon: cat.icon }
        : null,
      roles: articleRoles,
      tags: articleTags,
    };
  });

  // 1. Visibility & Status enforcement
  if (!(canManage && options.includeUnpublished)) {
    enriched = enriched.filter((a) => a.status === 'PUBLISHED');
    enriched = enriched.filter((a) => {
      if (canManage) return true;
      if (a.roles.length === 0) return false;
      return a.roles.some((r) => userRoles.has(r));
    });
  }

  // 2. Optional filters
  if (options.categorySlug) {
    enriched = enriched.filter(
      (a) => a.category?.slug === options.categorySlug
    );
  }
  if (options.tagSlug) {
    enriched = enriched.filter((a) =>
      a.tags.some((t) => t.slug === options.tagSlug)
    );
  }
  if (options.roleFilter && options.roleFilter !== 'ALL') {
    // Non-managers may only filter within their own roles
    if (canManage || userRoles.has(options.roleFilter)) {
      enriched = enriched.filter((a) => a.roles.includes(options.roleFilter!));
    }
  }

  // 3. Full-text search scoring
  if (queryLower) {
    const terms = queryLower.split(/\s+/).filter(Boolean);
    enriched = enriched
      .map((a) => {
        const titleLower = a.title.toLowerCase();
        const excerptLower = a.excerpt.toLowerCase();
        const keywordsLower = a.keywords.toLowerCase();
        const catLower = (a.category?.name || '').toLowerCase();
        const bodyLower = stripHtml(a.content).toLowerCase();

        let score = 0;
        for (const term of terms) {
          if (titleLower.includes(term)) score += 10;
          if (keywordsLower.includes(term)) score += 6;
          if (catLower.includes(term)) score += 5;
          if (excerptLower.includes(term)) score += 4;
          if (bodyLower.includes(term)) score += 2;
        }
        return { article: a, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.article);
  } else if (options.sort === 'popular') {
    enriched.sort(
      (a, b) =>
        b.viewCount - a.viewCount ||
        Number(b.isFeatured) - Number(a.isFeatured)
    );
  } else if (options.sort === 'latest') {
    enriched.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } else {
    enriched.sort(
      (a, b) =>
        Number(b.isFeatured) - Number(a.isFeatured) ||
        b.viewCount - a.viewCount ||
        a.title.localeCompare(b.title)
    );
  }

  return { articles: enriched, categories: allCategories, tags: allTags };
}

export async function registerKnowledgeCenterRoutes(fastify: FastifyInstance) {
  // 1. GET /api/v1/knowledge/overview
  fastify.get('/api/v1/knowledge/overview', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!canReadKnowledge(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Anda tidak memiliki akses ke Pusat Bantuan.'
      );
    }

    const { articles, categories, tags } = await loadArticlesWithRelations({
      user,
    });

    const userRoles = new Set(user.roles);
    const canManage = isSuperadminManager(user);

    const faqRows = await db
      .select()
      .from(knowledgeFaqs)
      .where(eq(knowledgeFaqs.status, 'PUBLISHED'))
      .orderBy(asc(knowledgeFaqs.sortOrder));

    const visibleFaqs = faqRows.filter(
      (f) =>
        canManage ||
        f.audienceRole === 'ALL' ||
        userRoles.has(f.audienceRole)
    );

    const countByCategory = new Map<string, number>();
    for (const a of articles) {
      countByCategory.set(
        a.categoryId,
        (countByCategory.get(a.categoryId) || 0) + 1
      );
    }

    const visibleCategories = categories
      .filter((c) => c.isActive)
      .map((c) => ({
        ...c,
        articleCount: countByCategory.get(c.id) || 0,
      }))
      .filter((c) => canManage || c.articleCount > 0);

    const popularArticles = [...articles]
      .sort(
        (a, b) =>
          b.viewCount - a.viewCount ||
          Number(b.isFeatured) - Number(a.isFeatured)
      )
      .slice(0, 6)
      .map(({ content, contentJson, ...summary }) => summary);

    const latestArticles = [...articles]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 6)
      .map(({ content, contentJson, ...summary }) => summary);

    const troubleshootingArticles = articles
      .filter(
        (a) =>
          a.keywords.toLowerCase().includes('troubleshooting') ||
          a.content.toLowerCase().includes('troubleshooting')
      )
      .slice(0, 6)
      .map(({ content, contentJson, ...summary }) => summary);

    return sendSuccess(reply, {
      documentationVersion: 'v1.0.0',
      activeRoles: user.roles,
      canManage,
      isReadOnlyAuditor: isAuditorUser(user),
      totalArticles: articles.length,
      categories: visibleCategories,
      tags,
      popularArticles,
      latestArticles,
      troubleshootingArticles,
      faqs: visibleFaqs,
    });
  });

  // 2. GET /api/v1/knowledge/articles
  fastify.get('/api/v1/knowledge/articles', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!canReadKnowledge(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Anda tidak memiliki akses ke Pusat Bantuan.'
      );
    }

    const query = (req.query || {}) as {
      q?: string;
      category?: string;
      tag?: string;
      role?: string;
      sort?: string;
    };

    const { articles } = await loadArticlesWithRelations({
      user,
      q: query.q,
      categorySlug: query.category,
      tagSlug: query.tag,
      roleFilter: query.role,
      sort: query.sort,
    });

    const userRoles = new Set(user.roles);
    const canManage = isSuperadminManager(user);
    const qLower = (query.q || '').trim().toLowerCase();

    let matchingFaqs: any[] = [];
    if (qLower) {
      const allFaqs = await db
        .select()
        .from(knowledgeFaqs)
        .where(eq(knowledgeFaqs.status, 'PUBLISHED'))
        .orderBy(asc(knowledgeFaqs.sortOrder));
      matchingFaqs = allFaqs.filter(
        (f) =>
          (canManage ||
            f.audienceRole === 'ALL' ||
            userRoles.has(f.audienceRole)) &&
          (f.question.toLowerCase().includes(qLower) ||
            f.answer.toLowerCase().includes(qLower))
      );
    }

    return sendSuccess(reply, {
      items: articles.map(({ content, contentJson, ...summary }) => summary),
      faqs: matchingFaqs,
      total: articles.length,
    });
  });

  // 3. GET /api/v1/knowledge/articles/:slug
  fastify.get('/api/v1/knowledge/articles/:slug', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!canReadKnowledge(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Anda tidak memiliki akses ke Pusat Bantuan.'
      );
    }

    await ensureKnowledgeCenterSeeded();
    const { slug } = req.params as { slug: string };
    const [article] = await db
      .select()
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.slug, slug));

    if (!article) {
      return sendError(
        reply,
        404,
        'ARTICLE_NOT_FOUND',
        'Artikel dokumentasi tidak ditemukan.'
      );
    }

    const canManage = isSuperadminManager(user);
    const roleRows = await db
      .select({ roleName: roles.code })
      .from(knowledgeArticleRoles)
      .innerJoin(roles, eq(knowledgeArticleRoles.roleId, roles.id))
      .where(eq(knowledgeArticleRoles.articleId, article.id));
    const allowedRoles = roleRows.map((r) => r.roleName);

    if (!canManage) {
      if (article.status !== 'PUBLISHED') {
        return sendError(
          reply,
          404,
          'ARTICLE_NOT_FOUND',
          'Artikel dokumentasi tidak ditemukan.'
        );
      }
      const hasRoleAccess = allowedRoles.some((r) => user.roles.includes(r));
      if (!hasRoleAccess) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Anda tidak memiliki otorisasi role untuk membaca panduan ini.'
        );
      }
    }

    // Increment view count
    await db
      .update(knowledgeArticles)
      .set({ viewCount: sql`${knowledgeArticles.viewCount} + 1` })
      .where(eq(knowledgeArticles.id, article.id));

    const [category] = await db
      .select()
      .from(knowledgeCategories)
      .where(eq(knowledgeCategories.id, article.categoryId));

    const tagRows = await db
      .select({
        id: knowledgeTags.id,
        name: knowledgeTags.name,
        slug: knowledgeTags.slug,
      })
      .from(knowledgeArticleTags)
      .innerJoin(knowledgeTags, eq(knowledgeArticleTags.tagId, knowledgeTags.id))
      .where(eq(knowledgeArticleTags.articleId, article.id));

    // Load accessible sibling articles in the same category for Prev/Next & Related
    const { articles: accessibleArticles } = await loadArticlesWithRelations({
      user,
    });
    const sameCategory = accessibleArticles.filter(
      (a) => a.categoryId === article.categoryId
    );
    const currentIndex = sameCategory.findIndex((a) => a.id === article.id);
    const previousArticle =
      currentIndex > 0
        ? {
            id: sameCategory[currentIndex - 1].id,
            slug: sameCategory[currentIndex - 1].slug,
            title: sameCategory[currentIndex - 1].title,
          }
        : null;
    const nextArticle =
      currentIndex >= 0 && currentIndex < sameCategory.length - 1
        ? {
            id: sameCategory[currentIndex + 1].id,
            slug: sameCategory[currentIndex + 1].slug,
            title: sameCategory[currentIndex + 1].title,
          }
        : null;

    const explicitRelatedIds = new Set(article.relatedArticleIds || []);
    const relatedArticles = accessibleArticles
      .filter(
        (a) =>
          a.id !== article.id &&
          (explicitRelatedIds.has(a.id) || a.categoryId === article.categoryId)
      )
      .slice(0, 4)
      .map(({ content, contentJson, ...summary }) => summary);

    const faqRows = await db
      .select()
      .from(knowledgeFaqs)
      .where(eq(knowledgeFaqs.status, 'PUBLISHED'))
      .orderBy(asc(knowledgeFaqs.sortOrder));
    const userRoles = new Set(user.roles);
    const relatedFaqs = faqRows
      .filter(
        (f) =>
          (f.categoryId === article.categoryId || f.audienceRole === 'ALL') &&
          (canManage ||
            f.audienceRole === 'ALL' ||
            userRoles.has(f.audienceRole))
      )
      .slice(0, 4);

    return sendSuccess(reply, {
      article: {
        ...article,
        viewCount: article.viewCount + 1,
        category: category || null,
        roles: allowedRoles,
        tags: tagRows,
      },
      previousArticle,
      nextArticle,
      relatedArticles,
      relatedFaqs,
    });
  });

  // 4. POST /api/v1/knowledge/articles/:id/feedback
  fastify.post(
    '/api/v1/knowledge/articles/:id/feedback',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;
      if (isAuditorUser(user)) {
        return sendError(
          reply,
          403,
          'AUDITOR_READ_ONLY',
          'Role Auditor bersifat read-only dan tidak dapat mengirimkan feedback.'
        );
      }

      const schema = z.object({ helpful: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Payload feedback tidak valid.'
        );
      }

      const { id } = req.params as { id: string };
      const [article] = await db
        .select()
        .from(knowledgeArticles)
        .where(eq(knowledgeArticles.id, id));
      if (!article) {
        return sendError(
          reply,
          404,
          'ARTICLE_NOT_FOUND',
          'Artikel tidak ditemukan.'
        );
      }

      const [updated] = await db
        .update(knowledgeArticles)
        .set(
          parsed.data.helpful
            ? { helpfulCount: sql`${knowledgeArticles.helpfulCount} + 1` }
            : { notHelpfulCount: sql`${knowledgeArticles.notHelpfulCount} + 1` }
        )
        .where(eq(knowledgeArticles.id, id))
        .returning({
          id: knowledgeArticles.id,
          helpfulCount: knowledgeArticles.helpfulCount,
          notHelpfulCount: knowledgeArticles.notHelpfulCount,
        });

      return sendSuccess(reply, updated);
    }
  );

  // ── SUPERADMIN KNOWLEDGE CENTER CMS ───────────────────────────────────────

  // 5. GET /api/v1/admin/knowledge/analytics
  fastify.get('/api/v1/admin/knowledge/analytics', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin yang dapat mengelola Knowledge Center.'
      );
    }

    await ensureKnowledgeCenterSeeded();
    const { articles, categories, tags } = await loadArticlesWithRelations({
      user,
      includeUnpublished: true,
    });

    const totalViews = articles.reduce((sum, a) => sum + a.viewCount, 0);
    const totalHelpful = articles.reduce((sum, a) => sum + a.helpfulCount, 0);
    const totalNotHelpful = articles.reduce(
      (sum, a) => sum + a.notHelpfulCount,
      0
    );

    const faqRows = await db
      .select()
      .from(knowledgeFaqs)
      .orderBy(asc(knowledgeFaqs.sortOrder));

    return sendSuccess(reply, {
      totalArticles: articles.length,
      publishedCount: articles.filter((a) => a.status === 'PUBLISHED').length,
      draftCount: articles.filter((a) => a.status === 'DRAFT').length,
      archivedCount: articles.filter((a) => a.status === 'ARCHIVED').length,
      totalCategories: categories.length,
      totalTags: tags.length,
      totalFaqs: faqRows.length,
      totalViews,
      totalHelpful,
      totalNotHelpful,
      topArticles: [...articles]
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          viewCount: a.viewCount,
          helpfulCount: a.helpfulCount,
          status: a.status,
        })),
    });
  });

  // 6. GET /api/v1/admin/knowledge/articles
  fastify.get('/api/v1/admin/knowledge/articles', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin yang dapat mengelola artikel Knowledge Center.'
      );
    }

    const query = (req.query || {}) as { q?: string; status?: string };
    const { articles, categories, tags } = await loadArticlesWithRelations({
      user,
      includeUnpublished: true,
      q: query.q,
    });

    const filtered =
      query.status && query.status !== 'ALL'
        ? articles.filter((a) => a.status === query.status)
        : articles;

    const faqs = await db
      .select()
      .from(knowledgeFaqs)
      .orderBy(asc(knowledgeFaqs.sortOrder));

    return sendSuccess(reply, {
      articles: filtered,
      categories,
      tags,
      faqs,
    });
  });

  const articleBodySchema = z.object({
    categoryId: z.string().uuid(),
    title: z.string().min(3),
    slug: z.string().optional(),
    excerpt: z.string().default(''),
    content: z.string().default(''),
    contentJson: z.record(z.string(), z.any()).nullable().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
    difficulty: z.enum(['PEMULA', 'MENENGAH', 'LANJUTAN']).default('PEMULA'),
    estimatedReadingMinutes: z.number().int().min(1).max(120).default(5),
    featuredImage: z.string().nullable().optional(),
    isFeatured: z.boolean().default(false),
    keywords: z.string().default(''),
    relatedArticleIds: z.array(z.string().uuid()).default([]),
    roles: z
      .array(z.enum(['SUPERADMIN', 'DOSEN', 'MAHASISWA', 'AUDITOR']))
      .min(1),
    tagIds: z.array(z.string().uuid()).default([]),
    changeSummary: z.string().optional(),
  });

  // 7. POST /api/v1/admin/knowledge/articles
  fastify.post('/api/v1/admin/knowledge/articles', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin yang dapat membuat artikel Knowledge Center.'
      );
    }

    const parsed = articleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data artikel tidak valid.',
        parsed.error.issues
      );
    }

    const data = parsed.data;
    const baseSlug = slugify(data.slug || data.title) || `artikel-${Date.now()}`;
    const [existingSlug] = await db
      .select({ id: knowledgeArticles.id })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.slug, baseSlug));
    const finalSlug = existingSlug ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

    const [created] = await db
      .insert(knowledgeArticles)
      .values({
        categoryId: data.categoryId,
        title: data.title,
        slug: finalSlug,
        excerpt: data.excerpt,
        content: data.content,
        contentJson: data.contentJson ?? null,
        status: data.status,
        difficulty: data.difficulty,
        estimatedReadingMinutes: data.estimatedReadingMinutes,
        featuredImage: data.featuredImage ?? null,
        isFeatured: data.isFeatured,
        keywords: data.keywords,
        relatedArticleIds: data.relatedArticleIds,
        version: 1,
        docVersionLabel: 'v1.0.0',
        createdBy: user.id,
        updatedBy: user.id,
        publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
      })
      .returning();

    const roleRows = await db.select().from(roles);
    const roleIdByName = new Map(roleRows.map((r) => [r.code, r.id]));
    for (const rName of data.roles) {
      const roleId = roleIdByName.get(rName);
      if (roleId) {
        await db
          .insert(knowledgeArticleRoles)
          .values({ articleId: created.id, roleId })
          .onConflictDoNothing();
      }
    }

    for (const tagId of data.tagIds) {
      await db
        .insert(knowledgeArticleTags)
        .values({ articleId: created.id, tagId })
        .onConflictDoNothing();
    }

    await db.insert(knowledgeArticleVersions).values({
      articleId: created.id,
      version: 1,
      contentSnapshot: {
        title: created.title,
        excerpt: created.excerpt,
        content: created.content,
        contentJson: created.contentJson,
        roles: data.roles,
      },
      changedBy: user.id,
      changeSummary: data.changeSummary || 'Pembuatan artikel awal',
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'KNOWLEDGE_ARTICLE_CREATED',
      entityType: 'KNOWLEDGE_ARTICLE',
      entityId: created.id,
      metadata: { title: created.title, status: created.status, roles: data.roles },
      ipAddress: req.ip,
    });

    reply.status(201);
    return sendSuccess(reply, created);
  });

  // 8. PUT /api/v1/admin/knowledge/articles/:id
  fastify.put('/api/v1/admin/knowledge/articles/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin yang dapat mengubah artikel Knowledge Center.'
      );
    }

    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, id));
    if (!existing) {
      return sendError(reply, 404, 'NOT_FOUND', 'Artikel tidak ditemukan.');
    }

    const parsed = articleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data artikel tidak valid.',
        parsed.error.issues
      );
    }

    const data = parsed.data;
    const nextVersion = existing.version + 1;
    const [updated] = await db
      .update(knowledgeArticles)
      .set({
        categoryId: data.categoryId,
        title: data.title,
        slug: data.slug ? slugify(data.slug) : existing.slug,
        excerpt: data.excerpt,
        content: data.content,
        contentJson: data.contentJson ?? existing.contentJson,
        status: data.status,
        difficulty: data.difficulty,
        estimatedReadingMinutes: data.estimatedReadingMinutes,
        featuredImage: data.featuredImage ?? null,
        isFeatured: data.isFeatured,
        keywords: data.keywords,
        relatedArticleIds: data.relatedArticleIds,
        version: nextVersion,
        updatedBy: user.id,
        publishedAt:
          data.status === 'PUBLISHED'
            ? existing.publishedAt || new Date()
            : existing.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeArticles.id, id))
      .returning();

    await db
      .delete(knowledgeArticleRoles)
      .where(eq(knowledgeArticleRoles.articleId, id));
    const roleRows = await db.select().from(roles);
    const roleIdByName = new Map(roleRows.map((r) => [r.code, r.id]));
    for (const rName of data.roles) {
      const roleId = roleIdByName.get(rName);
      if (roleId) {
        await db
          .insert(knowledgeArticleRoles)
          .values({ articleId: id, roleId })
          .onConflictDoNothing();
      }
    }

    await db
      .delete(knowledgeArticleTags)
      .where(eq(knowledgeArticleTags.articleId, id));
    for (const tagId of data.tagIds) {
      await db
        .insert(knowledgeArticleTags)
        .values({ articleId: id, tagId })
        .onConflictDoNothing();
    }

    await db.insert(knowledgeArticleVersions).values({
      articleId: id,
      version: nextVersion,
      contentSnapshot: {
        title: updated.title,
        excerpt: updated.excerpt,
        content: updated.content,
        contentJson: updated.contentJson,
        roles: data.roles,
      },
      changedBy: user.id,
      changeSummary: data.changeSummary || `Pembaruan artikel v${nextVersion}`,
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'KNOWLEDGE_ARTICLE_UPDATED',
      entityType: 'KNOWLEDGE_ARTICLE',
      entityId: id,
      metadata: { title: updated.title, version: nextVersion, status: updated.status },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, updated);
  });

  // 9. PATCH /api/v1/admin/knowledge/articles/:id/status
  fastify.patch(
    '/api/v1/admin/knowledge/articles/:id/status',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;
      if (!isSuperadminManager(user)) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Hanya Superadmin yang dapat mengubah status artikel.'
        );
      }

      const schema = z.object({
        status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Status tidak valid.');
      }

      const { id } = req.params as { id: string };
      const [updated] = await db
        .update(knowledgeArticles)
        .set({
          status: parsed.data.status,
          publishedAt:
            parsed.data.status === 'PUBLISHED' ? new Date() : undefined,
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeArticles.id, id))
        .returning();

      if (!updated) {
        return sendError(reply, 404, 'NOT_FOUND', 'Artikel tidak ditemukan.');
      }

      await recordAuditLog({
        actorId: user.id,
        action: 'KNOWLEDGE_ARTICLE_STATUS_CHANGED',
        entityType: 'KNOWLEDGE_ARTICLE',
        entityId: id,
        metadata: { status: parsed.data.status },
        ipAddress: req.ip,
      });

      return sendSuccess(reply, updated);
    }
  );

  // 10. DELETE /api/v1/admin/knowledge/articles/:id
  fastify.delete('/api/v1/admin/knowledge/articles/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin yang dapat menghapus artikel.'
      );
    }

    const { id } = req.params as { id: string };
    const [deleted] = await db
      .delete(knowledgeArticles)
      .where(eq(knowledgeArticles.id, id))
      .returning({ id: knowledgeArticles.id, title: knowledgeArticles.title });

    if (!deleted) {
      return sendError(reply, 404, 'NOT_FOUND', 'Artikel tidak ditemukan.');
    }

    await recordAuditLog({
      actorId: user.id,
      action: 'KNOWLEDGE_ARTICLE_DELETED',
      entityType: 'KNOWLEDGE_ARTICLE',
      entityId: id,
      metadata: { title: deleted.title },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, deleted);
  });

  // 11. GET /api/v1/admin/knowledge/articles/:id/versions
  fastify.get(
    '/api/v1/admin/knowledge/articles/:id/versions',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;
      if (!isSuperadminManager(user)) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Hanya Superadmin yang dapat melihat riwayat versi artikel.'
        );
      }

      const { id } = req.params as { id: string };
      const rows = await db
        .select({
          id: knowledgeArticleVersions.id,
          version: knowledgeArticleVersions.version,
          changeSummary: knowledgeArticleVersions.changeSummary,
          contentSnapshot: knowledgeArticleVersions.contentSnapshot,
          createdAt: knowledgeArticleVersions.createdAt,
          changedByName: users.fullName,
        })
        .from(knowledgeArticleVersions)
        .leftJoin(users, eq(knowledgeArticleVersions.changedBy, users.id))
        .where(eq(knowledgeArticleVersions.articleId, id))
        .orderBy(desc(knowledgeArticleVersions.version));

      return sendSuccess(reply, rows);
    }
  );

  // 12. Categories CRUD
  const categorySchema = z.object({
    name: z.string().min(2),
    slug: z.string().optional(),
    description: z.string().default(''),
    icon: z.string().default('BookOpen'),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
  });

  fastify.post('/api/v1/admin/knowledge/categories', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Kategori tidak valid.');
    }
    const slug = slugify(parsed.data.slug || parsed.data.name);
    const [created] = await db
      .insert(knowledgeCategories)
      .values({ ...parsed.data, slug })
      .returning();

    reply.status(201);
    return sendSuccess(reply, created);
  });

  fastify.put('/api/v1/admin/knowledge/categories/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Kategori tidak valid.');
    }
    const { id } = req.params as { id: string };
    const [updated] = await db
      .update(knowledgeCategories)
      .set({
        ...parsed.data,
        slug: parsed.data.slug ? slugify(parsed.data.slug) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeCategories.id, id))
      .returning();
    if (!updated) return sendError(reply, 404, 'NOT_FOUND', 'Kategori tidak ditemukan.');
    return sendSuccess(reply, updated);
  });

  fastify.delete(
    '/api/v1/admin/knowledge/categories/:id',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;
      if (!isSuperadminManager(user)) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
      }
      const { id } = req.params as { id: string };
      const [deleted] = await db
        .delete(knowledgeCategories)
        .where(eq(knowledgeCategories.id, id))
        .returning({ id: knowledgeCategories.id });
      if (!deleted) return sendError(reply, 404, 'NOT_FOUND', 'Kategori tidak ditemukan.');
      return sendSuccess(reply, deleted);
    }
  );

  // 13. Tags CRUD
  fastify.post('/api/v1/admin/knowledge/tags', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }
    const schema = z.object({ name: z.string().min(2) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Tag tidak valid.');
    }
    const slug = slugify(parsed.data.name);
    const [created] = await db
      .insert(knowledgeTags)
      .values({ name: parsed.data.name, slug })
      .returning();
    reply.status(201);
    return sendSuccess(reply, created);
  });

  fastify.delete('/api/v1/admin/knowledge/tags/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }
    const { id } = req.params as { id: string };
    const [deleted] = await db
      .delete(knowledgeTags)
      .where(eq(knowledgeTags.id, id))
      .returning({ id: knowledgeTags.id });
    if (!deleted) return sendError(reply, 404, 'NOT_FOUND', 'Tag tidak ditemukan.');
    return sendSuccess(reply, deleted);
  });

  // 14. FAQs CRUD
  const faqSchema = z.object({
    question: z.string().min(5),
    answer: z.string().min(5),
    categoryId: z.string().uuid().nullable().optional(),
    audienceRole: z
      .enum(['ALL', 'SUPERADMIN', 'DOSEN', 'MAHASISWA', 'AUDITOR'])
      .default('ALL'),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('PUBLISHED'),
    sortOrder: z.number().int().default(0),
  });

  fastify.post('/api/v1/admin/knowledge/faqs', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }
    const parsed = faqSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'FAQ tidak valid.');
    }
    const [created] = await db
      .insert(knowledgeFaqs)
      .values({
        ...parsed.data,
        categoryId: parsed.data.categoryId ?? null,
      })
      .returning();
    reply.status(201);
    return sendSuccess(reply, created);
  });

  fastify.put('/api/v1/admin/knowledge/faqs/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }
    const parsed = faqSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'FAQ tidak valid.');
    }
    const { id } = req.params as { id: string };
    const [updated] = await db
      .update(knowledgeFaqs)
      .set({
        ...parsed.data,
        categoryId: parsed.data.categoryId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeFaqs.id, id))
      .returning();
    if (!updated) return sendError(reply, 404, 'NOT_FOUND', 'FAQ tidak ditemukan.');
    return sendSuccess(reply, updated);
  });

  fastify.delete('/api/v1/admin/knowledge/faqs/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminManager(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }
    const { id } = req.params as { id: string };
    const [deleted] = await db
      .delete(knowledgeFaqs)
      .where(eq(knowledgeFaqs.id, id))
      .returning({ id: knowledgeFaqs.id });
    if (!deleted) return sendError(reply, 404, 'NOT_FOUND', 'FAQ tidak ditemukan.');
    return sendSuccess(reply, deleted);
  });
}
