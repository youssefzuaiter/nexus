import "server-only";
import { prisma } from "@/lib/prisma";

export type Reminder = {
  id: string;
  title: string;
  kind: "task" | "event";
  /** ISO timestamp of what is being reminded about. */
  at: string;
};

/**
 * What is imminent: tasks due today that are still open, and events starting
 * within the hour.
 *
 * Extracted out of the action (rather than left as `dueRemindersAction`'s own
 * inline queries) so it takes `userId` as an explicit parameter, the same
 * shape every other entity's service function already has — a "use server"
 * action calls `requireUserId()`, which needs a real request context and so
 * cannot be exercised directly by a test the way `note-service.ts` etc. can.
 */
export async function getDueReminders(
  userId: string,
  now: Date,
): Promise<Reminder[]> {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const withinTheHour = new Date(now.getTime() + 60 * 60 * 1000);

  const [tasks, events] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { not: "done" },
        dueDate: { lte: endOfToday },
      },
      select: { id: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    prisma.event.findMany({
      where: { userId, startTime: { gte: now, lte: withinTheHour } },
      select: { id: true, title: true, startTime: true },
      orderBy: { startTime: "asc" },
      take: 20,
    }),
  ]);

  return [
    ...tasks.map((task) => ({
      id: `task:${task.id}`,
      title: task.title,
      kind: "task" as const,
      at: (task.dueDate ?? now).toISOString(),
    })),
    ...events.map((event) => ({
      id: `event:${event.id}`,
      title: event.title,
      kind: "event" as const,
      at: event.startTime.toISOString(),
    })),
  ];
}
