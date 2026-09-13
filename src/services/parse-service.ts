import "server-only";
import { z } from "zod";
import { completeJson, type ChatMessage } from "@/lib/ollama";
import { parseNaturalDate, stripMatches } from "@/lib/natural-date";
import { TASK_PRIORITIES } from "@/lib/domain";

export type Proposal =
  | {
      kind: "task";
      title: string;
      dueDate: string | null;
      priority: (typeof TASK_PRIORITIES)[number];
      estimatedMinutes: number;
    }
  | {
      kind: "event";
      title: string;
      startTime: string;
      endTime: string;
      location: string | null;
    }
  | {
      kind: "note";
      title: string;
      content: string;
    };

const DEFAULT_EVENT_MINUTES = 60;
const DEFAULT_TASK_MINUTES = 60;

// Ollama enforces this at decode time, so the model cannot return a stray shape.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["task", "event", "note"] },
    title: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high"] },
    location: { type: "string" },
    durationMinutes: { type: "integer" },
  },
  required: ["kind", "title"],
} as const;

// Schema conformance is not correctness: the model can still return an empty
// title or a nonsense duration, so everything is re-checked here.
const modelOutput = z.object({
  kind: z.enum(["task", "event", "note"]),
  title: z.string().trim().min(1).max(200),
  priority: z.enum(TASK_PRIORITIES).optional(),
  location: z.string().trim().max(200).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(60 * 24).optional(),
});

const SYSTEM_PROMPT = `You classify a short piece of captured text into one of three kinds and extract a clean title.

- "event" — something happening at a time with other people or in a place: meetings, lectures, appointments, calls.
- "task" — something the user must do: submit, finish, email, buy, revise, book.
- "note" — an idea, fact or thought to remember, with no action and no time.

Return the title as the user's own words with date and time words removed. Do not summarise, re-word, or title-case it.

Set "location" only if a place is explicitly named. Set "priority" only if urgency is stated ("urgent" and "asap" mean high). Set "durationMinutes" only if a length is stated.`;

function isoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function fallbackTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
}

/**
 * Turns captured text into a *proposal*. It never writes anything: the caller
 * shows it to the user for confirmation, which is what keeps a model that can be
 * talked into nonsense from acting on its own.
 */
export async function parseCapture(
  text: string,
  now = new Date(),
): Promise<Proposal> {
  const when = parseNaturalDate(text, now);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Captured text: ${text}` },
  ];

  let parsed: z.infer<typeof modelOutput> | null = null;
  try {
    const result = modelOutput.safeParse(
      await completeJson(messages, RESPONSE_SCHEMA),
    );
    if (result.success) parsed = result.data;
  } catch {
    // A missing or unusable model degrades the feature, it does not break it.
    parsed = null;
  }

  // Dates always come from the deterministic parser, never from the model.
  const stripped = stripMatches(text, when.matched);

  // The user's own words, minus the date phrases, beat the model's title: asked
  // to "keep the wording" a 3B model still summarises, turning "coffee with Ada
  // at Starbucks" into "Coffee Meeting" and losing both the person and place.
  // The model's title is only a fallback for when stripping leaves nothing.
  const title = fallbackTitle(stripped) || parsed?.title?.trim() || fallbackTitle(text);

  // With a date but no classification, an appointment-like phrase is far more
  // often an event than a note, but without the model we cannot tell, so a task
  // is the safer default: it is the easiest for the user to correct.
  const kind = parsed?.kind ?? (when.date ? "task" : "note");

  if (kind === "event") {
    const start = when.date ?? now;
    const minutes = parsed?.durationMinutes ?? DEFAULT_EVENT_MINUTES;
    return {
      kind: "event",
      title,
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + minutes * 60_000).toISOString(),
      location: parsed?.location?.trim() || null,
    };
  }

  if (kind === "task") {
    return {
      kind: "task",
      title,
      dueDate: isoOrNull(when.date),
      priority: parsed?.priority ?? "medium",
      estimatedMinutes: parsed?.durationMinutes ?? DEFAULT_TASK_MINUTES,
    };
  }

  return { kind: "note", title, content: text.trim() };
}
