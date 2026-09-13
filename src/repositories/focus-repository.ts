import "server-only";
import { prisma } from "@/lib/prisma";
import type { FocusTelemetryModel as FocusTelemetry } from "@/generated/prisma/models";

export async function isTrackingEnabled(userId: string): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { focusTrackingEnabled: true },
  });
  return profile?.focusTrackingEnabled ?? false;
}

export async function setTrackingEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  // upsert because a profile row may not exist for accounts created before the
  // profile was introduced.
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, focusTrackingEnabled: enabled },
    update: { focusTrackingEnabled: enabled },
  });
}

export async function recordSession(
  userId: string,
  session: {
    sessionDuration: number;
    typingSpeedWpm: number;
    cognitiveLoad: string;
  },
): Promise<FocusTelemetry> {
  return prisma.focusTelemetry.create({ data: { ...session, userId } });
}

export async function listSessions(
  userId: string,
  take = 30,
): Promise<FocusTelemetry[]> {
  return prisma.focusTelemetry.findMany({
    where: { userId },
    orderBy: { recordedAt: "desc" },
    take,
  });
}

export async function deleteAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.focusTelemetry.deleteMany({ where: { userId } });
  return count;
}
