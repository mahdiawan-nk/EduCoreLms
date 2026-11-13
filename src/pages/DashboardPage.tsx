import React, { Suspense, lazy, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Card, Skeleton, ModalDialog, Button } from '../components/ui/primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { isAuditorUser } from '../lib/authorization';
import { GlobalProfileSummary } from '../components/dashboard/GlobalProfileSummary';
import {
  NotificationCenterPanel,
  PersonalizationModal,
  DashboardErrorState,
} from '../components/dashboard/DashboardSharedWidgets';
import { SUPERADMIN_WIDGETS } from '../components/dashboard/SuperadminDashboardView';
import { DOSEN_WIDGETS } from '../components/dashboard/DosenDashboardView';
import { MAHASISWA_WIDGETS } from '../components/dashboard/MahasiswaDashboardView';
import { AUDITOR_WIDGETS } from '../components/dashboard/AuditorDashboardView';
import type {
  DashboardMeResponse,
  DashboardPreferences,
  PrimaryRole,
} from '../components/dashboard/types';

const SuperadminDashboardView = lazy(() =>
  import('../components/dashboard/SuperadminDashboardView').then((m) => ({
    default: m.SuperadminDashboardView,
  }))
);
const DosenDashboardView = lazy(() =>
  import('../components/dashboard/DosenDashboardView').then((m) => ({
    default: m.DosenDashboardView,
  }))
);
const MahasiswaDashboardView = lazy(() =>
  import('../components/dashboard/MahasiswaDashboardView').then((m) => ({
    default: m.MahasiswaDashboardView,
  }))
);
const AuditorDashboardView = lazy(() =>
  import('../components/dashboard/AuditorDashboardView').then((m) => ({
    default: m.AuditorDashboardView,
  }))
);

function getLocalPrefsKey(userId: string) {
  return `pk_lms_dashboard_prefs_${userId}`;
}

export function DashboardPage() {
  const { user, markAllNotificationsRead } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuditor = isAuditorUser(user);

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [localPrefs, setLocalPrefs] = useState<DashboardPreferences>({});

  // Load local fallback preferences
  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(getLocalPrefsKey(user.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        setLocalPrefs(parsed);
        if (parsed.selectedPeriodId) {
          setSelectedPeriodId(parsed.selectedPeriodId);
        }
      }
    } catch {
      // ignore
    }
  }, [user?.id]);

  const meQuery = useQuery({
    queryKey: ['dashboard-me', user?.id, selectedPeriodId],
    queryFn: () => {
      const qs = selectedPeriodId ? `?periodId=${selectedPeriodId}` : '';
      return apiRequest<DashboardMeResponse>(`/dashboards/me${qs}`);
    },
    enabled: !!user,
    retry: false,
  });

  const meData = meQuery.data?.data;

  // Sync server preferences once loaded
  useEffect(() => {
    if (!meData) return;
    const serverPrefs = meData.preferences || {};
    if (Object.keys(serverPrefs).length > 0 && !isAuditor) {
      setLocalPrefs(serverPrefs);
      if (!selectedPeriodId && serverPrefs.selectedPeriodId) {
        setSelectedPeriodId(serverPrefs.selectedPeriodId);
      }
    }
    if (!selectedPeriodId && meData.selectedPeriod?.id) {
      setSelectedPeriodId(meData.selectedPeriod.id);
    }
  }, [meData, isAuditor, selectedPeriodId]);

  const savePrefsMutation = useMutation({
    mutationFn: async (nextPrefs: DashboardPreferences) => {
      if (user?.id) {
        try {
          localStorage.setItem(getLocalPrefsKey(user.id), JSON.stringify(nextPrefs));
        } catch {
          // ignore
        }
      }
      if (isAuditor) {
        return { data: nextPrefs };
      }
      return apiRequest<DashboardPreferences>('/dashboards/preferences', {
        method: 'PUT',
        body: JSON.stringify(nextPrefs),
      });
    },
    onSuccess: (res, vars) => {
      setLocalPrefs(vars);
      if (vars.selectedPeriodId !== undefined) {
        setSelectedPeriodId(vars.selectedPeriodId || '');
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-me'] });
      setPersonalizeOpen(false);
      toast.success('Preferensi dashboard berhasil disimpan');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menyimpan preferensi dashboard');
    },
  });

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ['dashboard-me'] });
  };

  if (!user) return null;

  const primaryRole: PrimaryRole =
    meData?.primaryRole ||
    (user.roles.some((r) => r.toUpperCase() === 'SUPERADMIN')
      ? 'SUPERADMIN'
      : isAuditor
      ? 'AUDITOR'
      : user.roles.some((r) => r.toUpperCase() === 'DOSEN')
      ? 'DOSEN'
      : 'MAHASISWA');

  const widgetsForRole =
    primaryRole === 'SUPERADMIN'
      ? SUPERADMIN_WIDGETS
      : primaryRole === 'DOSEN'
      ? DOSEN_WIDGETS
      : primaryRole === 'AUDITOR'
      ? AUDITOR_WIDGETS
      : MAHASISWA_WIDGETS;

  const effectivePrefs = isAuditor
    ? localPrefs
    : { ...(meData?.preferences || {}), ...localPrefs };

  const hiddenWidgets = effectivePrefs.hiddenWidgets || [];
  const widgetOrder = effectivePrefs.widgetOrder || [];
  const compact = effectivePrefs.viewDensity === 'compact';

  const notificationSlot = (
    <NotificationCenterPanel
      notifications={meData?.notificationsSummary?.items || []}
      unreadCount={meData?.notificationsSummary?.unreadCount || 0}
      isAuditor={isAuditor}
      onMarkAllRead={handleMarkAllRead}
    />
  );

  return (
    <AppShell breadcrumb="Dashboard Akademik">
      <div className="min-h-full bg-slate-50/70 -m-4 sm:-m-6 p-4 sm:p-6 space-y-5">
        {meQuery.isLoading ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : meData ? (
          <GlobalProfileSummary
            profile={meData.profileSummary}
            activePeriod={meData.selectedPeriod || meData.activePeriod}
            selectedPeriodId={selectedPeriodId || meData.selectedPeriod?.id || ''}
            availablePeriods={meData.availablePeriods || []}
            onPeriodChange={(pid) => setSelectedPeriodId(pid)}
            onOpenPersonalize={() => setPersonalizeOpen(true)}
            onOpenSecurity={() => setAccountModalOpen(true)}
          />
        ) : (
          <DashboardErrorState
            title="Gagal memuat profil & periode akademik"
            message={(meQuery.error as Error)?.message}
            onRetry={() => {
              if (selectedPeriodId) setSelectedPeriodId('');
              void meQuery.refetch();
            }}
            retrying={meQuery.isFetching}
          />
        )}

        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          }
        >
          {primaryRole === 'SUPERADMIN' && (
            <SuperadminDashboardView
              user={user}
              selectedPeriodId={selectedPeriodId}
              hiddenWidgets={hiddenWidgets}
              widgetOrder={widgetOrder}
              compact={compact}
              notificationSlot={notificationSlot}
            />
          )}
          {primaryRole === 'DOSEN' && (
            <DosenDashboardView
              user={user}
              selectedPeriodId={selectedPeriodId}
              hiddenWidgets={hiddenWidgets}
              widgetOrder={widgetOrder}
              compact={compact}
              notificationSlot={notificationSlot}
            />
          )}
          {primaryRole === 'MAHASISWA' && (
            <MahasiswaDashboardView
              user={user}
              selectedPeriodId={selectedPeriodId}
              hiddenWidgets={hiddenWidgets}
              widgetOrder={widgetOrder}
              compact={compact}
              notificationSlot={notificationSlot}
            />
          )}
          {primaryRole === 'AUDITOR' && (
            <AuditorDashboardView
              hiddenWidgets={hiddenWidgets}
              widgetOrder={widgetOrder}
              compact={compact}
              notificationSlot={notificationSlot}
            />
          )}
        </Suspense>
      </div>

      {/* Personalization Modal */}
      <PersonalizationModal
        open={personalizeOpen}
        onClose={() => setPersonalizeOpen(false)}
        role={primaryRole}
        widgets={widgetsForRole}
        preferences={effectivePrefs}
        availablePeriods={meData?.availablePeriods || []}
        saving={savePrefsMutation.isPending}
        onSave={(next) => savePrefsMutation.mutate(next)}
      />

      {/* Profile & Account Security Summary Modal */}
      <ModalDialog
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        title="Profil & Keamanan Akun"
        description="Informasi status akun dan keamanan sesi Anda di Politeknik Kampar LMS."
      >
        {meData && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <p className="text-slate-400">Nama Lengkap</p>
                <p className="font-semibold text-slate-900">
                  {meData.profileSummary.fullName}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Email Institusi</p>
                <p className="font-semibold text-slate-900 truncate">
                  {meData.profileSummary.email}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Status Akun</p>
                <p className="font-semibold text-emerald-700">
                  {meData.profileSummary.accountStatus}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Hak Akses (Role)</p>
                <p className="font-semibold text-slate-900">
                  {meData.profileSummary.roles.join(', ')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {primaryRole === 'SUPERADMIN' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAccountModalOpen(false);
                    navigate('/admin/users');
                  }}
                  className="text-xs"
                >
                  Manajemen Pengguna
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => setAccountModalOpen(false)}
                className="bg-slate-900 text-white text-xs"
              >
                Tutup
              </Button>
            </div>
          </div>
        )}
      </ModalDialog>
    </AppShell>
  );
}
