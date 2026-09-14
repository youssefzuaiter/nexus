import "server-only";
import { prisma } from "@/lib/prisma";
import { completeJson, type ChatMessage } from "@/lib/ollama";
import { z } from "zod";
import { AppError } from "@/lib/api-response";

export type WeeklyReview = {
  from: Date;
  to: Date;
  completed: { id: string; title: string; completedAt: Date }[];
  slipped: { id: string; title: string; dueDate: Date }[];
  notesWritten: { id: string; title: string; updatedAt: Date }[];
  eventsAttended: number;
  cardsReviewed: number;
  upcoming: { id: string; title: string; dueDate: Date }[];
};

/** Midnight seven days ago, so the window is whole days rather than a rolling
 *  168 hours that cuts a day in half. */
export function reviewWindow(now: Date = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export async function buildWeeklyReview(
  userId: string,
  now: Date = new Date(),
): Promise<WeeklyReview> {
  const { from, to } = reviewWindow(now);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const [completed, slipped, notesWritten, eventsAttended, cardsReviewed, upcoming] =
    await Promise.all([
      prisma.task.findMany({
        where: {
          userId,
          deletedAt: null,
          status: "done",
          completedAt: { gte: from, lte: to },
        },
        select: { id: true, title: true, completedAt: true },
        orderBy: { completedAt: "desc" },
      }),
      // Still open, and its due date has already passed — the week's misses.
      prisma.task.findMany({
        where: {
          userId,
          deletedAt: null,
          status: { not: "done" },
          dueDate: { lt: startOfToday, gte: from },
        },
        select: { id: true, title: true, dueDate: true },
        orderBy: { dueDate: "asc" },
      }),
      prisma.note.findMany({
        where: { userId, deletedAt: null, updatedAt: { gte: from, lte: to } },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.event.count({
        where: { userId, startTime: { gte: from, lte: to } },
      }),
      prisma.flashcard.count({
        where: { userId, lastReviewed: { gte: from, lte: to } },
      }),
      prisma.task.findMany({
        where: {
          userId,
          deletedAt: null,
          status: { not: "done" },
          dueDate: { gte: startOfToday, lte: nextWeek },
        },
        select: { id: true, title: true, dueDate: true },
        orderBy: { dueDate: "asc" },
      }),
    ]);

  return {
    from,
    to,
    completed: completed.flatMap((task) =>
      task.completedAt ? [{ ...task, completedAt: task.completedAt }] : [],
    ),
    slipped: slipped.flatMap((task) =>
      task.dueDate ? [{ ...task, dueDate: task.dueDate }] : [],
    ),
    notesWritten,
    eventsAttended,
    cardsReviewed,
    upcoming: upcoming.flatMap((task) =>
      task.dueDate ? [{ ...task, dueDate: task.dueDate }] : [],
    ),
  };
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    suggestion: { type: "string" },
  },
  required: ["summary", "suggestion"],
} as const;

const summaryOutput = z.object({
  summary: z.string().trim().min(1).max(1200),
  suggestion: z.string().trim().min(1).max(600),
});

function titles(items: { title: string }[], limit: number): string {
  if (items.length === 0) return "none";
  return items
    .slice(0, limit)
    .map((item) => item.title)
    .join("; ");
}

/**
 * An optional narrative over the counts above. The numbers are computed in
 * code and rendered whether or not this succeeds — the model writes prose
 * about a week, it is never the source of what happened.
 */
export async function summariseWeek(
  review: WeeklyReview,
): Promise<{ summary: string; suggestion: string }> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You write a short, plain weekly review for a student, in the second person.",
        "Two or three sentences of summary, then one concrete suggestion for next week.",
        "Use only the figures given. Never invent work that is not listed.",
        "No praise padding, no motivational filler.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Tasks finished (${review.completed.length}): ${titles(review.completed, 12)}`,
        `Tasks past their due date and still open (${review.slipped.length}): ${titles(review.slipped, 12)}`,
        `Notes written or edited (${review.notesWritten.length}): ${titles(review.notesWritten, 10)}`,
        `Calendar events: ${review.eventsAttended}`,
        `Flashcards reviewed: ${review.cardsReviewed}`,
        `Due in the next seven days (${review.upcoming.length}): ${titles(review.upcoming, 12)}`,
      ].join("\n"),
    },
  ];

  const parsed = summaryOutput.safeParse(
    await completeJson(messages, SUMMARY_SCHEMA),
  );
  if (!parsed.success) {
    throw new AppError(
      "AI_OUTPUT_INVALID",
      "The model did not return a usable summary.",
    );
  }
  return parsed.data;
}
