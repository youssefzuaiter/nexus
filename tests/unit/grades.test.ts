import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise, neededForTarget, type Assessed } from "@/lib/grades";

const midterm: Assessed = { weight: 30, score: 72, maxScore: 100 };
const homework: Assessed = { weight: 20, score: 90, maxScore: 100 };
const final: Assessed = { weight: 50, score: null, maxScore: 100 };

test("banked points weight each score by its share of the course", () => {
  const summary = summarise([midterm, homework, final]);
  // 30 * 0.72 + 20 * 0.90
  assert.equal(Number(summary.earned.toFixed(2)), 39.6);
  assert.equal(summary.gradedWeight, 50);
  assert.equal(summary.remainingWeight, 50);
});

test("the average so far ignores what has not been marked", () => {
  const summary = summarise([midterm, homework, final]);
  assert.equal(Number(summary.currentAverage!.toFixed(1)), 79.2);
});

test("nothing marked yet gives no average rather than a zero", () => {
  const summary = summarise([final]);
  assert.equal(summary.currentAverage, null);
  assert.equal(summary.earned, 0);
});

test("best possible assumes full marks on everything left", () => {
  const summary = summarise([midterm, homework, final]);
  assert.equal(Number(summary.bestPossible.toFixed(1)), 89.6);
});

test("needed tells you the average required across the remainder", () => {
  const summary = summarise([midterm, homework, final]);
  const needed = neededForTarget(summary, 80);

  assert.equal(needed.kind, "needed");
  // (80 - 39.6) / 50 * 100
  assert.equal(
    Number((needed as { percent: number }).percent.toFixed(1)),
    80.8,
  );
});

test("an unreachable target is reported as impossible, with the shortfall", () => {
  const summary = summarise([midterm, homework, final]);
  const needed = neededForTarget(summary, 95);

  assert.equal(needed.kind, "impossible");
  assert.equal(
    Number((needed as { short: number }).short.toFixed(1)),
    5.4,
  );
});

test("a target already banked is reported as achieved, not as 0% needed", () => {
  const summary = summarise([
    { weight: 60, score: 95, maxScore: 100 },
    { weight: 40, score: null, maxScore: 100 },
  ]);
  assert.equal(neededForTarget(summary, 50).kind, "achieved");
});

test("scores are read against their own maximum, not assumed out of 100", () => {
  const summary = summarise([{ weight: 100, score: 18, maxScore: 20 }]);
  assert.equal(summary.earned, 90);
});

test("bonus marks above the maximum count, negatives do not", () => {
  assert.equal(summarise([{ weight: 10, score: 110, maxScore: 100 }]).earned, 11);
  assert.equal(summarise([{ weight: 10, score: -5, maxScore: 100 }]).earned, 0);
});

test("weights that do not add to 100 are reported rather than normalised", () => {
  const summary = summarise([
    { weight: 30, score: 100, maxScore: 100 },
    { weight: 40, score: null, maxScore: 100 },
  ]);
  assert.equal(summary.declaredWeight, 70);
  assert.equal(summary.earned, 30);
});
