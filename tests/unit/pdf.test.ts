import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeExtractedText, MAX_TEXT_LENGTH } from "@/lib/pdf";
import { AppError } from "@/lib/api-response";

test("a scanned PDF with no text is refused rather than saved as an empty note", () => {
  assert.throws(
    () => normalizeExtractedText("   \n  "),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR",
  );
});

test("ordinary text passes through trimmed", () => {
  assert.equal(normalizeExtractedText("  Real content.  "), "Real content.");
});

test("over-long text is truncated and says so", () => {
  const result = normalizeExtractedText("x".repeat(MAX_TEXT_LENGTH + 5000));
  assert.ok(result.length < MAX_TEXT_LENGTH + 200);
  assert.ok(result.includes("Truncated"));
});

test("text exactly at the limit is not marked truncated", () => {
  const result = normalizeExtractedText("x".repeat(MAX_TEXT_LENGTH));
  assert.ok(!result.includes("Truncated"));
});
