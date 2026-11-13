import os from 'node:os';
import { eq, or } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  users,
  roles,
  userRoles,
  userSessions,
  impersonationSessions,
  auditLogs,
} from '../db/schema.ts';
import { hashPassword } from './security.ts';
import {
  generateCryptographicPassword,
  getPasswordPolicyConfig,
  recordPasswordInHistory,
} from './passwordPolicy.ts';

export interface RecoveryTargetAccount {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  accountStatus: string;
  passwordHash: string;
  roles: string[];
}

export interface RecoveryExecutionResult {
  accountId: string;
  email: string;
  fullName: string;
  temporaryPassword: string;
  expiresAt: Date;
  revokedSessionsCount: number;
}

export function validateRecoveryEnvironment(): void {
  const required = ['SQL_HOST', 'SQL_USER', 'SQL_PASSWORD', 'SQL_DB_NAME'];
  const missing = required.filter(
    (key) => !process.env[key] || !process.env[key]!.trim()
  );
  if (missing.length > 0 && !process.env.DATABASE_URL?.trim()) {
    throw new Error(
      `Variabel environment database tidak lengkap (${missing.join(', ')}). Pastikan .env atau environment server telah dikonfigurasi.`
    );
  }
}

export async function findSuperadminRecoveryTarget(
  rawEmail: string
): Promise<RecoveryTargetAccount> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Format email Superadmin tidak valid.');
  }

  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      isActive: users.isActive,
      accountStatus: users.accountStatus,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email));

  if (!account) {
    throw new Error(`Akun dengan email "${email}" tidak ditemukan.`);
  }

  const roleRows = await db
    .select({ code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, account.id));

  const roleCodes = roleRows.map((r) => r.code);
  if (!roleCodes.includes('SUPERADMIN')) {
    throw new Error(
      'Pemulihan ditolak: akun target bukan memiliki role SUPERADMIN.'
    );
  }

  if (!account.isActive || account.accountStatus !== 'ACTIVE') {
    throw new Error(
      `Pemulihan ditolak: akun dalam status tidak aktif (${account.accountStatus}).`
    );
  }

  return {
    ...account,
    roles: roleCodes,
  };
}

export async function recordFailedRecoveryAudit(params: {
  targetAccountId?: string | null;
  targetEmail: string;
  reason: string;
  operatorIdentity?: string;
}): Promise<void> {
  const hostname = os.hostname();
  const operator =
    params.operatorIdentity ||
    process.env.USER ||
    process.env.LOGNAME ||
    'cli-operator';

  try {
    await db.insert(auditLogs).values({
      actorId: params.targetAccountId ?? null,
      action: 'SUPERADMIN_PASSWORD_RECOVERY',
      entityType: 'USER',
      entityId: params.targetAccountId ?? params.targetEmail,
      ipAddress: hostname,
      metadata: {
        recoveryMethod: 'CLI',
        result: 'FAILED',
        reason: params.reason,
        operator,
        hostname,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Do not mask original recovery error if audit logging also fails
  }
}

export async function executeSuperadminRecovery(params: {
  email: string;
  confirmed: boolean;
  operatorIdentity?: string;
  _simulateTxFailure?: boolean;
}): Promise<RecoveryExecutionResult> {
  validateRecoveryEnvironment();

  const target = await findSuperadminRecoveryTarget(params.email);

  if (!params.confirmed) {
    await recordFailedRecoveryAudit({
      targetAccountId: target.id,
      targetEmail: target.email,
      reason: 'Konfirmasi eksplisit dibatalkan oleh operator.',
      operatorIdentity: params.operatorIdentity,
    });
    throw new Error('Pemulihan akun Superadmin dibatalkan.');
  }

  const temporaryPassword = generateCryptographicPassword(16);
  const passwordHash = await hashPassword(temporaryPassword);
  const policy = getPasswordPolicyConfig();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + policy.defaultTempExpirationHours * 60 * 60 * 1000
  );
  const hostname = os.hostname();
  const operator =
    params.operatorIdentity ||
    process.env.USER ||
    process.env.LOGNAME ||
    'cli-operator';

  let revokedSessionsCount = 0;

  try {
    await db.transaction(async (tx) => {
      // 1. Preserve old password hash in history so it cannot be reused
      await recordPasswordInHistory(tx, target.id, target.passwordHash);

      // 2. Update user password & enforce mustResetPassword without touching roles/permissions
      await tx
        .update(users)
        .set({
          passwordHash,
          mustResetPassword: true,
          temporaryPasswordExpiresAt: expiresAt,
          passwordResetAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, target.id));

      // 3. Revoke all active sessions and impersonation sessions
      const deletedSessions = await tx
        .delete(userSessions)
        .where(eq(userSessions.userId, target.id))
        .returning({ id: userSessions.id });
      revokedSessionsCount = deletedSessions.length;

      await tx
        .update(impersonationSessions)
        .set({ isActive: false, endedAt: now, endReason: 'SUPERADMIN_RECOVERY' })
        .where(
          or(
            eq(impersonationSessions.originalUserId, target.id),
            eq(impersonationSessions.impersonatedUserId, target.id)
          )
        );

      if (params._simulateTxFailure) {
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      }

      // 4. Record audit event (never store password or hash)
      await tx.insert(auditLogs).values({
        actorId: target.id,
        action: 'SUPERADMIN_PASSWORD_RECOVERY',
        entityType: 'USER',
        entityId: target.id,
        ipAddress: hostname,
        metadata: {
          recoveryMethod: 'CLI',
          result: 'SUCCESS',
          operator,
          hostname,
          revokedSessionsCount,
          mustResetPassword: true,
          timestamp: now.toISOString(),
        },
      });
    });
  } catch (err: any) {
    await recordFailedRecoveryAudit({
      targetAccountId: target.id,
      targetEmail: target.email,
      reason: err?.message || 'Database transaction failed',
      operatorIdentity: operator,
    });
    throw err;
  }

  return {
    accountId: target.id,
    email: target.email,
    fullName: target.fullName,
    temporaryPassword,
    expiresAt,
    revokedSessionsCount,
  };
}
