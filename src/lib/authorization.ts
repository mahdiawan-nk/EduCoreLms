import type { LmsUser } from '../context/AuthContext';

export type CanonicalRole = 'SUPERADMIN' | 'DOSEN' | 'MAHASISWA' | 'AUDITOR';

export function getUserRolesUpper(user: LmsUser | null | undefined): string[] {
  if (!user?.roles) return [];
  return user.roles.map((r) => r.toUpperCase());
}

export function isSuperadminUser(user: LmsUser | null | undefined): boolean {
  return getUserRolesUpper(user).includes('SUPERADMIN');
}

export function isAuditorUser(user: LmsUser | null | undefined): boolean {
  const upper = getUserRolesUpper(user);
  return upper.includes('AUDITOR') && !upper.includes('SUPERADMIN');
}

export function isDosenUser(user: LmsUser | null | undefined): boolean {
  return getUserRolesUpper(user).includes('DOSEN');
}

export function isMahasiswaUser(user: LmsUser | null | undefined): boolean {
  return getUserRolesUpper(user).includes('MAHASISWA');
}

/**
 * Centralized permission check.
 * SUPERADMIN retains all permissions; other roles are checked strictly against their granted permissions.
 */
export function hasPermission(
  user: LmsUser | null | undefined,
  permissionCode: string
): boolean {
  if (!user) return false;
  if (isSuperadminUser(user)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permissionCode);
}

export function hasAnyPermission(
  user: LmsUser | null | undefined,
  permissionCodes: string[]
): boolean {
  if (!user) return false;
  if (permissionCodes.length === 0) return true;
  if (isSuperadminUser(user)) return true;
  return permissionCodes.some((code) => user.permissions?.includes(code));
}

export function hasAllPermissions(
  user: LmsUser | null | undefined,
  permissionCodes: string[]
): boolean {
  if (!user) return false;
  if (permissionCodes.length === 0) return true;
  if (isSuperadminUser(user)) return true;
  return permissionCodes.every((code) => user.permissions?.includes(code));
}

/**
 * Centralized Frontend Mutation Guard.
 * AUDITOR is strictly read-only and must never trigger mutations.
 */
export function canPerformMutations(user: LmsUser | null | undefined): boolean {
  if (!user) return false;
  return !isAuditorUser(user);
}

export function getPrimaryRoleLabel(user: LmsUser | null | undefined): string {
  if (isSuperadminUser(user)) return 'Superadmin Akademik';
  if (isAuditorUser(user)) return 'Auditor Akademik (Read-Only)';
  if (isDosenUser(user)) return 'Dosen Pengampu';
  return 'Mahasiswa';
}
