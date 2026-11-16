/**
 * EduCoreLMS (Politeknik Kampar) — RBAC, Roles, Permissions & Users Seed Script
 *
 * Seeds ONLY:
 *   1. Canonical Roles (SUPERADMIN, DOSEN, MAHASISWA, AUDITOR)
 *   2. Permissions (from PERMISSION_REGISTRY in src/server/security.ts)
 *   3. Role-Permission mappings (from ROLE_PERMISSION_MAP)
 *   4. Initial Users, User Profiles, and User-Role assignments
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   npm run db:seed
 *   npx tsx scripts/seed-rbac.ts
 *   bun run scripts/seed-rbac.ts
 */

import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import {
  roles,
  permissions,
  rolePermissions,
  users,
  userProfiles,
  userRoles,
} from '../src/db/schema.ts';
import {
  PERMISSION_REGISTRY,
  ROLE_PERMISSION_MAP,
  hashPassword,
} from '../src/server/security.ts';

interface SeedRoleDef {
  code: 'SUPERADMIN' | 'DOSEN' | 'MAHASISWA' | 'AUDITOR';
  name: string;
  description: string;
  isSystem: boolean;
}

interface SeedUserDef {
  email: string;
  plainPassword: string;
  fullName: string;
  identityNumber: string;
  roleCode: SeedRoleDef['code'];
  profile: {
    studyProgram: string;
    organizationalUnit: string;
    nidn?: string;
    nip?: string;
    nim?: string;
    academicStatus: string;
    admissionYear?: number;
    auditScope?: string;
    phone: string;
    bio: string;
    semesterLevel?: number;
    academicTitle?: string;
  };
}

const CANONICAL_ROLES: SeedRoleDef[] = [
  {
    code: 'SUPERADMIN',
    name: 'Superadmin Akademik',
    description:
      'Otoritas penuh pengelolaan sistem, RBAC, data akademik, dan audit keamanan Politeknik Kampar.',
    isSystem: true,
  },
  {
    code: 'DOSEN',
    name: 'Dosen Pengampu',
    description:
      'Pengajar mata kuliah yang berwenang mengelola kelas digital, materi, tugas, kuis, dan buku nilai.',
    isSystem: true,
  },
  {
    code: 'MAHASISWA',
    name: 'Mahasiswa',
    description:
      'Peserta didik aktif Politeknik Kampar yang mengikuti perkuliahan, tugas, kuis, dan diskusi.',
    isSystem: true,
  },
  {
    code: 'AUDITOR',
    name: 'Auditor Akademik (Read-Only)',
    description:
      'Pengawas dan auditor internal dengan akses hanya-baca (read-only) untuk meninjau data akademik, kelas, nilai, dan log audit tanpa hak mutasi.',
    isSystem: true,
  },
];

const SEED_USERS: SeedUserDef[] = [
  {
    email: 'superadmin@poltek-kampar.ac.id',
    plainPassword: process.env.SEED_SUPERADMIN_PASSWORD || 'AdminPolkam#2026',
    fullName: 'Ir. Hendra Pratama, M.Kom.',
    identityNumber: 'NIP-198204112009121001',
    roleCode: 'SUPERADMIN',
    profile: {
      studyProgram: 'Direktorat Akademik & Sistem Informasi',
      organizationalUnit: 'UPT Teknologi Informasi & Komunikasi',
      nip: '198204112009121001',
      academicStatus: 'AKTIF',
      phone: '0811-7501-101',
      bio: 'Kepala UPT Teknologi Informasi & Komunikasi Politeknik Kampar.',
      academicTitle: 'Ir., M.Kom.',
    },
  },
  {
    email: 'fitriani.dosen@poltek-kampar.ac.id',
    plainPassword: process.env.SEED_DOSEN_PASSWORD || 'DosenPolkam#2026',
    fullName: 'Dr. Fitriani Syahrir, S.T., M.T.',
    identityNumber: 'NIDN-1015088701',
    roleCode: 'DOSEN',
    profile: {
      studyProgram: 'Teknik Informatika',
      organizationalUnit: 'Program Studi D3 Teknik Informatika',
      nidn: '1015088701',
      academicStatus: 'AKTIF',
      phone: '0812-7602-204',
      bio: 'Dosen Koordinator Rekayasa Perangkat Lunak & Arsitektur Sistem Terdistribusi.',
      academicTitle: 'Dr., S.T., M.T.',
    },
  },
  {
    email: 'ridwan.dosen@poltek-kampar.ac.id',
    plainPassword: process.env.SEED_DOSEN_PASSWORD || 'DosenPolkam#2026',
    fullName: 'M. Ridwan Nasution, S.Kom., M.Cs.',
    identityNumber: 'NIDN-1022039002',
    roleCode: 'DOSEN',
    profile: {
      studyProgram: 'Teknik Pengolahan Sawit',
      organizationalUnit: 'Program Studi D3 Teknik Pengolahan Sawit',
      nidn: '1022039002',
      academicStatus: 'AKTIF',
      phone: '0813-6509-318',
      bio: 'Dosen Otomasi Industri & Instrumentasi Pabrik Kelapa Sawit.',
      academicTitle: 'S.Kom., M.Cs.',
    },
  },
  {
    email: 'ahmad.mhs@student.poltek-kampar.ac.id',
    plainPassword: process.env.SEED_MAHASISWA_PASSWORD || 'MhsPolkam#2026',
    fullName: 'Ahmad Fauzan Al-Farisi',
    identityNumber: 'NIM-202413001',
    roleCode: 'MAHASISWA',
    profile: {
      studyProgram: 'Teknik Informatika',
      organizationalUnit: 'Program Studi D3 Teknik Informatika',
      nim: '202413001',
      academicStatus: 'AKTIF',
      admissionYear: 2024,
      phone: '0821-7011-4001',
      bio: 'Mahasiswa Semester 5 Program Studi D3 Teknik Informatika.',
      semesterLevel: 5,
    },
  },
  {
    email: 'siti.mhs@student.poltek-kampar.ac.id',
    plainPassword: process.env.SEED_MAHASISWA_PASSWORD || 'MhsPolkam#2026',
    fullName: 'Siti Rahmawati Putri',
    identityNumber: 'NIM-202413002',
    roleCode: 'MAHASISWA',
    profile: {
      studyProgram: 'Teknik Informatika',
      organizationalUnit: 'Program Studi D3 Teknik Informatika',
      nim: '202413002',
      academicStatus: 'AKTIF',
      admissionYear: 2024,
      phone: '0822-7011-4002',
      bio: 'Mahasiswa Semester 5 Program Studi D3 Teknik Informatika.',
      semesterLevel: 5,
    },
  },
  {
    email: 'dimas.mhs@student.poltek-kampar.ac.id',
    plainPassword: process.env.SEED_MAHASISWA_PASSWORD || 'MhsPolkam#2026',
    fullName: 'Dimas Wahyu Saputra',
    identityNumber: 'NIM-202413003',
    roleCode: 'MAHASISWA',
    profile: {
      studyProgram: 'Teknik Pengolahan Sawit',
      organizationalUnit: 'Program Studi D3 Teknik Pengolahan Sawit',
      nim: '202413003',
      academicStatus: 'AKTIF',
      admissionYear: 2025,
      phone: '0823-7011-4003',
      bio: 'Mahasiswa Semester 3 Program Studi D3 Teknik Pengolahan Sawit.',
      semesterLevel: 3,
    },
  },
  {
    email: 'auditor@poltek-kampar.ac.id',
    plainPassword: process.env.SEED_AUDITOR_PASSWORD || 'AuditorPolkam#2026',
    fullName: 'Drs. Bachtiar Effendi, M.M.',
    identityNumber: 'NIP-197906152008011005',
    roleCode: 'AUDITOR',
    profile: {
      studyProgram: 'Penjaminan Mutu & Audit Akademik',
      organizationalUnit: 'Satuan Penjaminan Mutu Internal (SPMI)',
      nip: '197906152008011005',
      academicStatus: 'AKTIF',
      auditScope:
        'Seluruh Program Studi & Tata Kelola Akademik Politeknik Kampar (Read-Only)',
      phone: '0812-7500-909',
      bio: 'Auditor Mutu Internal SPMI Politeknik Kampar dengan akses pengawasan read-only.',
      academicTitle: 'Drs., M.M.',
    },
  },
];

export async function seedRbacAndUsers(): Promise<void> {
  // Pre-hash passwords outside the DB transaction so we don't hold locks during Argon2id work
  const passwordHashes = new Map<string, string>();
  for (const userDef of SEED_USERS) {
    if (!passwordHashes.has(userDef.plainPassword)) {
      passwordHashes.set(
        userDef.plainPassword,
        await hashPassword(userDef.plainPassword)
      );
    }
  }

  await db.transaction(async (tx) => {
    // 1. Upsert Canonical Roles
    const roleIdByCode = new Map<string, string>();
    for (const roleDef of CANONICAL_ROLES) {
      const [roleRow] = await tx
        .insert(roles)
        .values(roleDef)
        .onConflictDoUpdate({
          target: roles.code,
          set: {
            name: roleDef.name,
            description: roleDef.description,
            isSystem: roleDef.isSystem,
          },
        })
        .returning();
      roleIdByCode.set(roleRow.code, roleRow.id);
    }

    // 2. Upsert Permissions from PERMISSION_REGISTRY
    const permIdByCode = new Map<string, string>();
    for (const permDef of PERMISSION_REGISTRY) {
      const [permRow] = await tx
        .insert(permissions)
        .values({
          code: permDef.code,
          module: permDef.module,
          description: permDef.description,
        })
        .onConflictDoUpdate({
          target: permissions.code,
          set: {
            module: permDef.module,
            description: permDef.description,
          },
        })
        .returning();
      permIdByCode.set(permRow.code, permRow.id);
    }

    // 3. Assign Role-Permission Mappings
    const rpValues: { roleId: string; permissionId: string }[] = [];
    for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
      const roleId = roleIdByCode.get(roleCode);
      if (!roleId) continue;

      const uniqueCodes = new Set(permCodes);
      for (const permCode of uniqueCodes) {
        const permissionId = permIdByCode.get(permCode);
        if (permissionId) {
          rpValues.push({ roleId, permissionId });
        }
      }
    }

    if (rpValues.length > 0) {
      await tx.insert(rolePermissions).values(rpValues).onConflictDoNothing();
    }

    // 4. Upsert Users, Profiles & User-Role Assignments
    for (const userDef of SEED_USERS) {
      const email = userDef.email.toLowerCase();
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email));

      let userId: string;
      if (existingUser) {
        userId = existingUser.id;
      } else {
        const [insertedUser] = await tx
          .insert(users)
          .values({
            email,
            passwordHash: passwordHashes.get(userDef.plainPassword)!,
            fullName: userDef.fullName,
            identityNumber: userDef.identityNumber,
            isActive: true,
            accountStatus: 'ACTIVE',
            mustResetPassword: false,
          })
          .returning({ id: users.id });
        userId = insertedUser.id;
      }

      await tx
        .insert(userProfiles)
        .values({
          userId,
          ...userDef.profile,
        })
        .onConflictDoNothing({
          target: userProfiles.userId,
        });

      const roleId = roleIdByCode.get(userDef.roleCode);
      if (roleId) {
        await tx
          .insert(userRoles)
          .values({ userId, roleId })
          .onConflictDoNothing();
      }
    }
  });
}

async function main() {
  console.log('Seeding EduCoreLMS Roles, Permissions, and Users...');
  await seedRbacAndUsers();
  console.log(
    `Done: ${CANONICAL_ROLES.length} roles, ${PERMISSION_REGISTRY.length} permissions, and ${SEED_USERS.length} users ensured.`
  );
}

const isDirectExecution =
  process.argv[1]?.endsWith('seed-rbac.ts') ||
  process.argv[1]?.endsWith('seed-rbac.js');

if (isDirectExecution) {
  main()
    .catch((error) => {
      console.error('RBAC & User seed failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
