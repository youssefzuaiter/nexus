"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, toApiResponse } from "@/lib/api-response";
import {
  reindexEverything,
  type ReindexReport,
} from "@/services/reindex-service";

export async function reindexAction(): Promise<ApiResponse<ReindexReport>> {
  try {
    const userId = await requireUserId();
    const report = await reindexEverything(userId);
    revalidatePath("/search");
    return ok(report);
  } catch (error) {
    return toApiResponse(error);
  }
}
