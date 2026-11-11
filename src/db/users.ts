import { db } from './index.ts';
import { users, userProfiles, roles, userRoles } from './schema.ts';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';

export async function getOrCreateUser(uid: string, email: string, fullName?: string) {
  try {
    const defaultPasswordHash = await argon2.hash(`oauth_${uid}`, {
      type: argon2.argon2id,
    });

    const result = await db
      .insert(users)
      .values({
        uid,
        email: email.toLowerCase(),
        fullName: fullName || email.split('@')[0],
        passwordHash: defaultPasswordHash,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          uid,
          lastLoginAt: new Date(),
        },
      })
      .returning();

    const user = result[0];

    // Ensure profile exists
    await db
      .insert(userProfiles)
      .values({
        userId: user.id,
        studyProgram: 'Teknik Informatika',
      })
      .onConflictDoNothing({
        target: userProfiles.userId,
      });

    // Ensure default role (MAHASISWA) exists if user has no roles
    const existingRoles = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));

    if (existingRoles.length === 0) {
      const mhsRole = await db
        .select()
        .from(roles)
        .where(eq(roles.code, 'MAHASISWA'));
      if (mhsRole[0]) {
        await db
          .insert(userRoles)
          .values({
            userId: user.id,
            roleId: mhsRole[0].id,
          })
          .onConflictDoNothing();
      }
    }

    return user;
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}
