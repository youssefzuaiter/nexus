import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "@/lib/chunking";

const MAX = 1200;

test("short text is one chunk", () => {
  assert.deepEqual(chunkText("A single short paragraph."), [
    "A single short paragraph.",
  ]);
});

test("empty or whitespace-only text produces no chunks", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   \n\n  "), []);
});

test("no chunk exceeds the budget, however the text is shaped", () => {
  const cases = [
    "word ".repeat(2000),
    "A".repeat(5000),
    Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ${"x".repeat(200)}`).join("\n\n"),
    `${"Sentence without punctuation ".repeat(300)}`,
  ];

  for (const text of cases) {
    for (const chunk of chunkText(text)) {
      assert.ok(chunk.length <= MAX, `chunk of ${chunk.length} exceeds ${MAX}`);
    }
  }
});

test("a single unbroken run longer than the budget is still split", () => {
  const chunks = chunkText("A".repeat(5000));
  assert.ok(chunks.length >= 4);
});

test("chunks are trimmed rather than carrying edge whitespace", () => {
  for (const chunk of chunkText("First para.\n\n   Second para.   \n\nThird.")) {
    assert.equal(chunk, chunk.trim());
  }
});

test("the text survives chunking — nothing is silently dropped", () => {
  const text = Array.from(
    { length: 30 },
    (_, i) => `Paragraph ${i} carries a distinctive marker M${i}.`,
  ).join("\n\n");

  const joined = chunkText(text).join(" ");
  for (let i = 0; i < 30; i++) {
    assert.ok(joined.includes(`M${i}`), `marker M${i} was lost`);
  }
});
