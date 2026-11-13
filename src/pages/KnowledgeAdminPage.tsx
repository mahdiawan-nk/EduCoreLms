import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit3,
  Trash2,
  Eye,
  History,
  CheckCircle2,
  Archive,
  FileText,
  FolderOpen,
  Tag,
  HelpCircle,
  BarChart3,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import {
  Card,
  Button,
  Input,
  ModalDialog,
} from '../components/ui/primitives';

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
import {
  TiptapMaterialEditor,
  TiptapReadOnlyRenderer,
} from '../components/TiptapMaterialEditor';
import { apiRequest } from '../lib/api';

type AdminTab = 'articles' | 'categories' | 'tags' | 'faqs' | 'analytics';
type RoleCode = 'SUPERADMIN' | 'DOSEN' | 'MAHASISWA' | 'AUDITOR';

export function KnowledgeAdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AdminTab>('articles');
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Article Editor Modal State
  const [articleModalOpen, setArticleModalOpen] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [difficulty, setDifficulty] = useState<'PEMULA' | 'MENENGAH' | 'LANJUTAN'>('PEMULA');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');
  const [estimatedReadingMinutes, setEstimatedReadingMinutes] = useState(5);
  const [isFeatured, setIsFeatured] = useState(false);
  const [keywords, setKeywords] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>(['SUPERADMIN']);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [contentJson, setContentJson] = useState<Record<string, any>>({
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
  const [contentHtml, setContentHtml] = useState('');
  const [changeSummary, setChangeSummary] = useState('');

  // Version History Modal
  const [versionModalArticleId, setVersionModalArticleId] = useState<string | null>(
    null
  );

  // Category / Tag / FAQ Modals
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqAudience, setFaqAudience] = useState<
    'ALL' | 'SUPERADMIN' | 'DOSEN' | 'MAHASISWA' | 'AUDITOR'
  >('ALL');

  const adminQuery = useQuery({
    queryKey: ['admin-knowledge', searchQ, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQ.trim()) params.set('q', searchQ.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await apiRequest<{
        articles: any[];
        categories: any[];
        tags: any[];
        faqs: any[];
      }>(`/admin/knowledge/articles?${params.toString()}`);
      return res.data;
    },
  });

  const analyticsQuery = useQuery({
    queryKey: ['admin-knowledge-analytics'],
    enabled: activeTab === 'analytics',
    queryFn: async () => {
      const res = await apiRequest<any>('/admin/knowledge/analytics');
      return res.data;
    },
  });

  const versionsQuery = useQuery({
    queryKey: ['admin-knowledge-versions', versionModalArticleId],
    enabled: Boolean(versionModalArticleId),
    queryFn: async () => {
      const res = await apiRequest<any[]>(
        `/admin/knowledge/articles/${versionModalArticleId}/versions`
      );
      return res.data;
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-knowledge'] });
    queryClient.invalidateQueries({ queryKey: ['admin-knowledge-analytics'] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-overview'] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-articles'] });
  };

  const saveArticleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        categoryId,
        title,
        slug: slug || undefined,
        excerpt,
        content: contentHtml,
        contentJson,
        status,
        difficulty,
        estimatedReadingMinutes: Number(estimatedReadingMinutes) || 5,
        isFeatured,
        keywords,
        roles: selectedRoles,
        tagIds: selectedTagIds,
        changeSummary: changeSummary || undefined,
      };
      if (editingArticleId) {
        return apiRequest(`/admin/knowledge/articles/${editingArticleId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      return apiRequest('/admin/knowledge/articles', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(
        editingArticleId
          ? 'Artikel berhasil diperbarui.'
          : 'Artikel baru berhasil dibuat.'
      );
      setArticleModalOpen(false);
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || 'Gagal menyimpan artikel'),
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      nextStatus,
    }: {
      id: string;
      nextStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    }) =>
      apiRequest(`/admin/knowledge/articles/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      }),
    onSuccess: () => {
      toast.success('Status artikel diperbarui.');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || 'Gagal mengubah status'),
  });

  const deleteArticleMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/admin/knowledge/articles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Artikel dihapus.');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || 'Gagal menghapus artikel'),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () =>
      apiRequest('/admin/knowledge/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCatName,
          description: newCatDesc,
          sortOrder: (adminQuery.data?.categories.length || 0) + 1,
        }),
      }),
    onSuccess: () => {
      toast.success('Kategori ditambahkan.');
      setNewCatName('');
      setNewCatDesc('');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || 'Gagal menambah kategori'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/admin/knowledge/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Kategori dihapus.');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || 'Gagal menghapus kategori'),
  });

  const createTagMutation = useMutation({
    mutationFn: async () =>
      apiRequest('/admin/knowledge/tags', {
        method: 'POST',
        body: JSON.stringify({ name: newTagName }),
      }),
    onSuccess: () => {
      toast.success('Tag ditambahkan.');
      setNewTagName('');
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || 'Gagal menambah tag'),
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/admin/knowledge/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Tag dihapus.');
      invalidateAll();
    },
  });

  const saveFaqMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        question: faqQuestion,
        answer: faqAnswer,
        audienceRole: faqAudience,
        status: 'PUBLISHED',
      };
      if (editingFaqId) {
        return apiRequest(`/admin/knowledge/faqs/${editingFaqId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      return apiRequest('/admin/knowledge/faqs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success('FAQ tersimpan.');
      setFaqModalOpen(false);
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || 'Gagal menyimpan FAQ'),
  });

  const deleteFaqMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/admin/knowledge/faqs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('FAQ dihapus.');
      invalidateAll();
    },
  });

  const openCreateArticle = () => {
    setEditingArticleId(null);
    setPreviewMode(false);
    setTitle('');
    setSlug('');
    setCategoryId(adminQuery.data?.categories[0]?.id || '');
    setExcerpt('');
    setDifficulty('PEMULA');
    setStatus('DRAFT');
    setEstimatedReadingMinutes(5);
    setIsFeatured(false);
    setKeywords('');
    setSelectedRoles(['SUPERADMIN', 'DOSEN', 'MAHASISWA', 'AUDITOR']);
    setSelectedTagIds([]);
    setContentJson({ type: 'doc', content: [{ type: 'paragraph' }] });
    setContentHtml('');
    setChangeSummary('');
    setArticleModalOpen(true);
  };

  const openEditArticle = (art: any) => {
    setEditingArticleId(art.id);
    setPreviewMode(false);
    setTitle(art.title);
    setSlug(art.slug);
    setCategoryId(art.categoryId);
    setExcerpt(art.excerpt || '');
    setDifficulty(art.difficulty || 'PEMULA');
    setStatus(art.status || 'DRAFT');
    setEstimatedReadingMinutes(art.estimatedReadingMinutes || 5);
    setIsFeatured(Boolean(art.isFeatured));
    setKeywords(art.keywords || '');
    setSelectedRoles(
      art.roles?.length ? art.roles : ['SUPERADMIN']
    );
    setSelectedTagIds((art.tags || []).map((t: any) => t.id));
    setContentJson(
      art.contentJson || { type: 'doc', content: [{ type: 'paragraph' }] }
    );
    setContentHtml(art.content || '');
    setChangeSummary('');
    setArticleModalOpen(true);
  };

  const toggleRole = (role: RoleCode) => {
    setSelectedRoles((prev) =>
      prev.includes(role)
        ? prev.length > 1
          ? prev.filter((r) => r !== role)
          : prev
        : [...prev, role]
    );
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <AppShell breadcrumb="Sistem & Keamanan / Kelola Knowledge Center">
      <div className="max-w-7xl mx-auto space-y-5">
        <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                to="/help"
                className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Lihat Halaman Publik (/help)
              </Link>
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Manajemen Knowledge Center (CMS)
            </h1>
            <p className="text-xs text-slate-600">
              Kelola artikel panduan, kategori, tag, FAQ, audiens role, dan analitik dokumentasi EduCoreLMS.
            </p>
          </div>

          <Button onClick={openCreateArticle} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Buat Artikel Baru
          </Button>
        </Card>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'articles', label: 'Artikel', icon: FileText },
            { id: 'categories', label: 'Kategori', icon: FolderOpen },
            { id: 'tags', label: 'Tag', icon: Tag },
            { id: 'faqs', label: 'FAQ', icon: HelpCircle },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Articles */}
        {activeTab === 'articles' && (
          <Card className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Cari judul atau kata kunci artikel..."
                  className="pl-9"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
              >
                <option value="ALL">Semua Status</option>
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="DRAFT">DRAFT</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-semibold">Judul Artikel</th>
                    <th className="py-2.5 px-3 font-semibold">Kategori</th>
                    <th className="py-2.5 px-3 font-semibold">Audiens Role</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Views</th>
                    <th className="py-2.5 pl-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(adminQuery.data?.articles || []).map((art) => (
                    <tr key={art.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3">
                        <p className="font-bold text-slate-900">{art.title}</p>
                        <p className="text-[11px] text-slate-500">
                          /{art.slug} • v{art.version}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        {art.category?.name || '-'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {(art.roles || []).map((r: string) => (
                            <Badge key={r} tone="slate">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          tone={
                            art.status === 'PUBLISHED'
                              ? 'emerald'
                              : art.status === 'DRAFT'
                              ? 'amber'
                              : 'slate'
                          }
                        >
                          {art.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{art.viewCount}</td>
                      <td className="py-3 pl-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link to={`/help/${art.slug}`} title="Lihat Artikel">
                            <Button variant="outline" size="sm">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            title="Edit Artikel"
                            onClick={() => openEditArticle(art)}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            title="Riwayat Versi"
                            onClick={() => setVersionModalArticleId(art.id)}
                          >
                            <History className="w-3.5 h-3.5" />
                          </Button>
                          {art.status !== 'PUBLISHED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Publikasikan"
                              onClick={() =>
                                statusMutation.mutate({
                                  id: art.id,
                                  nextStatus: 'PUBLISHED',
                                })
                              }
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            </Button>
                          )}
                          {art.status !== 'ARCHIVED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Arsipkan"
                              onClick={() =>
                                statusMutation.mutate({
                                  id: art.id,
                                  nextStatus: 'ARCHIVED',
                                })
                              }
                            >
                              <Archive className="w-3.5 h-3.5 text-amber-600" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            title="Hapus"
                            onClick={() => deleteArticleMutation.mutate(art.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Tab 2: Categories */}
        {activeTab === 'categories' && (
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Kategori
                </label>
                <Input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Contoh: Panduan Praktikum"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Deskripsi Singkat
                </label>
                <Input
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Deskripsi kategori..."
                />
              </div>
              <Button
                disabled={!newCatName.trim() || createCategoryMutation.isPending}
                onClick={() => createCategoryMutation.mutate()}
              >
                Tambah Kategori
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {(adminQuery.data?.categories || []).map((cat) => (
                <div
                  key={cat.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{cat.name}</p>
                    <p className="text-xs text-slate-500">
                      /{cat.slug} — {cat.description}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteCategoryMutation.mutate(cat.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tab 3: Tags */}
        {activeTab === 'tags' && (
          <Card className="p-5 space-y-4">
            <div className="flex gap-2 max-w-md">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nama tag baru..."
              />
              <Button
                disabled={!newTagName.trim() || createTagMutation.isPending}
                onClick={() => createTagMutation.mutate()}
              >
                Tambah Tag
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(adminQuery.data?.tags || []).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium text-slate-800"
                >
                  #{tag.name}
                  <button
                    type="button"
                    onClick={() => deleteTagMutation.mutate(tag.id)}
                    className="text-rose-600 hover:text-rose-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Tab 4: FAQs */}
        {activeTab === 'faqs' && (
          <Card className="p-5 space-y-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  setEditingFaqId(null);
                  setFaqQuestion('');
                  setFaqAnswer('');
                  setFaqAudience('ALL');
                  setFaqModalOpen(true);
                }}
              >
                + Tambah FAQ
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {(adminQuery.data?.faqs || []).map((faq) => (
                <div
                  key={faq.id}
                  className="py-3 flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="blue">{faq.audienceRole}</Badge>
                      <p className="text-sm font-bold text-slate-900">
                        {faq.question}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600">{faq.answer}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingFaqId(faq.id);
                        setFaqQuestion(faq.question);
                        setFaqAnswer(faq.answer);
                        setFaqAudience(faq.audienceRole);
                        setFaqModalOpen(true);
                      }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteFaqMutation.mutate(faq.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tab 5: Analytics */}
        {activeTab === 'analytics' && analyticsQuery.data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-slate-500">Total Artikel</p>
              <p className="text-2xl font-bold text-slate-900">
                {analyticsQuery.data.totalArticles}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {analyticsQuery.data.publishedCount} Published •{' '}
                {analyticsQuery.data.draftCount} Draft
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Total Pembacaan (Views)</p>
              <p className="text-2xl font-bold text-slate-900">
                {analyticsQuery.data.totalViews}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Feedback Membantu</p>
              <p className="text-2xl font-bold text-emerald-700">
                {analyticsQuery.data.totalHelpful}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Kategori & FAQ</p>
              <p className="text-2xl font-bold text-slate-900">
                {analyticsQuery.data.totalCategories} /{' '}
                {analyticsQuery.data.totalFaqs}
              </p>
            </Card>
          </div>
        )}
      </div>

      {/* Article Create/Edit Modal */}
      <ModalDialog
        open={articleModalOpen}
        onClose={() => setArticleModalOpen(false)}
        title={
          editingArticleId
            ? 'Edit Artikel Knowledge Center'
            : 'Buat Artikel Knowledge Center'
        }
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewMode((p) => !p)}
            >
              {previewMode ? 'Kembali ke Editor' : 'Pratinjau Rendering'}
            </Button>
          </div>

          {previewMode ? (
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-3">
              <h2 className="text-lg font-bold text-slate-900">{title || '(Tanpa Judul)'}</h2>
              <p className="text-xs text-slate-600">{excerpt}</p>
              <div className="prose prose-slate max-w-none prose-sm">
                <TiptapReadOnlyRenderer
                  contentJson={contentJson}
                  fallbackHtml={contentHtml}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Judul Artikel
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Judul panduan..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kategori
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs"
                  >
                    {(adminQuery.data?.categories || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ringkasan Singkat
                </label>
                <Input
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Ringkasan isi panduan..."
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="PUBLISHED">PUBLISHED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kesulitan
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    <option value="PEMULA">PEMULA</option>
                    <option value="MENENGAH">MENENGAH</option>
                    <option value="LANJUTAN">LANJUTAN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Waktu Baca (menit)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={estimatedReadingMinutes}
                    onChange={(e) =>
                      setEstimatedReadingMinutes(Number(e.target.value))
                    }
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={isFeatured}
                      onChange={(e) => setIsFeatured(e.target.checked)}
                    />
                    Panduan Unggulan
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Role Audience (Hak Akses Pembaca)
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['SUPERADMIN', 'DOSEN', 'MAHASISWA', 'AUDITOR'] as RoleCode[]).map(
                    (role) => (
                      <label
                        key={role}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRoles.includes(role)}
                          onChange={() => toggleRole(role)}
                        />
                        {role}
                      </label>
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tag & Kata Kunci Pencarian
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(adminQuery.data?.tags || []).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={`px-2 py-0.5 rounded-full text-[11px] border ${
                        selectedTagIds.includes(t.id)
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      #{t.name}
                    </button>
                  ))}
                </div>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Kata kunci tambahan dipisahkan spasi..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Konten Dokumentasi (Tiptap Rich Editor)
                </label>
                <TiptapMaterialEditor
                  contentJson={contentJson}
                  onChange={(json, html) => {
                    setContentJson(json);
                    setContentHtml(html);
                  }}
                />
              </div>

              {editingArticleId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Perubahan Versi
                  </label>
                  <Input
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="Contoh: Memperbarui langkah Step 3 Wizard..."
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => setArticleModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              disabled={
                !title.trim() || !categoryId || saveArticleMutation.isPending
              }
              onClick={() => saveArticleMutation.mutate()}
            >
              {saveArticleMutation.isPending ? 'Menyimpan...' : 'Simpan Artikel'}
            </Button>
          </div>
        </div>
      </ModalDialog>

      {/* Version History Modal */}
      <ModalDialog
        open={Boolean(versionModalArticleId)}
        onClose={() => setVersionModalArticleId(null)}
        title="Riwayat Versi Artikel"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3">
          {(versionsQuery.data || []).map((v) => (
            <div
              key={v.id}
              className="p-3 rounded-lg border border-slate-200 text-xs space-y-1"
            >
              <div className="flex items-center justify-between">
                <Badge tone="blue">Versi {v.version}</Badge>
                <span className="text-slate-400">
                  {new Date(v.createdAt).toLocaleString('id-ID')}
                </span>
              </div>
              <p className="font-semibold text-slate-800">{v.changeSummary}</p>
              {v.changedByName && (
                <p className="text-slate-500">Oleh: {v.changedByName}</p>
              )}
            </div>
          ))}
        </div>
      </ModalDialog>

      {/* FAQ Modal */}
      <ModalDialog
        open={faqModalOpen}
        onClose={() => setFaqModalOpen(false)}
        title={editingFaqId ? 'Edit FAQ' : 'Tambah FAQ'}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Role
            </label>
            <select
              value={faqAudience}
              onChange={(e) => setFaqAudience(e.target.value as any)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
            >
              <option value="ALL">Semua Role</option>
              <option value="SUPERADMIN">SUPERADMIN</option>
              <option value="DOSEN">DOSEN</option>
              <option value="MAHASISWA">MAHASISWA</option>
              <option value="AUDITOR">AUDITOR</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pertanyaan
            </label>
            <Input
              value={faqQuestion}
              onChange={(e) => setFaqQuestion(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Jawaban
            </label>
            <textarea
              rows={4}
              value={faqAnswer}
              onChange={(e) => setFaqAnswer(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFaqModalOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={
                !faqQuestion.trim() ||
                !faqAnswer.trim() ||
                saveFaqMutation.isPending
              }
              onClick={() => saveFaqMutation.mutate()}
            >
              Simpan FAQ
            </Button>
          </div>
        </div>
      </ModalDialog>
    </AppShell>
  );
}
