import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Search,
  Users,
  Clock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Hourglass,
  Layers,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Input, Card, ModalDialog } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface CatalogClassroom {
  id: string;
  name: string;
  section: string;
  classroomCode: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  studyProgram: string;
  periodName: string;
  periodStatus: string;
  enrollmentMode: 'AUTO' | 'APPROVAL_REQUIRED' | 'JOIN_CODE';
  activeParticipants: number;
  maxCapacity: number;
  isFull: boolean;
  waitingListEnabled: boolean;
  myStatus: 'active' | 'pending' | 'waitlisted' | null;
  instructors: string[];
}

export function ClassroomCatalogPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('all');
  const [joinCodeModalOpen, setJoinCodeModalOpen] = useState(false);
  const [joinClassId, setJoinClassId] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Fetch Catalog
  const { data: classrooms = [], isLoading } = useQuery({
    queryKey: ['classroom-catalog', search, selectedProgram],
    queryFn: async () => {
      let url = '/api/v1/classrooms/catalog';
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedProgram !== 'all') params.append('studyProgram', selectedProgram);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await apiRequest<CatalogClassroom[]>(url);
      return res.data || [];
    },
  });

  // Self-enrollment Mutation
  const enrollMutation = useMutation({
    mutationFn: async (classroomId: string) => {
      return apiRequest(`/api/v1/classrooms/${classroomId}/enroll`, { method: 'POST' });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['classroom-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
      if (res.data?.waitlisted) {
        toast.info(`Kapasitas penuh. Anda masuk ke daftar tunggu (Antrean #${res.data.queueNumber}).`);
      } else if (res.data?.status === 'pending') {
        toast.info('Pendaftaran berhasil diajukan! Menunggu persetujuan dosen.');
      } else {
        toast.success('Pendaftaran berhasil! Anda telah terdaftar aktif di kelas ini.');
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal mendaftar kelas.');
    },
  });

  // Join via Code Mutation
  const joinCodeMutation = useMutation({
    mutationFn: async ({ classroomId, code }: { classroomId: string; code: string }) => {
      return apiRequest(`/api/v1/classrooms/${classroomId}/join`, {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
      setJoinCodeModalOpen(false);
      setJoinCodeInput('');
      toast.success('Berhasil bergabung ke dalam kelas!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Kode gabung tidak valid.');
    },
  });

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Banner */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="max-w-3xl space-y-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-800 text-blue-200">
              Katalog Registrasi Rencana Studi (KRS)
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Eksplorasi & Pendaftaran Kelas Perkuliahan
            </h1>
            <p className="text-xs sm:text-sm text-blue-100">
              Temukan ruang kelas resmi Politeknik Kampar, pelajari profil tim dosen pengampu, pantau sisa kuota kursi, dan daftarkan rencana studi Anda.
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <Input
              placeholder="Cari mata kuliah atau kode kelas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700 w-full sm:w-auto"
            >
              <option value="all">Semua Program Studi</option>
              <option value="Teknik Informatika">Teknik Informatika</option>
              <option value="Teknik Pengolahan Sawit">Teknik Pengolahan Sawit</option>
              <option value="Perawatan Mesin">Perawatan Mesin</option>
              <option value="Administrasi Bisnis">Administrasi Bisnis</option>
            </select>
          </div>
        </div>

        {/* Catalog Grid */}
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500">Memuat katalog perkuliahan...</div>
        ) : classrooms.length === 0 ? (
          <Card className="p-12 text-center text-slate-500 text-xs">
            Tidak ada kelas perkuliahan aktif yang sesuai dengan kriteria pencarian Anda.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {classrooms.map((cls) => {
              const capacityPercent = Math.min(100, Math.round((cls.activeParticipants / cls.maxCapacity) * 100));
              const isEnrolled = cls.myStatus === 'active';
              const isPending = cls.myStatus === 'pending';
              const isWaitlisted = cls.myStatus === 'waitlisted';

              return (
                <Card
                  key={cls.id}
                  className="flex flex-col justify-between p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow rounded-xl bg-white"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                        {cls.courseCode}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        Kelas {cls.section}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-2">
                        {cls.courseTitle}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {cls.studyProgram} • {cls.credits} SKS
                      </p>
                    </div>

                    {/* Instructors */}
                    <div className="text-xs text-slate-600 pt-1">
                      <span className="text-slate-400 block text-[11px]">Dosen Pengampu:</span>
                      <span className="font-medium">
                        {cls.instructors.length > 0 ? cls.instructors.join(', ') : 'Belum ditentukan'}
                      </span>
                    </div>

                    {/* Quota Progress */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Kuota Terisi:</span>
                        <span className="font-semibold text-slate-800">
                          {cls.activeParticipants} / {cls.maxCapacity} Kursi
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            cls.isFull ? 'bg-red-500' : capacityPercent > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${capacityPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    {isEnrolled ? (
                      <Button
                        size="sm"
                        onClick={() => navigate(`/classrooms/${cls.id}`)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 text-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Masuk Kelas
                      </Button>
                    ) : isPending ? (
                      <div className="w-full p-2 bg-amber-50 border border-amber-200 rounded text-center text-xs font-semibold text-amber-800 flex items-center justify-center gap-1.5">
                        <Hourglass className="w-3.5 h-3.5" /> Menunggu Persetujuan
                      </div>
                    ) : isWaitlisted ? (
                      <div className="w-full p-2 bg-purple-50 border border-purple-200 rounded text-center text-xs font-semibold text-purple-800 flex items-center justify-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Terdaftar Waiting List
                      </div>
                    ) : cls.enrollmentMode === 'JOIN_CODE' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setJoinClassId(cls.id);
                          setJoinCodeModalOpen(true);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 text-xs"
                      >
                        <KeyRound className="w-3.5 h-3.5" /> Gabung via Kode
                      </Button>
                    ) : cls.isFull ? (
                      cls.waitingListEnabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => enrollMutation.mutate(cls.id)}
                          disabled={enrollMutation.isPending}
                          className="w-full text-purple-700 border-purple-300 hover:bg-purple-50 flex items-center justify-center gap-1.5 text-xs"
                        >
                          <Clock className="w-3.5 h-3.5" /> Masuk Antrean Waiting List
                        </Button>
                      ) : (
                        <Button disabled size="sm" className="w-full text-xs">
                          Kelas Penuh
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => enrollMutation.mutate(cls.id)}
                        disabled={enrollMutation.isPending}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5 text-xs"
                      >
                        Daftar Sekarang <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* MODAL: JOIN VIA CODE */}
        <ModalDialog
          open={joinCodeModalOpen}
          onClose={() => setJoinCodeModalOpen(false)}
          title="Gabung Menggunakan Kode Kelas"
          description="Masukkan kode unik pendaftaran yang diberikan oleh Dosen Pengampu."
        >
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Kode Gabung (6-8 Karakter)
              </label>
              <Input
                placeholder="Contoh: PKM-RPL5A"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                className="font-mono text-center text-sm font-bold tracking-wider"
              />
            </div>
            <div className="pt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setJoinCodeModalOpen(false)}>
                Batal
              </Button>
              <Button
                onClick={() =>
                  joinCodeMutation.mutate({ classroomId: joinClassId, code: joinCodeInput })
                }
                disabled={!joinCodeInput || joinCodeMutation.isPending}
              >
                Gabung Kelas
              </Button>
            </div>
          </div>
        </ModalDialog>
      </div>
    </AppShell>
  );
}
