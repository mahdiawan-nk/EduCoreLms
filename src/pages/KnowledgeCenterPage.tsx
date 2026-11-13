import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Search,
  Sparkles,
  Clock,
  ChevronDown,
  ChevronRight,
  Compass,
  ShieldCheck,
  GraduationCap,
  Eye,
  AlertTriangle,
  SlidersHorizontal,
  X,
  FileText,
  Tag,
  HelpCircle,
  Settings2,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Card, Button, Input } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';

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

interface KnowledgeCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
  articleCount: number;
}

interface KnowledgeTag {
  id: string;
  name: string;
  slug: string;
}

interface KnowledgeArticleSummary {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  difficulty: 'PEMULA' | 'MENENGAH' | 'LANJUTAN';
  estimatedReadingMinutes: number;
  isFeatured: boolean;
  keywords: string;
  version: number;
  docVersionLabel: string;
  viewCount: number;
  helpfulCount: number;
  updatedAt: string;
  category: { id: string; name: string; slug: string; icon: string } | null;
  roles: string[];
  tags: KnowledgeTag[];
}

interface KnowledgeFaq {
  id: string;
  question: string;
  answer: string;
  categoryId: string | null;
  audienceRole: string;
}

interface KnowledgeOverviewResponse {
  documentationVersion: string;
  activeRoles: string[];
  canManage: boolean;
  isReadOnlyAuditor: boolean;
  totalArticles: number;
  categories: KnowledgeCategory[];
  tags: KnowledgeTag[];
  popularArticles: KnowledgeArticleSummary[];
  latestArticles: KnowledgeArticleSummary[];
  troubleshootingArticles: KnowledgeArticleSummary[];
  faqs: KnowledgeFaq[];
}

function getCategoryIcon(iconName: string) {
  switch (iconName) {
    case 'Compass':
      return Compass;
    case 'ShieldCheck':
      return ShieldCheck;
    case 'GraduationCap':
      return GraduationCap;
    case 'Eye':
      return Eye;
    default:
      return BookOpen;
  }
}

function highlightText(text: string, query: string): React.ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const terms = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (terms.length === 0) return text;

  const regex = new RegExp(`(${terms.join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    regex.test(part) ? (
      <mark
        key={idx}
        className="bg-amber-200/80 text-slate-900 px-0.5 rounded-xs font-semibold"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

function difficultyBadgeTone(diff: string): 'emerald' | 'amber' | 'rose' {
  if (diff === 'PEMULA') return 'emerald';
  if (diff === 'MENENGAH') return 'amber';
  return 'rose';
}

export function KnowledgeCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get('category') || ''
  );
  const [selectedTag, setSelectedTag] = useState(searchParams.get('tag') || '');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState(
    searchParams.get('role') || 'ALL'
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['knowledge-overview'],
    queryFn: async () => {
      const res = await apiRequest<KnowledgeOverviewResponse>('/knowledge/overview');
      return res.data;
    },
  });

  const hasActiveFilter =
    Boolean(searchInput.trim()) ||
    Boolean(selectedCategory) ||
    Boolean(selectedTag) ||
    selectedRoleFilter !== 'ALL';

  const articlesQuery = useQuery({
    queryKey: [
      'knowledge-articles',
      searchInput.trim(),
      selectedCategory,
      selectedTag,
      selectedRoleFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchInput.trim()) params.set('q', searchInput.trim());
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedTag) params.set('tag', selectedTag);
      if (selectedRoleFilter !== 'ALL') params.set('role', selectedRoleFilter);
      const res = await apiRequest<{
        items: KnowledgeArticleSummary[];
        faqs: KnowledgeFaq[];
        total: number;
      }>(`/knowledge/articles?${params.toString()}`);
      return res.data;
    },
  });

  const overview = overviewQuery.data;
  const filteredArticles = articlesQuery.data?.items || [];
  const matchingFaqs = articlesQuery.data?.faqs || [];

  const handleSelectCategory = (slug: string) => {
    const next = selectedCategory === slug ? '' : slug;
    setSelectedCategory(next);
    const params = new URLSearchParams(searchParams);
    if (next) params.set('category', next);
    else params.delete('category');
    setSearchParams(params, { replace: true });
    setMobileFiltersOpen(false);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSelectedCategory('');
    setSelectedTag('');
    setSelectedRoleFilter('ALL');
    setSearchParams({}, { replace: true });
  };

  const roleBadgeLabel = useMemo(() => {
    if (!overview?.activeRoles?.length) return 'Pengguna';
    return overview.activeRoles.join(', ');
  }, [overview?.activeRoles]);

  return (
    <AppShell breadcrumb="Pusat Bantuan & Knowledge Center">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Hero Header */}
        <Card className="p-5 sm:p-7 border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--theme-primary)',
                    color: 'var(--primary-button-text, #ffffff)',
                  }}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Dokumentasi Resmi
                </span>
                <Badge tone="slate">
                  Versi {overview?.documentationVersion || 'v1.0.0'}
                </Badge>
                <Badge tone="blue">Akses Role: {roleBadgeLabel}</Badge>
                {overview?.isReadOnlyAuditor && (
                  <Badge tone="amber">Mode Auditor (Read-Only)</Badge>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                EduCoreLMS Knowledge Center
              </h1>
              <p className="text-sm text-slate-600 max-w-2xl">
                Pusat panduan penggunaan sistem pembelajaran digital Politeknik Kampar.
              </p>
            </div>

            {overview?.canManage && (
              <div className="shrink-0">
                <Link to="/admin/help">
                  <Button size="sm" className="gap-2">
                    <Settings2 className="w-4 h-4" />
                    Kelola Knowledge Center
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="mt-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari panduan berdasarkan judul, modul, kata kunci, isi artikel, atau FAQ..."
              className="pl-10 pr-10 h-11 text-sm"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label="Hapus pencarian"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Mobile Category & Filter Accordion Toggle */}
          <div className="mt-4 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                Kategori & Filter Dokumentasi
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  mobileFiltersOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </Card>

        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Sidebar: Categories, Role Filter, Tags */}
          <aside
            className={`lg:col-span-4 xl:col-span-3 space-y-4 ${
              mobileFiltersOpen ? 'block' : 'hidden lg:block'
            }`}
          >
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Kategori Panduan
                </h2>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    Reset Filter
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleSelectCategory('')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    !selectedCategory
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    Semua Kategori
                  </span>
                  <span className="text-[11px] opacity-80">
                    {overview?.totalArticles ?? 0}
                  </span>
                </button>

                {(overview?.categories || []).map((cat) => {
                  const Icon = getCategoryIcon(cat.icon);
                  const active = selectedCategory === cat.slug;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat.slug)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{cat.name}</span>
                      </span>
                      <span className="text-[11px] opacity-80 shrink-0 ml-2">
                        {cat.articleCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>

            {overview?.canManage && (
              <Card className="p-4 space-y-2.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Filter Audiens Role
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {['ALL', 'SUPERADMIN', 'DOSEN', 'MAHASISWA', 'AUDITOR'].map(
                    (r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setSelectedRoleFilter(r)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                          selectedRoleFilter === r
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {r === 'ALL' ? 'Semua Role' : r}
                      </button>
                    )
                  )}
                </div>
              </Card>
            )}

            {(overview?.tags || []).length > 0 && (
              <Card className="p-4 space-y-2.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  Topik & Tag
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {(overview?.tags || []).map((tag) => {
                    const active = selectedTag === tag.slug;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setSelectedTag(active ? '' : tag.slug)
                        }
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        #{tag.name}
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}
          </aside>

          {/* Right Main Content */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6 min-w-0">
            {/* Filtered / Search Results Section */}
            {hasActiveFilter ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Hasil Pencarian & Filter ({filteredArticles.length} artikel)
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearFilters}
                  >
                    Tampilkan Semua
                  </Button>
                </div>

                {articlesQuery.isLoading ? (
                  <Card className="p-8 text-center text-sm text-slate-500">
                    Memuat hasil pencarian dokumentasi...
                  </Card>
                ) : filteredArticles.length === 0 ? (
                  <Card className="p-8 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Tidak ada artikel yang cocok dengan kata kunci atau filter Anda.
                    </p>
                    <p className="text-xs text-slate-500">
                      Coba kata kunci yang lebih umum atau reset filter kategori.
                    </p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredArticles.map((article) => (
                      <Link
                        key={article.id}
                        to={`/help/${article.slug}`}
                        className="block group"
                      >
                        <Card className="p-4 h-full flex flex-col justify-between border border-slate-200 hover:border-slate-400 transition-colors">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {article.category && (
                                <Badge tone="slate">
                                  {article.category.name}
                                </Badge>
                              )}
                              <Badge
                                tone={difficultyBadgeTone(article.difficulty)}
                              >
                                {article.difficulty}
                              </Badge>
                            </div>
                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                              {highlightText(article.title, searchInput)}
                            </h3>
                            <p className="text-xs text-slate-600 line-clamp-2">
                              {highlightText(article.excerpt, searchInput)}
                            </p>
                          </div>
                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {article.estimatedReadingMinutes} menit baca
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 group-hover:translate-x-0.5 transition-transform">
                              Baca Panduan <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}

                {searchInput.trim() && matchingFaqs.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      FAQ Terkait Pencarian ({matchingFaqs.length})
                    </h3>
                    <div className="space-y-2">
                      {matchingFaqs.map((faq) => (
                        <Card key={faq.id} className="p-4 space-y-1.5">
                          <p className="text-xs font-bold text-slate-900">
                            {highlightText(faq.question, searchInput)}
                          </p>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {highlightText(faq.answer, searchInput)}
                          </p>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <>
                {/* Category Overview Cards */}
                <section className="space-y-3">
                  <h2 className="text-base font-bold text-slate-900">
                    Kategori Dokumentasi Berdasarkan Peran & Modul
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(overview?.categories || []).map((cat) => {
                      const Icon = getCategoryIcon(cat.icon);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleSelectCategory(cat.slug)}
                          className="text-left group"
                        >
                          <Card className="p-4 h-full border border-slate-200 hover:border-slate-400 transition-colors">
                            <div className="flex items-start gap-3">
                              <div
                                className="p-2.5 rounded-lg shrink-0"
                                style={{
                                  backgroundColor: 'var(--theme-content-bg)',
                                  color: 'var(--theme-primary)',
                                }}
                              >
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 truncate">
                                    {cat.name}
                                  </h3>
                                  <Badge tone="slate">
                                    {cat.articleCount} panduan
                                  </Badge>
                                </div>
                                <p className="text-xs text-slate-600 line-clamp-2">
                                  {cat.description}
                                </p>
                              </div>
                            </div>
                          </Card>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Popular & Latest Guides */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <section className="space-y-3">
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Panduan Populer
                    </h2>
                    <div className="space-y-2.5">
                      {(overview?.popularArticles || []).map((article) => (
                        <Link
                          key={article.id}
                          to={`/help/${article.slug}`}
                          className="block group"
                        >
                          <Card className="p-3.5 border border-slate-200 hover:border-slate-400 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <h3 className="text-xs font-bold text-slate-900 group-hover:text-blue-700 truncate">
                                  {article.title}
                                </h3>
                                <p className="text-[11px] text-slate-500 line-clamp-1">
                                  {article.excerpt}
                                </p>
                              </div>
                              <span className="text-[11px] text-slate-400 shrink-0">
                                {article.estimatedReadingMinutes}m
                              </span>
                            </div>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      Panduan Terbaru
                    </h2>
                    <div className="space-y-2.5">
                      {(overview?.latestArticles || []).map((article) => (
                        <Link
                          key={article.id}
                          to={`/help/${article.slug}`}
                          className="block group"
                        >
                          <Card className="p-3.5 border border-slate-200 hover:border-slate-400 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <h3 className="text-xs font-bold text-slate-900 group-hover:text-blue-700 truncate">
                                  {article.title}
                                </h3>
                                <p className="text-[11px] text-slate-500 line-clamp-1">
                                  {article.category?.name || 'Panduan'} • Versi{' '}
                                  {article.docVersionLabel}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                            </div>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </section>
                </div>

                {/* FAQ Section */}
                {(overview?.faqs || []).length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-blue-600" />
                      Pertanyaan yang Sering Diajukan (FAQ)
                    </h2>
                    <Card className="divide-y divide-slate-100">
                      {(overview?.faqs || []).map((faq) => {
                        const isOpen = openFaqId === faq.id;
                        return (
                          <div key={faq.id} className="p-4">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenFaqId(isOpen ? null : faq.id)
                              }
                              className="w-full flex items-center justify-between gap-3 text-left"
                            >
                              <span className="text-xs sm:text-sm font-semibold text-slate-900">
                                {faq.question}
                              </span>
                              <ChevronDown
                                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                                  isOpen ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                            {isOpen && (
                              <p className="mt-2.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
                                {faq.answer}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </Card>
                  </section>
                )}

                {/* Troubleshooting Quick Links */}
                {(overview?.troubleshootingArticles || []).length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Panduan Troubleshooting
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {(overview?.troubleshootingArticles || []).map((art) => (
                        <Link
                          key={art.id}
                          to={`/help/${art.slug}`}
                          className="block group"
                        >
                          <Card className="p-3.5 h-full border border-slate-200 hover:border-amber-400 transition-colors">
                            <h3 className="text-xs font-bold text-slate-900 group-hover:text-amber-700 line-clamp-2">
                              {art.title}
                            </h3>
                            <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                              {art.excerpt}
                            </p>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
