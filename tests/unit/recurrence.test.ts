import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateOccurrences,
  MAX_RECURRENCE_COUNT,
} from "@/lib/recurrence";

test("daily occurrences step one day at a time and include the start", () => {
  const dates = generateOccurrences(new Date(2026, 8, 14), "daily", 3);
  assert.deepEqual(
    dates.map((date) => date.getDate()),
    [14, 15, 16],
  );
});

test("weekly occurrences step seven days", () => {
  const dates = generateOccurrences(new Date(2026, 8, 1), "weekly", 3);
  assert.deepEqual(
    dates.map((date) => date.getDate()),
    [1, 8, 15],
  );
});

test("monthly occurrences keep the day of month", () => {
  const dates = generateOccurrences(new Date(2026, 0, 15), "monthly", 3);
  assert.deepEqual(
    dates.map((date) => [date.getMonth(), date.getDate()]),
    [
      [0, 15],
      [1, 15],
      [2, 15],
    ],
  );
});

test("the 31st clamps to the last day of a short month instead of overflowing", () => {
  const dates = generateOccurrences(new Date(2026, 0, 31), "monthly", 2);
  // 2026 is not a leap year, so February has 28 days — not a roll into March.
  assert.equal(dates[1].getMonth(), 1);
  assert.equal(dates[1].getDate(), 28);
});

test("a count is clamped to the documented ceiling", () => {
  const dates = generateOccurrences(new Date(2026, 0, 1), "daily", 9999);
  assert.equal(dates.length, MAX_RECURRENCE_COUNT);
});

test("a count below one still yields the original occurrence", () => {
  assert.equal(generateOccurrences(new Date(2026, 0, 1), "daily", 0).length, 1);
});

test("the time of day is preserved across occurrences", () => {
  const dates = generateOccurrences(new Date(2026, 0, 1, 14, 30), "weekly", 3);
  for (const date of dates) {
    assert.equal(date.getHours(), 14);
    assert.equal(date.getMinutes(), 30);
  }
});
