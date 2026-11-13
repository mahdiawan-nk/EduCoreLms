import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  Lock,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/ThemeContext';
import { Button, Input, Card } from '../components/ui/primitives';
import { ApplicationBrand } from '../components/layout/ApplicationBrand';
import { toast } from 'sonner';

interface LoginFormValues {
  email: string;
  password: string;
}

function mapAuthErrorMessage(err: any): string {
  const code = err?.code || '';
  const msg = String(err?.message || '').toLowerCase();

  if (code === 'ACCOUNT_INACTIVE' || msg.includes('tidak aktif')) {
    return 'Akun tidak aktif. Silakan hubungi administrator institusi.';
  }
  if (code === 'EMAIL_NOT_VERIFIED' || msg.includes('belum diverifikasi')) {
    return 'Akun belum diverifikasi. Silakan hubungi administrator institusi.';
  }
  if (code === 'SESSION_EXPIRED' || msg.includes('berakhir')) {
    return 'Sesi autentikasi berakhir. Silakan masuk kembali.';
  }
  if (code === 'RATE_LIMIT_EXCEEDED' || err?.status === 429) {
    return err?.message || 'Terlalu banyak percobaan masuk. Silakan coba beberapa saat lagi.';
  }
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network')
  ) {
    return 'Koneksi ke server gagal. Periksa jaringan Anda dan coba lagi.';
  }
  if (code === 'INVALID_CREDENTIALS' || err?.status === 401) {
    return 'Email atau kata sandi tidak sesuai.';
  }
  return err?.message || 'Email atau kata sandi tidak sesuai.';
}

export function LoginPage() {
  const { loginWithCredentials, loginWithGoogle } = useAuth();
  const { config, applyPageSeo } = useAppConfig();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showSupportNotice, setShowSupportNotice] = useState(false);

  const institutionName =
    config.identity.institutionName || 'Politeknik Kampar';
  const institutionEmail = config.identity.institutionEmail?.trim() || '';
  const institutionPhone = config.identity.institutionPhone?.trim() || '';
  const academicYear = config.academicYear?.trim() || '';
  const googleSsoEnabled = Boolean(config.auth?.googleSsoEnabled);

  useEffect(() => {
    applyPageSeo({
      pageTitle: 'Masuk',
      isAuthenticatedPage: false,
      pathname: '/login',
    });
  }, [applyPageSeo]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setAuthError(null);
    try {
      setSubmitting(true);
      await loginWithCredentials(values.email.trim(), values.password);
      toast.success('Berhasil masuk ke EduCoreLMS.');
      navigate('/');
    } catch (err: any) {
      const friendly = mapAuthErrorMessage(err);
      setAuthError(friendly);
      toast.error(friendly);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      setSubmitting(true);
      await loginWithGoogle();
      toast.success('Berhasil masuk melalui Google Workspace.');
      navigate('/');
    } catch (err: any) {
      const friendly =
        err?.message || 'Autentikasi Google dibatalkan atau gagal.';
      setAuthError(friendly);
      toast.error(friendly);
    } finally {
      setSubmitting(false);
    }
  };

  const handleContactAdministrator = () => {
    if (institutionEmail) {
      window.location.href = `mailto:${institutionEmail}?subject=${encodeURIComponent(
        `Bantuan Reset Kata Sandi EduCoreLMS — ${institutionName}`
      )}`;
      return;
    }
    if (institutionPhone) {
      window.location.href = `tel:${institutionPhone.replace(/[^+\d]/g, '')}`;
      return;
    }
    setShowSupportNotice((prev) => !prev);
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-between transition-colors"
      style={{
        backgroundColor: 'var(--theme-content-bg)',
        color: 'var(--theme-text-primary)',
      }}
    >
      {/* Top Bar: Institutional Brand Identity Only */}
      <header
        className="w-full border-b px-4 sm:px-6 lg:px-8 py-3.5"
        style={{
          backgroundColor: 'var(--theme-topbar-bg)',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <ApplicationBrand variant="login" linkTo="" />

          {academicYear && (
            <span
              className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border shrink-0"
              style={{
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-text-secondary)',
                backgroundColor: 'var(--theme-surface)',
              }}
            >
              {academicYear}
            </span>
          )}
        </div>
      </header>

      {/* Main Centered Academic Portal */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-[460px] space-y-6">
          {/* Welcome Heading & Institutional Description */}
          <div className="text-center space-y-2">
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: 'var(--theme-text-primary)' }}
            >
              Selamat Datang di EduCoreLMS
            </h1>
            <p
              className="text-xs sm:text-sm leading-relaxed"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              Platform pembelajaran digital terpadu {institutionName} untuk
              mendukung aktivitas perkuliahan, pengelolaan materi, penugasan,
              asesmen, dan evaluasi pembelajaran.
            </p>
          </div>

          {/* Authentication Card */}
          <Card className="p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="space-y-1.5">
              <div
                className="inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: 'var(--theme-primary)' }}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Portal Autentikasi {institutionName}</span>
              </div>
              <h2
                className="text-xl font-bold tracking-tight"
                style={{ color: 'var(--theme-text-primary)' }}
              >
                Masuk ke Akun Anda
              </h2>
              <p
                className="text-xs sm:text-sm"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                Gunakan email institusi dan kata sandi yang telah diberikan oleh
                administrator.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700"
              >
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold"
                  style={{ color: 'var(--theme-text-primary)' }}
                >
                  Alamat Email Institusi
                </label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="nama@poltek-kampar.ac.id"
                  aria-invalid={Boolean(errors.email)}
                  disabled={submitting}
                  {...register('email', {
                    required: 'Alamat email institusi wajib diisi.',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Format alamat email tidak valid.',
                    },
                  })}
                />
                {errors.email && (
                  <p role="alert" className="text-xs text-red-600">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold"
                  style={{ color: 'var(--theme-text-primary)' }}
                >
                  Kata Sandi
                </label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Masukkan kata sandi Anda"
                    aria-invalid={Boolean(errors.password)}
                    disabled={submitting}
                    className="pr-10"
                    {...register('password', {
                      required: 'Kata sandi wajib diisi.',
                      minLength: {
                        value: 6,
                        message: 'Kata sandi minimal 6 karakter.',
                      },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 focus:outline-none focus-visible:ring-2"
                    aria-label={
                      showPassword
                        ? 'Sembunyikan kata sandi'
                        : 'Tampilkan kata sandi'
                    }
                    tabIndex={0}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p role="alert" className="text-xs text-red-600">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-semibold gap-2"
                disabled={submitting}
              >
                <span>
                  {submitting
                    ? 'Sedang memverifikasi akun...'
                    : 'Masuk ke EduCoreLMS'}
                </span>
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </Button>
            </form>

            {googleSsoEnabled && (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className="h-px flex-1"
                    style={{ backgroundColor: 'var(--theme-border)' }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    atau SSO Institusi
                  </span>
                  <div
                    className="h-px flex-1"
                    style={{ backgroundColor: 'var(--theme-border)' }}
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 font-medium"
                  onClick={handleGoogleSignIn}
                  disabled={submitting}
                >
                  Masuk dengan Google Workspace
                </Button>
              </>
            )}

            {/* Forgot Password & Administrator Support */}
            <div
              className="pt-5 border-t space-y-3"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <div className="flex items-start gap-2.5">
                <HelpCircle
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: 'var(--theme-primary)' }}
                />
                <div className="space-y-1">
                  <h3
                    className="text-xs font-bold"
                    style={{ color: 'var(--theme-text-primary)' }}
                  >
                    Lupa Kata Sandi?
                  </h3>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    Jika Anda tidak dapat mengakses akun karena lupa kata sandi,
                    silakan hubungi Administrator EduCoreLMS atau UPT ICT{' '}
                    {institutionName} untuk meminta reset password.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleContactAdministrator}
                className="w-full gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                Hubungi Administrator
              </Button>

              {showSupportNotice && (
                <div
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{
                    borderColor: 'var(--theme-border)',
                    backgroundColor: 'var(--theme-content-bg)',
                    color: 'var(--theme-text-secondary)',
                  }}
                >
                  Silakan hubungi Administrator atau UPT ICT {institutionName}{' '}
                  melalui saluran resmi kampus untuk permintaan reset kata
                  sandi.
                </div>
              )}

              <p
                className="text-[11px] leading-relaxed"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                Jangan pernah membagikan kata sandi kepada siapa pun. Jika akun
                di-reset oleh administrator, Anda wajib mengganti kata sandi
                saat masuk berikutnya.
              </p>
            </div>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="w-full border-t px-4 sm:px-6 lg:px-8 py-4 text-xs"
        style={{
          backgroundColor: 'var(--theme-surface)',
          borderColor: 'var(--theme-border)',
          color: 'var(--theme-text-secondary)',
        }}
      >
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <span>
            {config.identity.copyrightText ||
              `© ${new Date().getFullYear()} ${institutionName} — EduCoreLMS`}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {academicYear && <span>{academicYear}</span>}
            {institutionEmail && (
              <a
                href={`mailto:${institutionEmail}`}
                className="hover:underline"
              >
                {institutionEmail}
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
