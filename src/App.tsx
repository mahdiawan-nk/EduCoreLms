import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LoginPage } from './pages/LoginPage';
import { ForcePasswordChangePage } from './pages/ForcePasswordChangePage';
import { DashboardPage } from './pages/DashboardPage';
import { ClassroomPage } from './pages/ClassroomPage';
import { MaterialBuilderPage } from './pages/MaterialBuilderPage';
import { MaterialViewerPage } from './pages/MaterialViewerPage';
import { AssignmentBuilderPage } from './pages/AssignmentBuilderPage';
import { AssignmentWorkspacePage } from './pages/AssignmentWorkspacePage';
import { AssignmentMonitoringPage } from './pages/AssignmentMonitoringPage';
import { AssignmentGradingPage } from './pages/AssignmentGradingPage';
import { AssessmentBuilderPage } from './pages/AssessmentBuilderPage';
import { AssessmentExaminationPage } from './pages/AssessmentExaminationPage';
import { AssessmentMonitoringPage } from './pages/AssessmentMonitoringPage';
import { AssessmentEssayGradingPage } from './pages/AssessmentEssayGradingPage';
import { AcademicPeriodsPage } from './pages/AcademicPeriodsPage';
import { ClassroomBuilderWizardPage } from './pages/ClassroomBuilderWizardPage';
import { ClassroomParticipantsPage } from './pages/ClassroomParticipantsPage';
import { ClassroomsListPage } from './pages/ClassroomsListPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { RbacManagementPage } from './pages/RbacManagementPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { KnowledgeCenterPage } from './pages/KnowledgeCenterPage';
import { KnowledgeArticlePage } from './pages/KnowledgeArticlePage';
import { KnowledgeAdminPage } from './pages/KnowledgeAdminPage';
import { ForbiddenPage } from './components/ForbiddenPage';
import {
  hasAllPermissions,
  hasAnyPermission,
  isAuditorUser,
} from './lib/authorization';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // Prevent repeated retries on 401 Unauthorized or 403 Forbidden
        if (
          error?.status === 401 ||
          error?.status === 403 ||
          error?.code === 'UNAUTHORIZED' ||
          error?.code === 'FORBIDDEN' ||
          error?.code === 'CSRF_TOKEN_MISMATCH'
        ) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--theme-content-bg)' }}
      >
        <div className="text-center space-y-2">
          <div
            className="h-8 w-8 mx-auto rounded-lg animate-pulse"
            style={{ backgroundColor: 'var(--theme-primary)' }}
          />
          <p className="text-xs font-medium text-slate-600">
            Memverifikasi sesi keamanan EduCoreLMS...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.mustResetPassword) {
    return <Navigate to="/auth/force-password-change" replace />;
  }

  return <>{children}</>;
}

function PermissionRoute({
  children,
  requiredPermissions,
  anyPermissions,
  disallowAuditor = false,
}: {
  children: React.ReactNode;
  requiredPermissions?: string[];
  anyPermissions?: string[];
  disallowAuditor?: boolean;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--theme-content-bg)' }}
      >
        <div className="text-center space-y-2">
          <div
            className="h-8 w-8 mx-auto rounded-lg animate-pulse"
            style={{ backgroundColor: 'var(--theme-primary)' }}
          />
          <p className="text-xs font-medium text-slate-600">
            Memverifikasi otorisasi RBAC EduCoreLMS...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.mustResetPassword) {
    return <Navigate to="/auth/force-password-change" replace />;
  }

  if (disallowAuditor && isAuditorUser(user)) {
    return (
      <ForbiddenPage
        title="403 — Mode Hanya-Baca (Auditor)"
        description="Peran AUDITOR bersifat hanya-baca (read-only) dan tidak diizinkan mengakses halaman pembuatan atau perubahan data."
      />
    );
  }

  const hasRequired = requiredPermissions
    ? hasAllPermissions(user, requiredPermissions)
    : true;
  const hasAny = anyPermissions ? hasAnyPermission(user, anyPermissions) : true;

  if (!hasRequired || !hasAny) {
    const permLabel = [...(requiredPermissions || []), ...(anyPermissions || [])].join(' / ');
    return <ForbiddenPage requiredPermission={permLabel || undefined} />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isLoading ? (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
              <div className="text-center space-y-2">
                <div className="h-8 w-8 mx-auto rounded-lg bg-slate-900 animate-pulse" />
                <p className="text-xs font-medium text-slate-600">
                  Memuat Politeknik Kampar LMS...
                </p>
              </div>
            </div>
          ) : user ? (
            <Navigate
              to={user.mustResetPassword ? '/auth/force-password-change' : '/'}
              replace
            />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/auth/force-password-change"
        element={
          isLoading ? (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
              <div className="text-center space-y-2">
                <div className="h-8 w-8 mx-auto rounded-lg bg-slate-900 animate-pulse" />
                <p className="text-xs font-medium text-slate-600">
                  Memverifikasi sesi keamanan Politeknik Kampar LMS...
                </p>
              </div>
            </div>
          ) : !user ? (
            <Navigate to="/login" replace />
          ) : !user.mustResetPassword ? (
            <Navigate to="/" replace />
          ) : (
            <ForcePasswordChangePage />
          )
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* GROUP B: MANAJEMEN AKADEMIK */}
      <Route
        path="/academic-periods"
        element={
          <PermissionRoute requiredPermissions={['academic_period.view']}>
            <AcademicPeriodsPage />
          </PermissionRoute>
        }
      />
      <Route path="/courses" element={<Navigate to="/classrooms" replace />} />
      <Route path="/course-offerings" element={<Navigate to="/classrooms" replace />} />
      <Route path="/facilities" element={<Navigate to="/classrooms" replace />} />

      {/* GROUP C: MANAJEMEN RUANG KELAS */}
      <Route
        path="/classrooms"
        element={
          <PermissionRoute
            anyPermissions={[
              'classrooms:view',
              'classrooms:manage_all',
              'classrooms:teach',
              'enrollments:join',
            ]}
          >
            <ClassroomsListPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/new"
        element={
          <PermissionRoute
            requiredPermissions={['classrooms:create']}
            disallowAuditor
          >
            <ClassroomBuilderWizardPage />
          </PermissionRoute>
        }
      />
      <Route path="/catalog" element={<Navigate to="/classrooms" replace />} />
      <Route path="/lecturer-assignments" element={<Navigate to="/classrooms" replace />} />
      <Route path="/schedules" element={<Navigate to="/classrooms" replace />} />
      <Route
        path="/classrooms/:id"
        element={
          <PermissionRoute
            anyPermissions={[
              'classrooms:view',
              'classrooms:manage_all',
              'classrooms:teach',
            ]}
          >
            <ClassroomPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:id/participants"
        element={
          <PermissionRoute
            anyPermissions={['enrollments:view', 'enrollments:manage']}
          >
            <ClassroomParticipantsPage />
          </PermissionRoute>
        }
      />

      {/* GROUP D: MANAJEMEN SISTEM & AUDIT */}
      <Route
        path="/admin/users"
        element={
          <PermissionRoute anyPermissions={['users:read', 'users:manage']}>
            <UserManagementPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/admin/rbac"
        element={
          <PermissionRoute anyPermissions={['rbac:view', 'rbac:manage']}>
            <RbacManagementPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <PermissionRoute requiredPermissions={['audit:view']}>
            <AuditLogsPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <PermissionRoute
            requiredPermissions={['system_settings.view']}
            disallowAuditor
          >
            <SystemSettingsPage />
          </PermissionRoute>
        }
      />

      {/* KNOWLEDGE CENTER / PUSAT BANTUAN */}
      <Route
        path="/help"
        element={
          <PermissionRoute anyPermissions={['knowledge.view', 'knowledge.manage']}>
            <KnowledgeCenterPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/help/:slug"
        element={
          <PermissionRoute anyPermissions={['knowledge.view', 'knowledge.manage']}>
            <KnowledgeArticlePage />
          </PermissionRoute>
        }
      />
      <Route
        path="/admin/help"
        element={
          <PermissionRoute
            requiredPermissions={['knowledge.manage']}
            disallowAuditor
          >
            <KnowledgeAdminPage />
          </PermissionRoute>
        }
      />

      {/* LEARNING MATERIALS */}
      <Route
        path="/classrooms/:classroomId/materials/new"
        element={
          <PermissionRoute
            requiredPermissions={['content:publish']}
            disallowAuditor
          >
            <MaterialBuilderPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/materials/:materialId/edit"
        element={
          <PermissionRoute
            requiredPermissions={['content:publish']}
            disallowAuditor
          >
            <MaterialBuilderPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/materials/:materialId"
        element={
          <PermissionRoute
            anyPermissions={['materials:view', 'content:publish']}
          >
            <MaterialViewerPage />
          </PermissionRoute>
        }
      />

      {/* ASSIGNMENTS */}
      <Route
        path="/classrooms/:classroomId/assignments/new"
        element={
          <PermissionRoute
            requiredPermissions={['assignments:manage']}
            disallowAuditor
          >
            <AssignmentBuilderPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assignments/:assignmentId/edit"
        element={
          <PermissionRoute
            requiredPermissions={['assignments:manage']}
            disallowAuditor
          >
            <AssignmentBuilderPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assignments/:assignmentId"
        element={
          <PermissionRoute
            anyPermissions={['assignments:view', 'assignments:manage', 'assignments:submit']}
          >
            <AssignmentWorkspacePage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assignments/:assignmentId/monitoring"
        element={
          <PermissionRoute
            anyPermissions={['assignments:manage', 'assignments:view']}
          >
            <AssignmentMonitoringPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assignments/:assignmentId/grading/:submissionId"
        element={
          <PermissionRoute
            requiredPermissions={['assignments:manage']}
            disallowAuditor
          >
            <AssignmentGradingPage />
          </PermissionRoute>
        }
      />

      {/* ASSESSMENTS & EXAMS */}
      <Route
        path="/classrooms/:classroomId/assessments/new"
        element={
          <PermissionRoute
            requiredPermissions={['quizzes:manage']}
            disallowAuditor
          >
            <AssessmentBuilderPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assessments/:assessmentId/edit"
        element={
          <PermissionRoute
            requiredPermissions={['quizzes:manage']}
            disallowAuditor
          >
            <AssessmentBuilderPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assessments/:assessmentId"
        element={
          <PermissionRoute
            anyPermissions={['assessments:view', 'quizzes:attempt', 'quizzes:manage']}
          >
            <AssessmentExaminationPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assessments/:assessmentId/monitoring"
        element={
          <PermissionRoute
            anyPermissions={['quizzes:manage', 'assessments:view']}
          >
            <AssessmentMonitoringPage />
          </PermissionRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assessments/:assessmentId/grading/:attemptId"
        element={
          <PermissionRoute
            requiredPermissions={['quizzes:manage']}
            disallowAuditor
          >
            <AssessmentEssayGradingPage />
          </PermissionRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-right" richColors closeButton />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
