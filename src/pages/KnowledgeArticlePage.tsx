import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Printer,
  ThumbsUp,
  ThumbsDown,
  ListTree,
  ChevronDown,
  BookOpen,
  Calendar,
  Tag,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Card, Button } from '../components/ui/primitives';
import { TiptapReadOnlyRenderer } from '../components/TiptapMaterialEditor';

function Badge({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode;
  tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClasses: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { isAuditorUser } from '../lib/authorization';

interface TocHeading {
  id: string;
  text: string;
  level: number;
}

function extractHeadingsFromArticle(
  contentJson: Record<string, any> | null,
  htmlContent: string
): TocHeading[] {
  const headings: TocHeading[] = [];
  if (contentJson && Array.isArray(contentJson.content)) {
    for (const node of contentJson.content) {
      if (node.type === 'heading' && Array.isArray(node.content)) {
        const text = node.content.map((c: any) => c.text || '').join('').trim();
        if (text) {
          headings.push({
            id: text
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, '')
              .replace(/\s+/g, '-'),
            text,
            level: node.attrs?.level || 2,
          });
        }
      }
    }
  } else if (htmlContent) {
    const matches = htmlContent.matchAll(/<h([23])[^>]*>(.*?)<\/h\1>/gi);
    for (const m of matches) {
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      if (text) {
        headings.push({
          id: text
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-'),
          text,
          level: Number(m[1]),
        });
      }
    }
  }
  return headings;
}

export function KnowledgeArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAuditor = isAuditorUser(user);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<'yes' | 'no' | null>(null);

  const articleQuery = useQuery({
    queryKey: ['knowledge-article', slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const res = await apiRequest<{
        article: {
          id: string;
          title: string;
          slug: string;
          excerpt: string;
          content: string;
          contentJson: Record<string, any> | null;
          difficulty: string;
          estimatedReadingMinutes: number;
          version: number;
          docVersionLabel: string;
          viewCount: number;
          helpfulCount: number;
          notHelpfulCount: number;
          updatedAt: string;
          category: { id: string; name: string; slug: string } | null;
          roles: string[];
          tags: { id: string; name: string; slug: string }[];
        };
        previousArticle: { id: string; slug: string; title: string } | null;
        nextArticle: { id: string; slug: string; title: string } | null;
        relatedArticles: {
          id: string;
          slug: string;
          title: string;
          excerpt: string;
          estimatedReadingMinutes: number;
        }[];
        relatedFaqs: { id: string; question: string; answer: string }[];
      }>(`/knowledge/articles/${slug}`);
      return res.data;
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (helpful: boolean) => {
      const res = await apiRequest<{
        id: string;
        helpfulCount: number;
        notHelpfulCount: number;
      }>(`/knowledge/articles/${articleQuery.data?.article.id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ helpful }),
      });
      return res.data;
    },
    onSuccess: (_data, helpful) => {
      setFeedbackSent(helpful ? 'yes' : 'no');
      toast.success('Terima kasih atas masukan Anda.');
      queryClient.invalidateQueries({ queryKey: ['knowledge-article', slug] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal mengirim feedback');
    },
  });

  const article = articleQuery.data?.article;
  const toc = useMemo(
    () =>
      article
        ? extractHeadingsFromArticle(article.contentJson, article.content)
        : [],
    [article]
  );

  return (
    <AppShell breadcrumb="Pusat Bantuan / Detail Panduan">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Bar Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link to="/help">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Knowledge Center
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5"
          >
            <Printer className="w-4 h-4" />
            Cetak Artikel
          </Button>
        </div>

        {articleQuery.isLoading ? (
          <Card className="p-10 text-center text-sm text-slate-500">
            Memuat panduan dokumentasi...
          </Card>
        ) : articleQuery.isError || !article ? (
          <Card className="p-10 text-center space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              Panduan Tidak Dapat Diakses atau Tidak Ditemukan
            </h2>
            <p className="text-xs text-slate-600">
              {(articleQuery.error as any)?.message ||
                'Artikel tidak tersedia untuk role akun Anda saat ini.'}
            </p>
            <Link to="/help">
              <Button size="sm">Kembali ke Pusat Bantuan</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Article Column */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-5 min-w-0">
              <Card className="p-5 sm:p-8 space-y-5">
                {/* Breadcrumb */}
                <nav className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <Link to="/help" className="hover:text-slate-900 font-medium">
                    Knowledge Center
                  </Link>
                  <span>/</span>
                  {article.category && (
                    <>
                      <Link
                        to={`/help?category=${article.category.slug}`}
                        className="hover:text-slate-900 font-medium"
                      >
                        {article.category.name}
                      </Link>
                      <span>/</span>
                    </>
                  )}
                  <span className="text-slate-800 font-semibold truncate">
                    {article.title}
                  </span>
                </nav>

                {/* Title & Summary */}
                <div className="space-y-3 border-b border-slate-100 pb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {article.category && (
                      <Badge tone="blue">{article.category.name}</Badge>
                    )}
                    <Badge tone="emerald">{article.difficulty}</Badge>
                    <Badge tone="slate">
                      {article.docVersionLabel} (Rev {article.version})
                    </Badge>
                    {article.roles.map((r) => (
                      <Badge key={r} tone="slate">
                        Role: {r}
                      </Badge>
                    ))}
                  </div>

                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {article.title}
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {article.excerpt}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Estimasi {article.estimatedReadingMinutes} menit baca
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Diperbarui:{' '}
                      {new Date(article.updatedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      {article.viewCount} kali dibaca
                    </span>
                  </div>
                </div>

                {/* Mobile Collapsible TOC */}
                {toc.length > 0 && (
                  <div className="lg:hidden border border-slate-200 rounded-lg bg-slate-50 p-3">
                    <button
                      type="button"
                      onClick={() => setMobileTocOpen((p) => !p)}
                      className="w-full flex items-center justify-between text-xs font-bold text-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <ListTree className="w-4 h-4" />
                        Daftar Isi Artikel
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          mobileTocOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {mobileTocOpen && (
                      <ul className="mt-2.5 space-y-1.5 border-t border-slate-200 pt-2">
                        {toc.map((h, i) => (
                          <li
                            key={i}
                            className={`text-xs text-slate-600 ${
                              h.level === 3 ? 'pl-3' : 'font-medium'
                            }`}
                          >
                            • {h.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Article Rich Content */}
                <div className="prose prose-slate max-w-none prose-sm sm:prose-base">
                  <TiptapReadOnlyRenderer
                    contentJson={
                      article.contentJson ?? { type: 'doc', content: [] }
                    }
                    fallbackHtml={article.content}
                  />
                </div>

                {/* Tags */}
                {article.tags.length > 0 && (
                  <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" /> Tag:
                    </span>
                    {article.tags.map((t) => (
                      <Link
                        key={t.id}
                        to={`/help?tag=${t.slug}`}
                        className="px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-700 hover:bg-slate-200"
                      >
                        #{t.name}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Feedback Section (Read-Only Guard for Auditor) */}
                <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Apakah panduan ini membantu?
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isAuditor
                        ? 'Mode Auditor Read-Only: pengiriman feedback dinonaktifkan.'
                        : `${article.helpfulCount} pengguna merasa terbantu`}
                    </p>
                  </div>
                  {!isAuditor && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={feedbackSent === 'yes' ? 'default' : 'outline'}
                        disabled={
                          feedbackSent !== null || feedbackMutation.isPending
                        }
                        onClick={() => feedbackMutation.mutate(true)}
                        className="gap-1.5"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        Ya, Membantu
                      </Button>
                      <Button
                        size="sm"
                        variant={feedbackSent === 'no' ? 'default' : 'outline'}
                        disabled={
                          feedbackSent !== null || feedbackMutation.isPending
                        }
                        onClick={() => feedbackMutation.mutate(false)}
                        className="gap-1.5"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        Perlu Perbaikan
                      </Button>
                    </div>
                  )}
                </div>
              </Card>

              {/* Prev / Next Navigation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:hidden">
                {articleQuery.data?.previousArticle ? (
                  <Link
                    to={`/help/${articleQuery.data.previousArticle.slug}`}
                    className="block"
                  >
                    <Card className="p-4 hover:border-slate-400 transition-colors h-full">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
                      </span>
                      <p className="mt-1 text-xs font-bold text-slate-900 line-clamp-1">
                        {articleQuery.data.previousArticle.title}
                      </p>
                    </Card>
                  </Link>
                ) : (
                  <div />
                )}

                {articleQuery.data?.nextArticle && (
                  <Link
                    to={`/help/${articleQuery.data.nextArticle.slug}`}
                    className="block"
                  >
                    <Card className="p-4 hover:border-slate-400 transition-colors h-full text-right">
                      <span className="text-[11px] text-slate-500 inline-flex items-center gap-1 justify-end">
                        Selanjutnya <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                      <p className="mt-1 text-xs font-bold text-slate-900 line-clamp-1">
                        {articleQuery.data.nextArticle.title}
                      </p>
                    </Card>
                  </Link>
                )}
              </div>

              {/* Related FAQs */}
              {(articleQuery.data?.relatedFaqs || []).length > 0 && (
                <Card className="p-5 space-y-3">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-blue-600" />
                    FAQ Terkait
                  </h2>
                  <div className="divide-y divide-slate-100">
                    {articleQuery.data!.relatedFaqs.map((faq) => (
                      <div key={faq.id} className="py-2.5 first:pt-0 last:pb-0">
                        <p className="text-xs font-bold text-slate-800">
                          {faq.question}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {faq.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Right Sticky Sidebar: Table of Contents & Related Articles */}
            <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 space-y-4 sticky top-20 print:hidden">
              {toc.length > 0 && (
                <Card className="p-4 space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <ListTree className="w-3.5 h-3.5" />
                    Daftar Isi
                  </h2>
                  <ul className="space-y-1.5">
                    {toc.map((h, idx) => (
                      <li
                        key={idx}
                        className={`text-xs text-slate-600 ${
                          h.level === 3 ? 'pl-3' : 'font-medium text-slate-800'
                        }`}
                      >
                        • {h.text}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {(articleQuery.data?.relatedArticles || []).length > 0 && (
                <Card className="p-4 space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Artikel Terkait
                  </h2>
                  <div className="space-y-2.5">
                    {articleQuery.data!.relatedArticles.map((rel) => (
                      <Link
                        key={rel.id}
                        to={`/help/${rel.slug}`}
                        className="block group"
                      >
                        <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-700 line-clamp-2">
                          {rel.title}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {rel.estimatedReadingMinutes} menit baca
                        </p>
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}
