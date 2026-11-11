import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
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
import { ClassroomCatalogPage } from './pages/ClassroomCatalogPage';
import { ClassroomParticipantsPage } from './pages/ClassroomParticipantsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 mx-auto rounded-lg bg-slate-900 animate-pulse" />
          <p className="text-xs font-medium text-slate-600">
            Memverifikasi sesi keamanan Politeknik Kampar LMS...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
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
          !isLoading && user ? <Navigate to="/" replace /> : <LoginPage />
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
        path="/classrooms/:id"
        element={
          <ProtectedRoute>
            <ClassroomPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/materials/new"
        element={
          <ProtectedRoute>
            <MaterialBuilderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/materials/:materialId/edit"
        element={
          <ProtectedRoute>
            <MaterialBuilderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/materials/:materialId"
        element={
          <ProtectedRoute>
            <MaterialViewerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assignments/new"
        element={
          <ProtectedRoute>
            <AssignmentBuilderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assignments/:assignmentId/edit"
        element={
          <ProtectedRoute>
            <AssignmentBuilderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assignments/:assignmentId"
        element={
          <ProtectedRoute>
            <AssignmentWorkspacePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assignments/:assignmentId/monitoring"
        element={
          <ProtectedRoute>
            <AssignmentMonitoringPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assignments/:assignmentId/grading/:submissionId"
        element={
          <ProtectedRoute>
            <AssignmentGradingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assessments/new"
        element={
          <ProtectedRoute>
            <AssessmentBuilderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assessments/:assessmentId/edit"
        element={
          <ProtectedRoute>
            <AssessmentBuilderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assessments/:assessmentId"
        element={
          <ProtectedRoute>
            <AssessmentExaminationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assessments/:assessmentId/monitoring"
        element={
          <ProtectedRoute>
            <AssessmentMonitoringPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:classroomId/assessments/:assessmentId/grading/:attemptId"
        element={
          <ProtectedRoute>
            <AssessmentEssayGradingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/academic-periods"
        element={
          <ProtectedRoute>
            <AcademicPeriodsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/new"
        element={
          <ProtectedRoute>
            <ClassroomBuilderWizardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/catalog"
        element={
          <ProtectedRoute>
            <ClassroomCatalogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms/:id/participants"
        element={
          <ProtectedRoute>
            <ClassroomParticipantsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
