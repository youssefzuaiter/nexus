"use server";

import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, toApiResponse } from "@/lib/api-response";
import { buildWeeklyReview, summariseWeek } from "@/services/review-service";

export async function summariseWeekAction(): Promise<
  ApiResponse<{ summary: string; suggestion: string }>
> {
  try {
    const userId = await requireUserId();
    const review = await buildWeeklyReview(userId);
    return ok(await summariseWeek(review));
  } catch (error) {
    return toApiResponse(error);
  }
}
