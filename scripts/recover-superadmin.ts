/**
 * EduCoreLMS — Superadmin Emergency Account Recovery CLI
 *
 * Usage:
 *   bun run scripts/recover-superadmin.ts <superadmin-email>
 *   npx tsx scripts/recover-superadmin.ts <superadmin-email>
 *
 * Security Guarantees:
 * - Only SUPERADMIN active accounts may be recovered.
 * - Rejects passwords passed via CLI arguments.
 * - Uses existing Argon2id password hashing and Drizzle ORM transaction.
 * - Revokes all active sessions and enforces mustResetPassword on next login.
 * - Records SUPERADMIN_PASSWORD_RECOVERY in audit_logs without logging secrets.
 */

import { stdin, stdout } from 'node:process';
import readline from 'node:readline/promises';
import {
  validateRecoveryEnvironment,
  findSuperadminRecoveryTarget,
  executeSuperadminRecovery,
  recordFailedRecoveryAudit,
} from '../src/server/superadminRecovery.ts';

async function main() {
  if (process.argv.length > 3) {
    throw new Error(
      'Argumen tidak valid. Jangan memasukkan kata sandi atau parameter tambahan melalui CLI. Gunakan: bun run scripts/recover-superadmin.ts <superadmin-email>'
    );
  }

  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      'Penggunaan: bun run scripts/recover-superadmin.ts <superadmin-email>'
    );
  }

  validateRecoveryEnvironment();

  console.log('\n=== EduCoreLMS Superadmin Emergency Recovery ===\n');

  let target;
  try {
    target = await findSuperadminRecoveryTarget(email);
  } catch (err: any) {
    await recordFailedRecoveryAudit({
      targetEmail: email,
      reason: err?.message || 'Target validation failed',
    });
    throw err;
  }

  console.log(`Nama    : ${target.fullName}`);
  console.log(`Email   : ${target.email}`);
  console.log(`Role    : SUPERADMIN`);
  console.log(`Status  : ${target.accountStatus}`);

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
  });

  let confirmation = '';
  try {
    confirmation = await rl.question(
      '\nKetik RECOVER-SUPERADMIN untuk melanjutkan pemulihan: '
    );
  } finally {
    rl.close();
  }

  const result = await executeSuperadminRecovery({
    email: target.email,
    confirmed: confirmation.trim() === 'RECOVER-SUPERADMIN',
  });

  console.log('\nPemulihan akun Superadmin berhasil.');
  console.log('------------------------------------------------');
  console.log('KATA SANDI SEMENTARA (TAMPIL SATU KALI):');
  console.log(result.temporaryPassword);
  console.log('------------------------------------------------');
  console.log(
    `Berlaku hingga         : ${result.expiresAt.toISOString()}`
  );
  console.log(
    `Sesi aktif dicabut     : ${result.revokedSessionsCount} sesi`
  );
  console.log(
    'Kebijakan login        : Wajib mengganti kata sandi saat masuk berikutnya.'
  );
  console.log(
    '\nSimpan kata sandi sementara ini secara aman. Kata sandi tidak akan ditampilkan lagi.\n'
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nPemulihan gagal:', error.message);
    process.exit(1);
  });
