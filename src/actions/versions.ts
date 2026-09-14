"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import * as noteService from "@/services/note-service";

export async function restoreVersionAction(
  versionId: string,
): Promise<ApiResponse<{ noteId: string }>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Unknown version.");

  try {
    const userId = await requireUserId();
    const note = await noteService.restoreVersion(userId, parsed.data);

    revalidatePath(`/notes/${note.id}`);
    revalidatePath(`/notes/${note.id}/history`);
    revalidatePath("/notes");
    return ok({ noteId: note.id });
  } catch (error) {
    return toApiResponse(error);
  }
}
