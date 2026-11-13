import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  UserPlus,
  ChevronLeft,
  Mail,
  GraduationCap,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Input, Card, ModalDialog, ConfirmDialog } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { canPerformMutations } from '../lib/authorization';
import { formatDate } from '../lib/utils';
import { toast } from 'sonner';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation';

interface ParticipantResponse {
  instructors: Array<{
    id: string;
    userId: string;
    fullName: string;
    email: string;
    identityNumber: string;
    role: string;
    isPrimary: boolean;
    status: string;
  }>;
  students: Array<{
    enrollmentId: string;
    userId: string;
    fullName: string;
    email: string;
    identityNumber: string;
    status: 'active' | 'pending' | 'rejected' | 'dropped';
    enrollmentSource: string;
    enrolledAt: string;
    withdrawnAt?: string;
  }>;
  waitlist: Array<{
    waitlistId: string;
    userId: string;
    fullName: string;
    email: string;
    identityNumber: string;
    queueNumber: number;
    status: string;
    createdAt: string;
  }>;
  totalActiveStudents: number;
  totalPendingStudents: number;
}

export function ClassroomParticipantsPage() {
  const { id: classroomId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canMutate = canPerformMutations(user);

  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'waitlist'>('active');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectEnrollmentId, setRejectEnrollmentId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const deleteConfirm = useDeleteConfirmation();

  // Fetch Classroom details
  const { data: classroom } = useQuery({
    queryKey: ['classroom-detail', classroomId],
    queryFn: async () => {
      const res = await apiRequest<any>(`/api/v1/classrooms/${classroomId}`);
      return res.data;
    },
    enabled: !!classroomId,
  });

  // Fetch Participants Data
  const { data: participants, isLoading } = useQuery({
    queryKey: ['classroom-participants', classroomId],
    queryFn: async () => {
      const res = await apiRequest<ParticipantResponse>(`/api/v1/classrooms/${classroomId}/participants`);
      return res.data;
    },
    enabled: !!classroomId,
  });

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      return apiRequest(`/api/v1/enrollments/${enrollmentId}/approve`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-participants', classroomId] });
      toast.success('Pendaftaran mahasiswa berhasil disetujui.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menyetujui pendaftaran.');
    },
  });

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ enrollmentId, reason }: { enrollmentId: string; reason: string }) => {
      return apiRequest(`/api/v1/enrollments/${enrollmentId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-participants', classroomId] });
      setRejectModalOpen(false);
      setRejectReason('');
      toast.success('Pendaftaran mahasiswa telah ditolak.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menolak pendaftaran.');
    },
  });

  // Withdraw / Drop Mutation (Auto-promotes waitlist)
  const withdrawMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      return apiRequest(`/api/v1/enrollments/${enrollmentId}/withdraw`, { method: 'POST' });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['classroom-participants', classroomId] });
      if (res.data?.promoted) {
        toast.info('Mahasiswa dikeluarkan. Mahasiswa antrean waiting list otomatis dipromosikan!');
      } else {
        toast.success('Mahasiswa berhasil dikeluarkan dari kelas.');
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal memproses pengeluaran mahasiswa.');
    },
  });

  // Export CSV
  const handleExportCsv = () => {
    if (!participants) return;
    const activeStudents = participants.students.filter((s) => s.status === 'active');
    let csv = 'No,NIM,Nama Lengkap,Email,Sumber Pendaftaran,Tanggal Bergabung\n';
    activeStudents.forEach((s, idx) => {
      csv += `"${idx + 1}","${s.identityNumber}","${s.fullName}","${s.email}","${s.enrollmentSource}","${formatDate(s.enrolledAt)}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Daftar_Peserta_${classroom?.name || 'Kelas'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeStudents = participants?.students.filter((s) => s.status === 'active') || [];
  const pendingStudents = participants?.students.filter((s) => s.status === 'pending') || [];
  const waitlistQueue = participants?.waitlist || [];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <button
              onClick={() => navigate(`/classrooms/${classroomId}`)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 mb-2"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Kembali ke Ruang Kelas
            </button>
            <h1 className="text-2xl font-bold text-slate-900">
              Manajemen Anggota & Peserta Perkuliahan
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {classroom?.name} ({classroom?.courseCode}) • Seksi {classroom?.section}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              className="text-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Ekspor Roster (CSV)
            </Button>
          </div>
        </div>

        {/* Section 1: Teaching Team */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <GraduationCap className="w-4 h-4 text-blue-600" /> Tim Dosen Pengampu & Asisten ({participants?.instructors.length || 0})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {participants?.instructors.map((inst) => (
              <Card key={inst.id} className="p-4 border border-slate-200 bg-white shadow-sm flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                  {inst.fullName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-xs font-bold text-slate-900">{inst.fullName}</h4>
                    {inst.isPrimary && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                        Utama
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{inst.identityNumber || 'NIDN N/A'}</p>
                  <p className="text-[11px] text-slate-400">{inst.email}</p>
                  <span className="inline-block mt-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    {inst.role}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Section 2: Students Tab Navigation */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('active')}
              className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'active'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4" /> Mahasiswa Aktif ({activeStudents.length})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'pending'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" /> Menunggu Persetujuan ({pendingStudents.length})
            </button>
            <button
              onClick={() => setActiveTab('waitlist')}
              className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'waitlist'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4" /> Antrean Waiting List ({waitlistQueue.length})
            </button>
          </div>

          {/* TAB 1: ACTIVE STUDENTS */}
          {activeTab === 'active' && (
            <Card className="overflow-hidden border border-slate-200">
              {activeStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada mahasiswa yang terdaftar aktif di kelas ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-3 w-12 text-center">No</th>
                        <th className="p-3">Nama Mahasiswa</th>
                        <th className="p-3">NIM</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Sumber Pendaftaran</th>
                        <th className="p-3">Tanggal Bergabung</th>
                        <th className="p-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeStudents.map((s, idx) => (
                        <tr key={s.enrollmentId} className="hover:bg-slate-50/50">
                          <td className="p-3 text-center text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-semibold text-slate-900">{s.fullName}</td>
                          <td className="p-3 font-mono text-slate-600">{s.identityNumber}</td>
                          <td className="p-3 text-slate-500">{s.email}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
                              {s.enrollmentSource}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500">{formatDate(s.enrolledAt)}</td>
                          <td className="p-3 text-right">
                            {canMutate ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  deleteConfirm.requestConfirmation({
                                    item: s,
                                    title: 'Keluarkan Mahasiswa dari Kelas?',
                                    description: 'Apakah Anda yakin ingin mengeluarkan peserta ini dari ruang kelas?',
                                    itemName: `${s.fullName} (${s.identityNumber})`,
                                    warningText:
                                      'Mahasiswa akan kehilangan akses ke ruang kelas ini, namun riwayat nilai dan pengumpulan tugas sebelumnya tetap tersimpan.',
                                    actionLabel: 'Ya, Keluarkan',
                                    onConfirm: async () => {
                                      await withdrawMutation.mutateAsync(s.enrollmentId);
                                    },
                                  })
                                }
                                className="text-red-600 hover:bg-red-50 text-xs h-7 px-2"
                              >
                                Keluarkan
                              </Button>
                            ) : (
                              <span className="text-[11px] text-slate-400">Read-Only</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* TAB 2: PENDING APPROVALS */}
          {activeTab === 'pending' && (
            <Card className="overflow-hidden border border-slate-200">
              {pendingStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Tidak ada permintaan pendaftaran mahasiswa yang pending.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-3">Nama Mahasiswa</th>
                        <th className="p-3">NIM</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Waktu Pengajuan</th>
                        <th className="p-3 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingStudents.map((s) => (
                        <tr key={s.enrollmentId} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-900">{s.fullName}</td>
                          <td className="p-3 font-mono text-slate-600">{s.identityNumber}</td>
                          <td className="p-3 text-slate-500">{s.email}</td>
                          <td className="p-3 text-slate-500">{formatDate(s.enrolledAt)}</td>
                          <td className="p-3 text-right space-x-2">
                            {canMutate ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => approveMutation.mutate(s.enrollmentId)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-2.5"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Setujui
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setRejectEnrollmentId(s.enrollmentId);
                                    setRejectModalOpen(true);
                                  }}
                                  className="text-red-600 border-red-200 hover:bg-red-50 text-xs h-7 px-2.5"
                                >
                                  <XCircle className="w-3.5 h-3.5 mr-1" /> Tolak
                                </Button>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-400">Read-Only</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* TAB 3: WAITING LIST QUEUE */}
          {activeTab === 'waitlist' && (
            <Card className="overflow-hidden border border-slate-200">
              {waitlistQueue.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Antrean waiting list kosong. Semua pendaftar tertampung di kuota aktif.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-3 w-16 text-center">Antrean</th>
                        <th className="p-3">Nama Mahasiswa</th>
                        <th className="p-3">NIM</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Waktu Masuk Antrean</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {waitlistQueue.map((w) => (
                        <tr key={w.waitlistId} className="hover:bg-slate-50/50">
                          <td className="p-3 text-center">
                            <span className="font-bold text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                              #{w.queueNumber}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-900">{w.fullName}</td>
                          <td className="p-3 font-mono text-slate-600">{w.identityNumber}</td>
                          <td className="p-3 text-slate-500">{w.email}</td>
                          <td className="p-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                              MENUNGGU KURSI
                            </span>
                          </td>
                          <td className="p-3 text-slate-500">{formatDate(w.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* REJECT MODAL */}
        <ModalDialog
          open={rejectModalOpen}
          onClose={() => setRejectModalOpen(false)}
          title="Tolak Pendaftaran Mahasiswa"
          description="Berikan catatan alasan penolakan bagi mahasiswa."
        >
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Alasan Penolakan</label>
              <Input
                placeholder="Contoh: Belum memenuhi prasyarat mata kuliah dasar"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="pt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  rejectMutation.mutate({
                    enrollmentId: rejectEnrollmentId,
                    reason: rejectReason,
                  })
                }
              >
                Konfirmasi Tolak
              </Button>
            </div>
          </div>
        </ModalDialog>
        <ConfirmDialog {...deleteConfirm.dialogProps} />
      </div>
    </AppShell>
  );
}
