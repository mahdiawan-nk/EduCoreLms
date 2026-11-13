import crypto from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { passwordHistory } from '../db/schema.ts';
import { verifyPassword } from './security.ts';

export interface PasswordPolicyConfig {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  historyCount: number;
  defaultTempExpirationHours: number;
}

export function getPasswordPolicyConfig(): PasswordPolicyConfig {
  const minLength = Math.max(8, Number(process.env.PASSWORD_MIN_LENGTH || 12));
  const maxLength = Math.min(256, Number(process.env.PASSWORD_MAX_LENGTH || 128));
  const historyCount = Math.max(1, Number(process.env.PASSWORD_HISTORY_COUNT || 5));
  const defaultTempExpirationHours = Math.max(
    1,
    Number(process.env.TEMP_PASSWORD_EXPIRATION_HOURS || 24)
  );

  return {
    minLength,
    maxLength,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
    historyCount,
    defaultTempExpirationHours,
  };
}

const COMMON_WEAK_PASSWORDS = new Set([
  'password1234',
  'password123!',
  'admin1234567',
  'admin@123456',
  'qwerty123456',
  'qwertyuiop12',
  '123456789012',
  'politeknikkampar',
  'poltekampar123',
  'welcome12345',
  'changeme1234',
  'letmein12345',
]);

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strengthScore: number; // 0-100
  strengthLabel: 'Sangat Lemah' | 'Lemah' | 'Sedang' | 'Kuat' | 'Sangat Kuat';
}

export function validatePasswordPolicy(
  password: string,
  options: { identityValues?: Array<string | null | undefined> } = {}
): PasswordValidationResult {
  const config = getPasswordPolicyConfig();
  const errors: string[] = [];

  if (typeof password !== 'string' || password.length < config.minLength) {
    errors.push(`Password minimal ${config.minLength} karakter.`);
  }
  if (typeof password === 'string' && password.length > config.maxLength) {
    errors.push(`Password maksimal ${config.maxLength} karakter.`);
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (config.requireUppercase && !hasUpper) {
    errors.push('Password harus mengandung minimal 1 huruf kapital (A-Z).');
  }
  if (config.requireLowercase && !hasLower) {
    errors.push('Password harus mengandung minimal 1 huruf kecil (a-z).');
  }
  if (config.requireNumber && !hasDigit) {
    errors.push('Password harus mengandung minimal 1 angka (0-9).');
  }
  if (config.requireSpecial && !hasSpecial) {
    errors.push('Password harus mengandung minimal 1 karakter spesial (!@#$%^&* dll).');
  }

  const normalized = password.toLowerCase().replace(/\s+/g, '');
  if (COMMON_WEAK_PASSWORDS.has(normalized)) {
    errors.push('Password terlalu umum dan mudah ditebak.');
  }

  if (options.identityValues && options.identityValues.length > 0) {
    for (const rawId of options.identityValues) {
      const cleanId = (rawId || '').trim().toLowerCase();
      if (cleanId.length >= 4 && normalized.includes(cleanId)) {
        errors.push('Password permanen tidak boleh menggunakan atau mengandung NIM/NIDN/NIP.');
        break;
      }
    }
  }

  let score = 0;
  if (password.length >= config.minLength) score += 25;
  if (password.length >= 16) score += 15;
  if (hasUpper) score += 15;
  if (hasLower) score += 15;
  if (hasDigit) score += 15;
  if (hasSpecial) score += 15;
  if (errors.length > 0) score = Math.min(score, 45);

  const strengthLabel: PasswordValidationResult['strengthLabel'] =
    score >= 90
      ? 'Sangat Kuat'
      : score >= 75
        ? 'Kuat'
        : score >= 50
          ? 'Sedang'
          : score >= 25
            ? 'Lemah'
            : 'Sangat Lemah';

  return {
    valid: errors.length === 0,
    errors,
    strengthScore: score,
    strengthLabel,
  };
}

const UPPER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes I, O
const LOWER_CHARS = 'abcdefghijkmnopqrstuvwxyz'; // Excludes l
const DIGIT_CHARS = '23456789'; // Excludes 0, 1
const SPECIAL_CHARS = '!@#$%^&*-_=+?';

export function generateCryptographicPassword(length = 16): string {
  const targetLen = Math.max(12, Math.min(64, length));
  const allChars = UPPER_CHARS + LOWER_CHARS + DIGIT_CHARS + SPECIAL_CHARS;
  const chars: string[] = [];

  // Guarantee at least 2 characters from each character class
  for (let i = 0; i < 2; i++) {
    chars.push(UPPER_CHARS[crypto.randomInt(UPPER_CHARS.length)]);
    chars.push(LOWER_CHARS[crypto.randomInt(LOWER_CHARS.length)]);
    chars.push(DIGIT_CHARS[crypto.randomInt(DIGIT_CHARS.length)]);
    chars.push(SPECIAL_CHARS[crypto.randomInt(SPECIAL_CHARS.length)]);
  }

  while (chars.length < targetLen) {
    chars.push(allChars[crypto.randomInt(allChars.length)]);
  }

  // Cryptographic Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
}

export async function checkPasswordReuse(
  userId: string,
  newPassword: string,
  currentPasswordHash?: string | null
): Promise<boolean> {
  const config = getPasswordPolicyConfig();

  if (currentPasswordHash) {
    const matchesCurrent = await verifyPassword(currentPasswordHash, newPassword);
    if (matchesCurrent) return true;
  }

  const historyRows = await db
    .select({ passwordHash: passwordHistory.passwordHash })
    .from(passwordHistory)
    .where(eq(passwordHistory.userId, userId))
    .orderBy(desc(passwordHistory.createdAt))
    .limit(config.historyCount);

  for (const row of historyRows) {
    const matchesOld = await verifyPassword(row.passwordHash, newPassword);
    if (matchesOld) return true;
  }

  return false;
}

export async function recordPasswordInHistory(
  tx: Pick<typeof db, 'insert'>,
  userId: string,
  oldPasswordHash: string
): Promise<void> {
  if (!oldPasswordHash) return;
  await tx.insert(passwordHistory).values({
    userId,
    passwordHash: oldPasswordHash,
  });
}
