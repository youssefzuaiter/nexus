export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

// A bounded, one-time materialization rather than an open-ended rule: there is
// no background job in this app to keep generating future occurrences, so a
// series is exactly this many concrete rows, capped to keep a mistyped count
// from creating thousands of rows in one request.
export const MAX_RECURRENCE_COUNT = 52;
export const DEFAULT_RECURRENCE_COUNT = 8;

/**
 * `count` dates starting at (and including) `start`, spaced by `frequency`.
 * Monthly steps land on the same day-of-month, sliding to the last valid day
 * of a shorter month rather than overflowing into the next one — `setMonth`
 * on the 31st of a 30-day target would otherwise roll into the month after.
 */
export function generateOccurrences(
  start: Date,
  frequency: RecurrenceFrequency,
  count: number,
): Date[] {
  const n = Math.min(Math.max(Math.trunc(count), 1), MAX_RECURRENCE_COUNT);

  return Array.from({ length: n }, (_, i) => {
    if (frequency === "daily") {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      return date;
    }
    if (frequency === "weekly") {
      const date = new Date(start);
      date.setDate(date.getDate() + i * 7);
      return date;
    }
    const targetMonth = start.getMonth() + i;
    const daysInTargetMonth = new Date(
      start.getFullYear(),
      targetMonth + 1,
      0,
    ).getDate();
    const date = new Date(start);
    date.setDate(1); // avoid a same-day overflow while the month is still wrong
    date.setMonth(targetMonth);
    date.setDate(Math.min(start.getDate(), daysInTargetMonth));
    return date;
  });
}
