"use server";

import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, toApiResponse } from "@/lib/api-response";
import { quickSearch, type SearchHit } from "@/repositories/search-repository";

const querySchema = z.string().max(200);

export async function quickSearchAction(
  query: string,
): Promise<ApiResponse<SearchHit[]>> {
  try {
    const userId = await requireUserId();
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) return ok([]);

    return ok(await quickSearch(userId, parsed.data));
  } catch (error) {
    return toApiResponse(error);
  }
}
