import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { buildMonthGrid } from "@/services/event-service";
import { listUpcomingEvents } from "@/repositories/event-repository";
import { EventForm } from "@/components/event-form";
import { createEventAction } from "@/actions/events";
import { listProjectOptions } from "@/repositories/project-repository";


export const metadata = { title: "Calendar · Nexus" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseMonth(raw: string | undefined, now: Date) {
  const match = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (!match) return { year: now.getFullYear(), month: now.getMonth() };

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11 || year < 1970 || year > 9999) {
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  return { year, month };
}

function monthParam(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function CalendarPage({
  searchParams,
}: PageProps<"/calendar">) {
  const userId = await requireUserId();
  const params = await searchParams;
  const now = new Date();

  const { year, month } = parseMonth(
    typeof params.month === "string" ? params.month : undefined,
    now,
  );

  const [days, upcoming, projects] = await Promise.all([
    buildMonthGrid(userId, year, month, now),
    listUpcomingEvents(userId, now, 5),
    listProjectOptions(userId),
  ]);

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1));

  const prev = month === 0 ? monthParam(year - 1, 11) : monthParam(year, month - 1);
  const next = month === 11 ? monthParam(year + 1, 0) : monthParam(year, month + 1);
  // A multi-day event appears in several day cells, so count distinct ids.
  const eventCount = new Set(
    days.filter((d) => d.inCurrentMonth).flatMap((d) => d.events.map((e) => e.id)),
  ).size;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {monthLabel}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {eventCount} {eventCount === 1 ? "event" : "events"} this month
          </p>
        </div>
        <nav className="flex items-center gap-1.5">
          <Link
            href={`/calendar?month=${prev}`}
            aria-label="Previous month"
            className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-sm text-text transition-colors hover:bg-surface-raised"
          >
            ←
          </Link>
          <Link
            href="/calendar"
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-raised"
          >
            Today
          </Link>
          <Link
            href={`/calendar?month=${next}`}
            aria-label="Next month"
            className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-sm text-text transition-colors hover:bg-surface-raised"
          >
            →
          </Link>
        </nav>
      </header>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="pb-1.5 text-center text-xs font-medium text-text-faint"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle">
            {days.map((day) => (
              <div
                key={day.date.toISOString()}
                className={`min-h-24 bg-surface p-1.5 ${
                  day.inCurrentMonth ? "" : "opacity-40"
                }`}
              >
                <span
                  className={`inline-flex size-5 items-center justify-center rounded-full text-xs ${
                    day.isToday
                      ? "bg-accent font-medium text-white"
                      : "text-text-muted"
                  }`}
                >
                  {day.date.getDate()}
                </span>

                <ul className="mt-1 flex flex-col gap-0.5">
                  {day.events.slice(0, 3).map((event) => (
                    <li key={event.id}>
                      <Link
                        href={`/calendar/${event.id}`}
                        title={`${formatTime(event.startTime)} ${event.title}`}
                        className="block truncate rounded bg-accent-soft px-1 py-0.5 text-[11px] leading-tight text-accent transition-colors hover:bg-accent hover:text-white"
                      >
                        {formatTime(event.startTime)} {event.title}
                      </Link>
                    </li>
                  ))}
                  {day.events.length > 3 && (
                    <li className="px-1 text-[11px] text-text-faint">
                      +{day.events.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">
            Add event
          </h2>
          <EventForm
            action={createEventAction}
            submitLabel="Add event"
            projects={projects}
            resetOnSuccess
          />
        </div>

        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">
            Next up
          </h2>
          {upcoming.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-text-muted">
              Nothing scheduled.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/calendar/${event.id}`}
                    className="block rounded-xl border border-border-subtle bg-surface px-3.5 py-2.5 transition-colors hover:border-border-strong"
                  >
                    <p className="truncate text-sm font-medium text-text">
                      {event.title}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {new Intl.DateTimeFormat("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      }).format(event.startTime)}
                      {" · "}
                      {formatTime(event.startTime)}–{formatTime(event.endTime)}
                      {event.location && ` · ${event.location}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
