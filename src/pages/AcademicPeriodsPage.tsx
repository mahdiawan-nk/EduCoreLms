import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  Lock,
  Archive,
  Star,
  Layers,
  ChevronRight,
  AlertCircle,
  Tag,
  Eye,
  Trash2,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Input, Card, ModalDialog } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/utils';
import { toast } from 'sonner';

interface AcademicPeriod {
  id: string;
  code: string;
  name: string;
  academicYear: string;
  semesterType: 'ODD' | 'EVEN' | 'SHORT';
  startDate: string;
  endDate: string;
  registrationStart: string;
  registrationEnd: string;
  status: 'draft' | 'scheduled' | 'active' | 'registration_closed' | 'completed' | 'archived';
  isDefault: boolean;
  classroomCount?: number;
  courseOfferingCount?: number;
}

interface CalendarEvent {
  id: string;
  academicPeriodId: string;
  title: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  isHoliday: boolean;
  visibility: string;
  color: string;
  periodName?: string;
  periodCode?: string;
}

export function AcademicPeriodsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperadmin = user?.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');

  const [activeTab, setActiveTab] = useState<'periods' | 'calendar'>('periods');
  const [createPeriodModalOpen, setCreatePeriodModalOpen] = useState(false);
  const [createEventModalOpen, setCreateEventModalOpen] = useState(false);
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>('all');

  // Form states for New Period
  const [periodForm, setPeriodForm] = useState({
    code: '',
    name: '',
    academicYear: '2026/2027',
    semesterType: 'ODD' as 'ODD' | 'EVEN' | 'SHORT',
    startDate: '2026-09-01',
    endDate: '2027-01-31',
    registrationStart: '2026-08-01',
    registrationEnd: '2026-09-15',
    status: 'draft' as any,
    isDefault: false,
  });

  // Form states for New Calendar Event
  const [eventForm, setEventForm] = useState({
    academicPeriodId: '',
    title: '',
    description: '',
    category: 'LECTURE_START',
    startDate: '',
    endDate: '',
    isHoliday: false,
    visibility: 'ALL',
    color: '#2563eb',
  });

  // Queries
  const { data: periods = [], isLoading: periodsLoading } = useQuery({
    queryKey: ['admin-academic-periods'],
    queryFn: async () => {
      const res = await apiRequest<AcademicPeriod[]>('/api/v1/admin/academic-periods');
      return res.data || [];
    },
    enabled: isSuperadmin,
  });

  const { data: calendarEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['academic-calendar', selectedPeriodFilter],
    queryFn: async () => {
      const url = selectedPeriodFilter !== 'all'
        ? `/api/v1/academic-calendar?periodId=${selectedPeriodFilter}`
        : '/api/v1/academic-calendar';
      const res = await apiRequest<CalendarEvent[]>(url);
      return res.data || [];
    },
  });

  // Mutations for Period Status Transitions
  const transitionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      return apiRequest(`/api/v1/admin/academic-periods/${id}/${action}`, { method: 'POST' });
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-academic-periods'] });
      queryClient.invalidateQueries({ queryKey: ['academic-periods'] });
      toast.success(`Berhasil memperbarui status periode akademik (${action}).`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal mengubah status periode akademik.');
    },
  });

  const createPeriodMutation = useMutation({
    mutationFn: async (payload: typeof periodForm) => {
      return apiRequest('/api/v1/admin/academic-periods', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-academic-periods'] });
      setCreatePeriodModalOpen(false);
      toast.success('Periode Akademik baru berhasil dibuat.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal membuat periode akademik.');
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async (payload: typeof eventForm) => {
      return apiRequest('/api/v1/admin/academic-calendar', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-calendar'] });
      setCreateEventModalOpen(false);
      toast.success('Agenda kalender akademik berhasil ditambahkan.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menambahkan agenda kalender.');
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/v1/admin/academic-calendar/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-calendar'] });
      toast.success('Agenda kalender berhasil dihapus.');
    },
  });

  if (!isSuperadmin) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto py-12 px-4 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900">Akses Dibatasi</h2>
          <p className="text-sm text-slate-600 mt-2">
            Pengelolaan Master Periode Akademik dan Kalender Kampus secara eksklusif dikendalikan oleh Superadmin Politeknik Kampar.
          </p>
        </div>
      </AppShell>
    );
  }

  const defaultPeriod = periods.find((p) => p.isDefault);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                Superadmin Workspace
              </span>
              {defaultPeriod && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-emerald-600" /> Default: {defaultPeriod.name} ({defaultPeriod.code})
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">
              Manajemen Periode & Kalender Akademik
            </h1>
            <p className="text-sm text-slate-600">
              Pengaturan semester resmi, masa pendaftaran KRS, jadwal perkuliahan, dan agenda kalender Politeknik Kampar.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'periods' ? (
              <Button onClick={() => setCreatePeriodModalOpen(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" /> Buka Semester Baru
              </Button>
            ) : (
              <Button onClick={() => setCreateEventModalOpen(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" /> Tambah Agenda Kalender
              </Button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('periods')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'periods'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" /> Daftar Periode Akademik ({periods.length})
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'calendar'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" /> Kalender & Agenda Akademik ({calendarEvents.length})
          </button>
        </div>

        {/* TAB 1: PERIODS LIST */}
        {activeTab === 'periods' && (
          <div className="space-y-4">
            {periodsLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat data periode akademik...</div>
            ) : periods.length === 0 ? (
              <Card className="p-12 text-center text-slate-500">
                Belum ada periode akademik terdaftar. Silakan buat semester perdana.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {periods.map((period) => (
                  <Card key={period.id} className="p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                            {period.code}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900">{period.name}</h3>
                          {period.isDefault && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                              <Star className="w-3 h-3 fill-emerald-600" /> Default Semester
                            </span>
                          )}
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              period.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : period.status === 'registration_closed'
                                ? 'bg-amber-100 text-amber-800'
                                : period.status === 'completed'
                                ? 'bg-purple-100 text-purple-800'
                                : period.status === 'archived'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            Status: {period.status.toUpperCase()}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600 pt-1">
                          <div>
                            <span className="font-medium text-slate-400 block">Masa Perkuliahan:</span>
                            {formatDate(period.startDate)} - {formatDate(period.endDate)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-400 block">Masa Registrasi KRS:</span>
                            {formatDate(period.registrationStart)} - {formatDate(period.registrationEnd)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-400 block">Ruang Kelas Aktif:</span>
                            <span className="font-semibold text-slate-800">{period.classroomCount || 0} Kelas</span>
                          </div>
                          <div>
                            <span className="font-medium text-slate-400 block">Tawaran Mata Kuliah:</span>
                            <span className="font-semibold text-slate-800">{period.courseOfferingCount || 0} Matkul</span>
                          </div>
                        </div>
                      </div>

                      {/* State transitions */}
                      <div className="flex flex-wrap items-center gap-2">
                        {!period.isDefault && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => transitionMutation.mutate({ id: period.id, action: 'set-default' })}
                            className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                          >
                            <Star className="w-3.5 h-3.5 mr-1" /> Jadikan Default
                          </Button>
                        )}
                        {period.status !== 'active' && period.status !== 'completed' && period.status !== 'archived' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => transitionMutation.mutate({ id: period.id, action: 'activate' })}
                            className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aktifkan
                          </Button>
                        )}
                        {period.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => transitionMutation.mutate({ id: period.id, action: 'close-registration' })}
                            className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                          >
                            <Lock className="w-3.5 h-3.5 mr-1" /> Tutup KRS
                          </Button>
                        )}
                        {['active', 'registration_closed'].includes(period.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => transitionMutation.mutate({ id: period.id, action: 'complete' })}
                            className="text-xs text-purple-700 border-purple-300 hover:bg-purple-50"
                          >
                            Selesaikan
                          </Button>
                        )}
                        {period.status === 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => transitionMutation.mutate({ id: period.id, action: 'archive' })}
                            className="text-xs text-slate-600 border-slate-300 hover:bg-slate-50"
                          >
                            <Archive className="w-3.5 h-3.5 mr-1" /> Arsipkan
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CALENDAR TIMELINE */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Filter Periode:</span>
                <select
                  value={selectedPeriodFilter}
                  onChange={(e) => setSelectedPeriodFilter(e.target.value)}
                  className="text-xs border border-slate-300 rounded px-2.5 py-1 bg-white text-slate-700"
                >
                  <option value="all">Semua Periode</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {eventsLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat agenda kalender...</div>
            ) : calendarEvents.length === 0 ? (
              <Card className="p-12 text-center text-slate-500">
                Belum ada agenda kalender akademik yang dijadwalkan pada filter ini.
              </Card>
            ) : (
              <div className="space-y-3">
                {calendarEvents.map((evt) => (
                  <Card key={evt.id} className="p-4 border border-slate-200 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-3 h-10 rounded-full mt-1 shrink-0"
                        style={{ backgroundColor: evt.color || '#2563eb' }}
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {evt.category}
                          </span>
                          {evt.isHoliday && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">
                              Hari Libur
                            </span>
                          )}
                          <span className="text-xs text-slate-400">
                            Visibilitas: {evt.visibility}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mt-1">{evt.title}</h4>
                        {evt.description && (
                          <p className="text-xs text-slate-600 mt-0.5">{evt.description}</p>
                        )}
                        <p className="text-xs font-mono text-slate-500 mt-2 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {formatDate(evt.startDate)} s/d {formatDate(evt.endDate)}
                        </p>
                      </div>
                    </div>

                    {isSuperadmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteEventMutation.mutate(evt.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MODAL: CREATE PERIOD */}
        <ModalDialog
          open={createPeriodModalOpen}
          onClose={() => setCreatePeriodModalOpen(false)}
          title="Buka Periode Akademik Baru"
          description="Tambahkan semester akademik resmi Politeknik Kampar."
        >
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Kode Periode (Contoh: 20262)</label>
              <Input
                placeholder="20262"
                value={periodForm.code}
                onChange={(e) => setPeriodForm({ ...periodForm, code: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Nama Semester</label>
              <Input
                placeholder="Semester Genap 2026/2027"
                value={periodForm.name}
                onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Tahun Akademik</label>
                <Input
                  value={periodForm.academicYear}
                  onChange={(e) => setPeriodForm({ ...periodForm, academicYear: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Tipe Semester</label>
                <select
                  value={periodForm.semesterType}
                  onChange={(e) => setPeriodForm({ ...periodForm, semesterType: e.target.value as any })}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                >
                  <option value="ODD">Ganjil (ODD)</option>
                  <option value="EVEN">Genap (EVEN)</option>
                  <option value="SHORT">Semester Antara / Pendek (SHORT)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Awal Perkuliahan</label>
                <Input
                  type="date"
                  value={periodForm.startDate}
                  onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Akhir Perkuliahan</label>
                <Input
                  type="date"
                  value={periodForm.endDate}
                  onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Awal KRS</label>
                <Input
                  type="date"
                  value={periodForm.registrationStart}
                  onChange={(e) => setPeriodForm({ ...periodForm, registrationStart: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Akhir KRS</label>
                <Input
                  type="date"
                  value={periodForm.registrationEnd}
                  onChange={(e) => setPeriodForm({ ...periodForm, registrationEnd: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isDefaultCb"
                checked={periodForm.isDefault}
                onChange={(e) => setPeriodForm({ ...periodForm, isDefault: e.target.checked })}
              />
              <label htmlFor="isDefaultCb" className="text-xs font-medium text-slate-700">
                Jadikan semester ini sebagai Periode Default Politeknik Kampar
              </label>
            </div>
            <div className="pt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreatePeriodModalOpen(false)}>
                Batal
              </Button>
              <Button onClick={() => createPeriodMutation.mutate(periodForm)}>
                Simpan Semester
              </Button>
            </div>
          </div>
        </ModalDialog>

        {/* MODAL: CREATE EVENT */}
        <ModalDialog
          open={createEventModalOpen}
          onClose={() => setCreateEventModalOpen(false)}
          title="Tambah Agenda Kalender Akademik"
          description="Tambahkan jadwal penting kampus Politeknik Kampar."
        >
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Periode Akademik</label>
              <select
                value={eventForm.academicPeriodId}
                onChange={(e) => setEventForm({ ...eventForm, academicPeriodId: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
              >
                <option value="">Pilih Semester</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Judul Agenda</label>
              <Input
                placeholder="Contoh: Ujian Akhir Semester (UAS)"
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Kategori Agenda</label>
              <select
                value={eventForm.category}
                onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
              >
                <option value="KRS_REGISTRATION">KRS & Registrasi Mahasiswa</option>
                <option value="LECTURE_START">Awal Perkuliahan</option>
                <option value="LECTURE_END">Akhir Perkuliahan</option>
                <option value="UTS">Ujian Tengah Semester (UTS)</option>
                <option value="UAS">Ujian Akhir Semester (UAS)</option>
                <option value="HOLIDAY">Hari Libur Nasional / Akademik</option>
                <option value="GRADE_SUBMISSION">Batas Input Nilai</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Tanggal Mulai</label>
                <Input
                  type="date"
                  value={eventForm.startDate}
                  onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Tanggal Selesai</label>
                <Input
                  type="date"
                  value={eventForm.endDate}
                  onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isHolidayCb"
                checked={eventForm.isHoliday}
                onChange={(e) => setEventForm({ ...eventForm, isHoliday: e.target.checked })}
              />
              <label htmlFor="isHolidayCb" className="text-xs font-medium text-slate-700">
                Tandai sebagai Hari Libur Perkuliahan
              </label>
            </div>
            <div className="pt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateEventModalOpen(false)}>
                Batal
              </Button>
              <Button onClick={() => createEventMutation.mutate(eventForm)}>
                Simpan Agenda
              </Button>
            </div>
          </div>
        </ModalDialog>
      </div>
    </AppShell>
  );
}
