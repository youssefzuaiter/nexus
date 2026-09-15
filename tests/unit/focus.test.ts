import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLoad, wordsPerMinute } from "@/lib/focus";

test("words per minute uses the conventional five-character word", () => {
  // 500 chars = 100 words, over two minutes = 50 wpm.
  assert.equal(wordsPerMinute(500, 120), 50);
});

test("no typing or no time is zero rather than a division by zero", () => {
  assert.equal(wordsPerMinute(0, 60), 0);
  assert.equal(wordsPerMinute(100, 0), 0);
  assert.ok(Number.isFinite(wordsPerMinute(100, -5)));
});

test("a long fast session reads as deep", () => {
  assert.equal(classifyLoad(25 * 60, 40), "deep");
});

test("a short burst reads as light", () => {
  assert.equal(classifyLoad(60, 10), "light");
});

test("the labels are ordered by the thresholds they document", () => {
  assert.equal(classifyLoad(10 * 60, 20), "steady");
  assert.equal(classifyLoad(60, 40), "steady");
});
