"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import { deleteEntityEmbeddings } from "@/lib/vector";
import * as noteRepository from "@/repositories/note-repository";
import * as linkRepository from "@/repositories/link-repository";
import { assertCourseOwned } from "@/services/course-service";
import { assertProjectOwned } from "@/services/project-service";

const MAX_SELECTION = 200;

const ids = z.array(z.uuid()).min(1).max(MAX_SELECTION);

function revalidateNotes(): void {
  revalidatePath("/notes");
  revalidatePath("/courses");
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function bulkAssignCourseAction(
  noteIds: string[],
  courseId: string | null,
): Promise<ApiResponse<{ changed: number }>> {
  const parsed = z
    .object({ noteIds: ids, courseId: z.uuid().nullable() })
    .safeParse({ noteIds, courseId });
  if (!parsed.success) return fail("VALIDATION_ERROR", "Nothing to update.");

  try {
    const userId = await requireUserId();
    await assertCourseOwned(userId, parsed.data.courseId);
    const changed = await noteRepository.bulkUpdateNotes(
      userId,
      parsed.data.noteIds,
      { courseId: parsed.data.courseId },
    );
    revalidateNotes();
    return ok({ changed });
  } catch (error) {
    return toApiResponse(error);
  }
}

export async function bulkAssignProjectAction(
  noteIds: string[],
  projectId: string | null,
): Promise<ApiResponse<{ changed: number }>> {
  const parsed = z
    .object({ noteIds: ids, projectId: z.uuid().nullable() })
    .safeParse({ noteIds, projectId });
  if (!parsed.success) return fail("VALIDATION_ERROR", "Nothing to update.");

  try {
    const userId = await requireUserId();
    await assertProjectOwned(userId, parsed.data.projectId);
    const changed = await noteRepository.bulkUpdateNotes(
      userId,
      parsed.data.noteIds,
      { projectId: parsed.data.projectId },
    );
    revalidateNotes();
    return ok({ changed });
  } catch (error) {
    return toApiResponse(error);
  }
}

export async function bulkTagAction(
  noteIds: string[],
  tag: string,
): Promise<ApiResponse<{ changed: number }>> {
  const parsed = z
    .object({
      noteIds: ids,
      tag: z
        .string()
        .trim()
        .min(1, "Type a tag first.")
        .max(40)
        .transform((value) => value.toLowerCase()),
    })
    .safeParse({ noteIds, tag });
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Nothing to update.",
    );
  }

  try {
    const userId = await requireUserId();
    const changed = await noteRepository.bulkAddTag(
      userId,
      parsed.data.noteIds,
      parsed.data.tag,
    );
    revalidateNotes();
    return ok({ changed });
  } catch (error) {
    return toApiResponse(error);
  }
}

export async function bulkDeleteNotesAction(
  noteIds: string[],
): Promise<ApiResponse<{ deleted: number }>> {
  const parsed = ids.safeParse(noteIds);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Nothing to delete.");

  try {
    const userId = await requireUserId();
    const deleted = await noteRepository.bulkSoftDelete(userId, parsed.data);

    // Same cleanup a single delete does: a soft-deleted note must leave the
    // search index at once, or the assistant keeps citing content the user
    // believes is gone.
    for (const id of deleted) {
      await deleteEntityEmbeddings(userId, "note", id);
      await linkRepository.deleteLinksFor(userId, id);
    }

    revalidateNotes();
    revalidatePath("/trash");
    return ok({ deleted: deleted.length });
  } catch (error) {
    return toApiResponse(error);
  }
}
