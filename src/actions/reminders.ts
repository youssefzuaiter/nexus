"use server";

import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { type ApiResponse, ok, toApiResponse } from "@/lib/api-response";

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
 * Polled by the browser rather than pushed. This app has no job runner and no
 * server process outside a request, so a real scheduler would be a whole piece
 * of infrastructure for one feature — and a reminder is only useful while the
 * app is open anyway, since nothing else would deliver it.
 */
export async function dueRemindersAction(): Promise<ApiResponse<Reminder[]>> {
  try {
    const userId = await requireUserId();
    const now = new Date();

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

    return ok([
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
    ]);
  } catch (error) {
    return toApiResponse(error);
  }
}
