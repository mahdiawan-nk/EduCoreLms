import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  Lock,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, setApiSecurityTokens } from '../lib/api';
import { Button, Card, Input } from '../components/ui/primitives';
import { toast } from 'sonner';

export function ForcePasswordChangePage() {
  const { user, logout, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checks = [
    { label: 'Minimal 12 karakter', ok: newPassword.length >= 12 },
    { label: 'Mengandung huruf kapital (A-Z)', ok: /[A-Z]/.test(newPassword) },
    { label: 'Mengandung huruf kecil (a-z)', ok: /[a-z]/.test(newPassword) },
    { label: 'Mengandung angka (0-9)', ok: /[0-9]/.test(newPassword) },
    { label: 'Mengandung karakter spesial (!@#$%^&* dll)', ok: /[^A-Za-z0-9]/.test(newPassword) },
    {
      label: 'Konfirmasi password cocok',
      ok: newPassword.length > 0 && newPassword === confirmPassword,
    },
  ];

  const passedCount = checks.filter((c) => c.ok).length;
  const strengthPct = Math.round((passedCount / checks.length) * 100);
  const allValid = checks.every((c) => c.ok) && currentPassword.length > 0;

  const strengthColor =
    strengthPct >= 100
      ? 'bg-emerald-600'
      : strengthPct >= 66
        ? 'bg-amber-500'
        : 'bg-rose-500';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!allValid) {
      setErrorMsg('Pastikan seluruh persyaratan keamanan password terpenuhi.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiRequest<{
        csrfToken: string;
        passwordChanged: boolean;
      }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      if (res.data?.csrfToken) {
        setApiSecurityTokens({ csrfToken: res.data.csrfToken });
      }
      await refreshSession();
      toast.success('Password berhasil diperbarui. Mengarahkan ke dashboard...');
      navigate('/', { replace: true });
    } catch (err: any) {
      const msg = err?.message || 'Gagal memperbarui password.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#14213D] text-white flex items-center justify-center mx-auto shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            Politeknik Kampar LMS — Keamanan Akun
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Perbarui Password Anda</h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Demi keamanan akun, Anda diwajibkan mengganti password sementara sebelum melanjutkan
            penggunaan LMS Politeknik Kampar.
          </p>
        </div>

        <Card className="p-6 space-y-5 bg-white border-slate-200 shadow-sm">
          {user && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{user.fullName}</p>
                <p className="text-slate-500 truncate">{user.email}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium shrink-0">
                {user.roles?.[0] || 'USER'}
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password saat ini *
              </label>
              <div className="relative">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Masukkan password sementara Anda"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Tampilkan atau sembunyikan password saat ini"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password baru *
              </label>
              <div className="relative">
                <Input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 12 karakter kuat"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Tampilkan atau sembunyikan password baru"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Konfirmasi password baru *
              </label>
              <div className="relative">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password baru"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Tampilkan atau sembunyikan konfirmasi password"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Strength Indicator */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Kekuatan Password</span>
                <span className="font-semibold text-slate-700">{strengthPct}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${strengthColor}`}
                  style={{ width: `${strengthPct}%` }}
                />
              </div>
            </div>

            {/* Requirement Checklist */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <p className="text-xs font-semibold text-slate-700 mb-1">Persyaratan Keamanan:</p>
              {checks.map((c) => (
                <div
                  key={c.label}
                  className={`flex items-center gap-2 text-xs ${
                    c.ok ? 'text-emerald-700 font-medium' : 'text-slate-500'
                  }`}
                >
                  {c.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  )}
                  <span>{c.label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <Button
                type="submit"
                disabled={!allValid || submitting}
                className="w-full sm:flex-1 gap-1.5 bg-[#14213D] hover:bg-[#1d2f54]"
              >
                <Lock className="w-4 h-4" />
                {submitting ? 'Memperbarui Password...' : 'Simpan Password Baru'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={logout}
                className="w-full sm:w-auto gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                Keluar
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
