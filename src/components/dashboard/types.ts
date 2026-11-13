export type PrimaryRole = 'SUPERADMIN' | 'DOSEN' | 'MAHASISWA' | 'AUDITOR';

export interface ProfileSummaryData {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  identityNumber: string | null;
  primaryRole: PrimaryRole;
  roles: string[];
  permissions: string[];
  accountStatus: string;
  isActive: boolean;
  lastLoginAt: string | null;
  studyProgram: string;
  organizationalUnit: string;
  academicStatus: string;
  nip: string | null;
  nidn: string | null;
  nim: string | null;
  academicTitle: string | null;
  semesterLevel: number | null;
  admissionYear: number | null;
  auditScope: string | null;
}

export interface AcademicPeriodItem {
  id: string;
  code: string;
  name: string;
  academicYear: string;
  semesterType: string;
  startDate: string;
  endDate: string;
  status: string;
  isDefault: boolean;
}

export interface DashboardPreferences {
  hiddenWidgets?: string[];
  widgetOrder?: string[];
  selectedPeriodId?: string | null;
  viewDensity?: 'comfortable' | 'compact';
}

export interface CategorizedNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  category: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardMeResponse {
  primaryRole: PrimaryRole;
  profileSummary: ProfileSummaryData;
  activePeriod: AcademicPeriodItem | null;
  selectedPeriod: AcademicPeriodItem | null;
  availablePeriods: AcademicPeriodItem[];
  preferences: DashboardPreferences;
  notificationsSummary: {
    unreadCount: number;
    items: CategorizedNotification[];
  };
}
