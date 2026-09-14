"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import * as calendarService from "@/services/calendar-service";

const subscriptionSchema = z.object({
  name: z.string().trim().min(1, "Give this calendar a name.").max(120),
  url: z.string().trim().min(1, "Paste the calendar link.").max(2000),
});

function revalidateAll(): void {
  revalidatePath("/calendar");
  revalidatePath("/calendar/subscriptions");
  revalidatePath("/");
}

export async function addSubscriptionAction(
  _prevState: ApiResponse<{ imported: number }> | null,
  formData: FormData,
): Promise<ApiResponse<{ imported: number }>> {
  const parsed = subscriptionSchema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
  });
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }

  try {
    const userId = await requireUserId();
    const { result } = await calendarService.addSubscription(userId, parsed.data);
    revalidateAll();
    return ok({ imported: result.imported });
  } catch (error) {
    return toApiResponse(error);
  }
}

export async function syncSubscriptionAction(
  subscriptionId: string,
): Promise<ApiResponse<{ imported: number; removed: number }>> {
  const parsed = z.uuid().safeParse(subscriptionId);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Unknown calendar.");

  try {
    const userId = await requireUserId();
    const result = await calendarService.syncSubscription(userId, parsed.data);
    revalidateAll();
    return ok(result);
  } catch (error) {
    return toApiResponse(error);
  }
}

export async function removeSubscriptionAction(
  subscriptionId: string,
): Promise<ApiResponse<null>> {
  const parsed = z.uuid().safeParse(subscriptionId);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Unknown calendar.");

  try {
    const userId = await requireUserId();
    await calendarService.removeSubscription(userId, parsed.data);
    revalidateAll();
    return ok(null);
  } catch (error) {
    return toApiResponse(error);
  }
}
