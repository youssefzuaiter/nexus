import "server-only";
import { PDFParse } from "pdf-parse";
import { AppError } from "@/lib/api-response";

// Matches the Zod cap on Note.content in actions/notes.ts — an imported PDF
// becomes a note, so it is bound by the same limit.
export const MAX_TEXT_LENGTH = 100_000;

/**
 * Validates and caps raw extracted text. Kept separate from the PDF parsing
 * itself so this pure string logic — the empty-text rejection, the
 * truncation marker — is testable without needing a real PDF fixture.
 */
export function normalizeExtractedText(rawText: string): string {
  const text = rawText.trim();

  if (!text) {
    throw new AppError(
      "VALIDATION_ERROR",
      "That PDF has no extractable text — it may be scanned images rather than real text.",
    );
  }

  return text.length > MAX_TEXT_LENGTH
    ? `${text.slice(0, MAX_TEXT_LENGTH)}\n\n[Truncated — the original document continues beyond this point.]`
    : text;
}

/**
 * Extracts plain text from a PDF's raw bytes. A scanned (image-only) PDF
 * yields no text — that is reported as a validation error rather than
 * silently creating an empty note, since the user's action produced nothing
 * usable.
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data });
    const result = await parser.getText();
    return normalizeExtractedText(result.text);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION_ERROR", "Could not read that file as a PDF.");
  } finally {
    await parser?.destroy();
  }
}
