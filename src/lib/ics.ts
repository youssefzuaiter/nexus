/**
 * A focused RFC 5545 reader for the subset a university timetable actually
 * exports: VEVENTs with DTSTART/DTEND, a weekly RRULE, and EXDATEs.
 *
 * Pure text logic, with no database or environment dependency, so it can be
 * imported and tested without pulling in Prisma — the same split as
 * `lib/chunking.ts`. Anything it cannot represent is skipped rather than
 * guessed at: a feed is untrusted input, not a contract.
 */

export type IcsEvent = {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
};

/** A recurring class every week of a two-semester year is ~40 rows; this is
 *  the ceiling per VEVENT so a malformed or unbounded RRULE cannot flood the
 *  calendar. */
const MAX_OCCURRENCES_PER_EVENT = 120;

/** Total across the whole feed, for the same reason. */
export const MAX_EVENTS_PER_FEED = 2000;

type Line = { name: string; params: Map<string, string>; value: string };

/**
 * Undoes RFC 5545 line folding: a CRLF followed by a space or tab is a
 * continuation of the previous line, not a new one.
 */
function unfold(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const out: string[] = [];

  for (const raw of normalized.split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

function parseLine(raw: string): Line | null {
  // The name/params section ends at the first colon that is not inside a
  // quoted parameter value (TZID values may legally be quoted and contain one).
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;

  const head = raw.slice(0, colon);
  const value = raw.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");

  const params = new Map<string, string>();
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    params.set(
      part.slice(0, eq).toUpperCase(),
      part.slice(eq + 1).replace(/^"|"$/g, ""),
    );
  }

  return { name: name.toUpperCase(), params, value };
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * The UTC instant for a wall-clock time in an IANA zone. Formatting the guess
 * back in that zone reveals the offset that was applied; one correction pass
 * settles it, and a second handles the case where the first landed on the far
 * side of a DST transition.
 */
function fromZonedTime(
  zone: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
): Date {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let result = asUtc;

  for (let pass = 0; pass < 2; pass++) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const parts = new Map(
      formatter.formatToParts(new Date(result)).map((p) => [p.type, p.value]),
    );
    const shown = Date.UTC(
      Number(parts.get("year")),
      Number(parts.get("month")) - 1,
      Number(parts.get("day")),
      // A zone whose local midnight formats as hour 24 exists in the spec;
      // normalising it to 0 keeps Date.UTC from rolling the day forward.
      Number(parts.get("hour")) % 24,
      Number(parts.get("minute")),
      Number(parts.get("second")),
    );
    result = asUtc - (shown - result);
  }

  return new Date(result);
}

/**
 * Parses DTSTART/DTEND/EXDATE values in all three forms a feed may use:
 * UTC (trailing Z), zoned (a TZID parameter), and floating local time. A
 * DATE-only value is treated as local midnight.
 */
function parseDateValue(line: Line): Date | null {
  const value = line.value.trim();
  const zone = line.params.get("TZID");

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  if (!match) return null;

  const [, y, mo, d, h, mi, s, utc] = match;
  const nums = [y, mo, d, h, mi, s].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  if (utc) {
    return new Date(
      Date.UTC(nums[0], nums[1] - 1, nums[2], nums[3], nums[4], nums[5]),
    );
  }

  if (zone) {
    try {
      return fromZonedTime(zone, ...nums);
    } catch {
      // An unknown TZID throws inside Intl; falling back to local time is
      // better than dropping the class from the timetable entirely.
    }
  }

  return new Date(nums[0], nums[1] - 1, nums[2], nums[3], nums[4], nums[5]);
}

const WEEKDAY_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  until: Date | null;
  byDay: number[];
};

function parseRule(value: string): Rule | null {
  const parts = new Map<string, string>();
  for (const chunk of value.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq !== -1) {
      parts.set(chunk.slice(0, eq).toUpperCase(), chunk.slice(eq + 1));
    }
  }

  const freq = parts.get("FREQ")?.toUpperCase();
  if (
    freq !== "DAILY" &&
    freq !== "WEEKLY" &&
    freq !== "MONTHLY" &&
    freq !== "YEARLY"
  ) {
    return null;
  }

  const untilRaw = parts.get("UNTIL");
  const until = untilRaw
    ? parseDateValue({ name: "UNTIL", params: new Map(), value: untilRaw })
    : null;

  const byDay = (parts.get("BYDAY") ?? "")
    .split(",")
    .map((day) => WEEKDAY_INDEX[day.trim().slice(-2).toUpperCase()])
    .filter((index) => index !== undefined);

  const countRaw = Number(parts.get("COUNT"));

  return {
    freq,
    interval: Math.max(1, Number(parts.get("INTERVAL")) || 1),
    count: Number.isFinite(countRaw) && countRaw > 0 ? countRaw : null,
    until,
    byDay,
  };
}

function addStep(date: Date, rule: Rule, steps: number): Date {
  const next = new Date(date);
  const amount = rule.interval * steps;

  if (rule.freq === "DAILY") next.setDate(next.getDate() + amount);
  else if (rule.freq === "WEEKLY") next.setDate(next.getDate() + amount * 7);
  else if (rule.freq === "MONTHLY") next.setMonth(next.getMonth() + amount);
  else next.setFullYear(next.getFullYear() + amount);

  return next;
}

/**
 * Expands a rule into concrete start times. A weekly rule with BYDAY produces
 * every named weekday of each active week — the shape a timetable uses for a
 * course that meets twice a week.
 */
function expand(start: Date, rule: Rule): Date[] {
  const limit = rule.count
    ? Math.min(rule.count, MAX_OCCURRENCES_PER_EVENT)
    : MAX_OCCURRENCES_PER_EVENT;

  const out: Date[] = [];
  const weekly = rule.freq === "WEEKLY" && rule.byDay.length > 0;

  for (let step = 0; out.length < limit && step < MAX_OCCURRENCES_PER_EVENT; step++) {
    const base = addStep(start, rule, step);

    const candidates: Date[] = [];
    if (weekly) {
      // Monday-based week containing `base`, then each requested weekday in it.
      const weekStart = new Date(base);
      weekStart.setDate(base.getDate() - ((base.getDay() + 6) % 7));
      for (const weekday of [...rule.byDay].sort()) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + ((weekday + 6) % 7));
        day.setHours(
          start.getHours(),
          start.getMinutes(),
          start.getSeconds(),
          0,
        );
        if (day >= start) candidates.push(day);
      }
    } else {
      candidates.push(base);
    }

    for (const candidate of candidates) {
      if (out.length >= limit) break;
      if (rule.until && candidate > rule.until) return out;
      out.push(candidate);
    }

    if (rule.until && base > rule.until) break;
  }

  return out;
}

/**
 * Every event in the feed, with recurrences already expanded into concrete
 * instances. Recurring instances get a `uid` suffixed with their start time so
 * each one is separately addressable when the feed is re-synced.
 */
export function parseIcs(text: string): IcsEvent[] {
  const lines = unfold(text);
  const events: IcsEvent[] = [];

  let current: Line[] | null = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (trimmed === "END:VEVENT") {
      if (current) events.push(...buildEvents(current));
      current = null;
      continue;
    }
    if (!current) continue;

    const line = parseLine(raw);
    if (line) current.push(line);
  }

  return events.slice(0, MAX_EVENTS_PER_FEED);
}

const HOUR_MS = 60 * 60 * 1000;

function buildEvents(lines: Line[]): IcsEvent[] {
  const find = (name: string) => lines.find((line) => line.name === name);

  const startLine = find("DTSTART");
  if (!startLine) return [];

  const start = parseDateValue(startLine);
  if (!start || Number.isNaN(start.getTime())) return [];

  const endLine = find("DTEND");
  const parsedEnd = endLine ? parseDateValue(endLine) : null;

  // An event with no DTEND is not zero-length. A DATE-only start (a holiday in
  // a term calendar) runs the whole day; a timed one defaults to an hour,
  // which reads better on a grid than a zero-width sliver.
  const allDay = /^\d{8}$/.test(startLine.value.trim());
  const fallbackEnd = new Date(start);
  if (allDay) fallbackEnd.setDate(fallbackEnd.getDate() + 1);
  else fallbackEnd.setTime(start.getTime() + HOUR_MS);

  const end = parsedEnd && parsedEnd > start ? parsedEnd : fallbackEnd;
  const durationMs = end.getTime() - start.getTime();

  const uid = find("UID")?.value.trim() || `${start.toISOString()}-${find("SUMMARY")?.value ?? ""}`;
  const title = unescapeText(find("SUMMARY")?.value ?? "").trim() || "Untitled event";
  const description = find("DESCRIPTION")?.value
    ? unescapeText(find("DESCRIPTION")!.value).trim() || null
    : null;
  const location = find("LOCATION")?.value
    ? unescapeText(find("LOCATION")!.value).trim() || null
    : null;

  const excluded = new Set(
    lines
      .filter((line) => line.name === "EXDATE")
      .flatMap((line) =>
        line.value
          .split(",")
          .map((value) => parseDateValue({ ...line, value })?.getTime())
          .filter((time): time is number => time !== undefined),
      ),
  );

  const ruleLine = find("RRULE");
  const rule = ruleLine ? parseRule(ruleLine.value) : null;
  const starts = rule ? expand(start, rule) : [start];

  return starts
    .filter((occurrence) => !excluded.has(occurrence.getTime()))
    .map((occurrence, index) => ({
      // The first instance keeps the bare UID so a feed that later drops its
      // RRULE still updates the same row rather than orphaning it.
      uid: index === 0 && starts.length === 1 ? uid : `${uid}#${occurrence.toISOString()}`,
      title,
      description,
      location,
      start: occurrence,
      end: new Date(occurrence.getTime() + durationMs),
    }));
}
