import "server-only";
import { indexEntity, deleteEntityEmbeddings } from "@/lib/vector";
import { AppError } from "@/lib/api-response";
import * as eventRepository from "@/repositories/event-repository";
import { assertProjectOwned } from "@/services/project-service";
import type { EventInput } from "@/repositories/event-repository";
import type { EventModel as Event } from "@/generated/prisma/models";

export type CalendarDay = {
  date: Date;
  inCurrentMonth: boolean;
  isToday: boolean;
  events: Event[];
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

// Embedded as a natural sentence rather than "When: …/Where: …" key-value lines.
// Measured against nomic-embed-text, the prose form scores markedly higher on
// real questions — "where is my exam being held" went from 0.52 (below the
// relevance floor, so invisible to the assistant) to 0.56, and queries that
// already matched improved too. Keep new entity types phrased the same way.
function embeddableText(event: Event): string {
  const sameDay =
    event.startTime.toDateString() === event.endTime.toDateString();

  const when = sameDay
    ? `on ${DATE_FORMAT.format(event.startTime)}, from ${TIME_FORMAT.format(event.startTime)} to ${TIME_FORMAT.format(event.endTime)}`
    : `from ${DATE_FORMAT.format(event.startTime)} at ${TIME_FORMAT.format(event.startTime)} until ${DATE_FORMAT.format(event.endTime)} at ${TIME_FORMAT.format(event.endTime)}`;

  const sentence = `${event.title}. This is a calendar event ${when}${
    event.location ? `, taking place at ${event.location}` : ""
  }.`;

  return event.description ? `${sentence}\n\n${event.description}` : sentence;
}

async function syncEventIndex(userId: string, event: Event): Promise<void> {
  try {
    await indexEntity(userId, "event", event.id, embeddableText(event));
  } catch (error) {
    console.error(`[WARN] Failed to index event ${event.id}:`, error);
    await deleteEntityEmbeddings(userId, "event", event.id).catch(() => {});
  }
}

function assertValidRange(input: EventInput): void {
  if (input.endTime <= input.startTime) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The event must end after it starts.",
    );
  }
}

export async function createEvent(
  userId: string,
  input: EventInput,
): Promise<Event> {
  assertValidRange(input);
  await assertProjectOwned(userId, input.projectId);
  const event = await eventRepository.createEvent(userId, input);
  await syncEventIndex(userId, event);
  return event;
}

export async function updateEvent(
  userId: string,
  eventId: string,
  input: EventInput,
): Promise<Event> {
  assertValidRange(input);
  await assertProjectOwned(userId, input.projectId);
  const event = await eventRepository.updateEvent(userId, eventId, input);
  if (!event) {
    throw new AppError("RESOURCE_NOT_FOUND", "That event no longer exists.");
  }
  await syncEventIndex(userId, event);
  return event;
}

export async function deleteEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  const deleted = await eventRepository.deleteEvent(userId, eventId);
  if (!deleted) {
    throw new AppError("RESOURCE_NOT_FOUND", "That event no longer exists.");
  }
  await deleteEntityEmbeddings(userId, "event", eventId);
}

export function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1, 0, 0, 0, 0);
}

/**
 * Six weeks of days covering the given month, always starting on a Monday, so
 * the grid height never changes between months.
 */
export async function buildMonthGrid(
  userId: string,
  year: number,
  month: number,
  now = new Date(),
): Promise<CalendarDay[]> {
  const first = startOfMonth(year, month);

  const gridStart = new Date(first);
  const weekdayFromMonday = (first.getDay() + 6) % 7;
  gridStart.setDate(first.getDate() - weekdayFromMonday);

  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 42);

  const events = await eventRepository.listEventsInRange(
    userId,
    gridStart,
    gridEnd,
  );

  const todayKey = dayKey(now);

  return Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + offset);

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return {
      date,
      inCurrentMonth: date.getMonth() === month && date.getFullYear() === year,
      isToday: dayKey(date) === todayKey,
      events: events.filter(
        (event) => event.startTime <= dayEnd && event.endTime >= dayStart,
      ),
    };
  });
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
