"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import * as noteService from "@/services/note-service";
import { extractPdfText } from "@/lib/pdf";

const MAX_TAGS = 12;

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const noteSchema = z.object({
  title: z.string().trim().min(1, "Give the note a title.").max(200),
  content: z.string().max(100_000).default(""),
  tags: z
    .string()
    .default("")
    .transform((raw) =>
      [
        ...new Set(
          raw
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        ),
      ].slice(0, MAX_TAGS),
    ),
  isFavorite: z.union([z.literal("on"), z.null()]).transform((v) => v === "on"),
  projectId: z.preprocess(
    emptyToNull,
    z.uuid().nullable().default(null),
  ),
});

function parseForm(formData: FormData) {
  return noteSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content") ?? "",
    tags: formData.get("tags") ?? "",
    isFavorite: formData.get("isFavorite"),
    projectId: formData.get("projectId") ?? "",
  });
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the note and try again.";
}

export async function createNoteAction(
  _prevState: ApiResponse<{ id: string }> | null,
  formData: FormData,
): Promise<ApiResponse<{ id: string }>> {
  const parsed = parseForm(formData);
  if (!parsed.success) return fail("VALIDATION_ERROR", firstIssue(parsed.error));

  let noteId: string;
  try {
    const userId = await requireUserId();
    const note = await noteService.createNote(userId, parsed.data);
    noteId = note.id;
  } catch (error) {
    return toApiResponse(error);
  }

  revalidatePath("/notes");
  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/notes/${noteId}`);
}

export async function updateNoteAction(
  noteId: string,
  _prevState: ApiResponse<null> | null,
  formData: FormData,
): Promise<ApiResponse<null>> {
  const parsed = parseForm(formData);
  if (!parsed.success) return fail("VALIDATION_ERROR", firstIssue(parsed.error));

  try {
    const userId = await requireUserId();
    await noteService.updateNote(userId, noteId, parsed.data);
  } catch (error) {
    return toApiResponse(error);
  }

  revalidatePath("/notes");
  revalidatePath(`/notes/${noteId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return ok(null);
}

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export async function importPdfAction(
  _prevState: ApiResponse<null> | null,
  formData: FormData,
): Promise<ApiResponse<null>> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("VALIDATION_ERROR", "Choose a PDF file to import.");
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return fail("VALIDATION_ERROR", "Only PDF files can be imported.");
  }
  if (file.size > MAX_PDF_BYTES) {
    return fail(
      "VALIDATION_ERROR",
      `That file is too large — the limit is ${MAX_PDF_BYTES / (1024 * 1024)}MB.`,
    );
  }

  const titleOverride = (formData.get("title") as string | null)?.trim();
  const defaultTitle = file.name.replace(/\.pdf$/i, "").trim() || "Imported document";

  let noteId: string;
  try {
    const userId = await requireUserId();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = await extractPdfText(bytes);
    const note = await noteService.createNote(userId, {
      title: (titleOverride || defaultTitle).slice(0, 200),
      content: text,
      tags: ["imported"],
      isFavorite: false,
      projectId: null,
    });
    noteId = note.id;
  } catch (error) {
    return toApiResponse(error);
  }

  revalidatePath("/notes");
  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/notes/${noteId}`);
}

export async function deleteNoteAction(noteId: string): Promise<void> {
  const userId = await requireUserId();
  await noteService.deleteNote(userId, noteId);

  revalidatePath("/notes");
  revalidatePath("/projects");
  revalidatePath("/");
  redirect("/notes");
}
