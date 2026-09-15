import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleReview, type CardState } from "@/lib/spaced-repetition";

const NOW = new Date("2026-09-14T12:00:00Z");
const fresh: CardState = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };

test("a good streak follows the SM-2 ladder", () => {
  let state: CardState = fresh;
  const intervals: number[] = [];

  for (let i = 0; i < 5; i++) {
    const next = scheduleReview(state, "good", NOW);
    intervals.push(next.intervalDays);
    state = next;
  }

  // 1 and 6 are fixed by the algorithm; everything after is interval * ease.
  assert.deepEqual(intervals, [1, 6, 15, 38, 95]);
});

test("quality 4 leaves the ease factor untouched", () => {
  const next = scheduleReview(fresh, "good", NOW);
  assert.equal(next.easeFactor, 2.5);
});

test("a lapse resets the ladder and returns the card in ten minutes", () => {
  const mature: CardState = { easeFactor: 2.5, intervalDays: 95, repetitions: 5 };
  const lapsed = scheduleReview(mature, "again", NOW);

  assert.equal(lapsed.repetitions, 0);
  assert.equal(lapsed.intervalDays, 0);
  assert.ok(lapsed.easeFactor < 2.5, "ease must fall on a lapse");
  assert.equal(lapsed.dueAt.getTime() - NOW.getTime(), 10 * 60 * 1000);
});

test("hard advances the schedule but shortens it relative to good", () => {
  const mature: CardState = { easeFactor: 2.5, intervalDays: 10, repetitions: 3 };
  const hard = scheduleReview(mature, "hard", NOW);
  const good = scheduleReview(mature, "good", NOW);

  assert.ok(hard.repetitions === 4, "hard is still a pass");
  assert.ok(hard.intervalDays < good.intervalDays);
  assert.ok(hard.easeFactor < good.easeFactor);
});

test("the ease factor never falls below the 1.3 floor", () => {
  let state: CardState = { easeFactor: 1.4, intervalDays: 10, repetitions: 4 };
  for (let i = 0; i < 10; i++) state = scheduleReview(state, "hard", NOW);
  assert.equal(state.easeFactor, 1.3);
});

test("intervals are capped so a date stays sensible", () => {
  let state: CardState = { easeFactor: 2.5, intervalDays: 400, repetitions: 9 };
  for (let i = 0; i < 5; i++) state = scheduleReview(state, "easy", NOW);
  assert.equal(state.intervalDays, 730);
});

test("a scheduled card is due at the start of its day, not the hour it was reviewed", () => {
  const late = new Date("2026-09-14T23:30:00");
  const next = scheduleReview(fresh, "good", late);

  assert.equal(next.dueAt.getHours(), 0);
  assert.equal(next.dueAt.getMinutes(), 0);
});
