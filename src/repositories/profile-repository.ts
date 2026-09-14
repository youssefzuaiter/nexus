import "server-only";
import { prisma } from "@/lib/prisma";
import type { UserProfileModel as UserProfile } from "@/generated/prisma/models";

export type ProfileInput = {
  university: string;
  program: string;
  studentId: string;
};

/**
 * Accounts created before the profile row existed have none, so this creates
 * the row on first read rather than returning null and pushing the empty case
 * onto every caller.
 */
export async function getProfile(userId: string): Promise<UserProfile> {
  return prisma.userProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function updateProfile(
  userId: string,
  input: ProfileInput,
): Promise<UserProfile> {
  return prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
}
