"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import { softDeleteConversation } from "@/repositories/conversation-repository";

export async function deleteConversationAction(
  conversationId: string,
): Promise<ApiResponse<null>> {
  const parsed = z.uuid().safeParse(conversationId);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Unknown conversation.");

  try {
    const userId = await requireUserId();
    await softDeleteConversation(userId, parsed.data);
    revalidatePath("/ai");
    return ok(null);
  } catch (error) {
    return toApiResponse(error);
  }
}
