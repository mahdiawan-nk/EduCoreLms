import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  GraduationCap,
  ShieldCheck,
  Users,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Card } from '../components/ui/primitives';
import { toast } from 'sonner';

interface LoginFormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const { loginWithCredentials, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: 'fitriani.dosen@poltek-kampar.ac.id',
      password: 'DosenPolkam#2026',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      setSubmitting(true);
      await loginWithCredentials(values.email, values.password);
      toast.success('Sesi terautentikasi berhasil dibuat.');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Gagal melakukan autentikasi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (
    email: string,
    password: string,
    label: string
  ) => {
    setValue('email', email);
    setValue('password', password);
    try {
      setSubmitting(true);
      await loginWithCredentials(email, password);
      toast.success(`Selamat datang, ${label}`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Gagal masuk');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setSubmitting(true);
      await loginWithGoogle();
      toast.success('Berhasil masuk melalui Google Sign-In');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Autentikasi Google dibatalkan atau gagal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-amber-400">
            <GraduationCap className="h-4 w-4" />
          </div>
          <span>Politeknik Kampar LMS</span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <span className="whitespace-nowrap shrink-0">Teknik Informatika</span>
          <span className="whitespace-nowrap shrink-0">Teknik Pengolahan Sawit</span>
          <span className="whitespace-nowrap shrink-0">Perawatan & Perbaikan Mesin</span>
          <span className="whitespace-nowrap shrink-0">Administrasi Bisnis Internasional</span>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
            Tahun Akademik 2026/2027
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[1140px] grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          {/* Left Institutional Brief */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-900 p-8 lg:p-10 text-white">
            <div>
              <p className="text-xs font-medium text-amber-400">
                Portal Akademik & Ruang Kelas Digital Terpadu
              </p>
              <h1 className="mt-3 text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
                Sistem Manajemen Pembelajaran Digital Politeknik Kampar
              </h1>
              <p className="mt-4 text-sm text-slate-300 leading-relaxed max-w-xl">
                Platform ruang kelas digital terintegrasi untuk mendukung perkuliahan vokasi,
                praktikum laboratorium, pengelolaan materi terstruktur, penugasan repositori,
                evaluasi kuis otomatis, dan transparansi nilai akademik.
              </p>

              {/* Quick Actor Selection Cards */}
              <div className="mt-8 pt-8 border-t border-slate-800">
                <h2 className="text-sm font-semibold text-white">
                  Akses Cepat Akun Aktor Produksi (Terhubung ke PostgreSQL)
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Klik salah satu aktor di bawah untuk masuk langsung menggunakan akun PostgreSQL yang telah di-hash dengan Argon2id:
                </p>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      handleQuickLogin(
                        'superadmin@poltek-kampar.ac.id',
                        'AdminPolkam#2026',
                        'Ir. Hendra Pratama (Superadmin)'
                      )
                    }
                    className="text-left rounded-lg border border-slate-700 bg-slate-800/80 p-3.5 hover:border-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-400">
                        01. Superadmin
                      </span>
                      <ShieldCheck className="h-4 w-4 text-amber-400" />
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-white truncate">
                      Ir. Hendra Pratama
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 truncate">
                      Kelola Pengguna, RBAC & Akademik
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      handleQuickLogin(
                        'fitriani.dosen@poltek-kampar.ac.id',
                        'DosenPolkam#2026',
                        'Dr. Fitriani Syahrir (Dosen)'
                      )
                    }
                    className="text-left rounded-lg border border-slate-700 bg-slate-800/80 p-3.5 hover:border-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-400">
                        02. Dosen Pengampu
                      </span>
                      <Users className="h-4 w-4 text-emerald-400" />
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-white truncate">
                      Dr. Fitriani Syahrir
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 truncate">
                      Kelola Kelas, Tugas, Kuis & Nilai
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      handleQuickLogin(
                        'ahmad.mhs@student.poltek-kampar.ac.id',
                        'MhsPolkam#2026',
                        'Ahmad Fauzan (Mahasiswa)'
                      )
                    }
                    className="text-left rounded-lg border border-slate-700 bg-slate-800/80 p-3.5 hover:border-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-sky-400">
                        03. Mahasiswa
                      </span>
                      <GraduationCap className="h-4 w-4 text-sky-400" />
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-white truncate">
                      Ahmad Fauzan
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 truncate">
                      Gabung Kelas, Kumpul Tugas & Kuis
                    </p>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>Keamanan Sesi: Argon2id · SHA-256 Session Digest · Proteksi CSRF</span>
              <span className="font-mono tabular-nums">API /api/v1</span>
            </div>
          </div>

          {/* Right Authentication Card */}
          <Card className="lg:col-span-5 p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Lock className="h-3.5 w-3.5 text-amber-600" />
                <span>Autentikasi Sesi Server-Side</span>
              </div>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                Masuk ke Akun LMS
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Gunakan email institusi Politeknik Kampar atau Google Sign-In.
              </p>

              <form
                onSubmit={handleSubmit(onSubmit)}
                className="mt-6 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Alamat Email Institusi
                  </label>
                  <Input
                    type="email"
                    placeholder="nama@poltek-kampar.ac.id"
                    {...register('email', {
                      required: 'Email wajib diisi',
                    })}
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Kata Sandi
                  </label>
                  <Input
                    type="password"
                    placeholder="••••••••••••"
                    {...register('password', {
                      required: 'Kata sandi wajib diisi',
                      minLength: {
                        value: 6,
                        message: 'Minimal 6 karakter',
                      },
                    })}
                  />
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting}
                >
                  <span>{submitting ? 'Memverifikasi...' : 'Masuk ke Ruang Kelas'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs text-slate-400">atau SSO Institusi</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={submitting}
              >
                <span>Masuk dengan Google Workspace / Akun Google</span>
              </Button>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">
                Kode Kelas Aktif untuk Uji Pendaftaran Mahasiswa:
              </p>
              <p className="font-mono tabular-nums text-slate-600">
                PKM-RPL5A (Auto) · PKM-SEC5B (Approval) · PKM-TPS3A (Auto)
              </p>
            </div>
          </Card>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
        <div className="max-w-[1140px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Politeknik Kampar — Jl. Tengku Muhammad KM. 2 Bangkinang, Riau</span>
          <span>Otorisasi RBAC Deny-by-Default · PostgreSQL & Drizzle ORM</span>
        </div>
      </footer>
    </div>
  );
}
