"use server";

import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, toApiResponse } from "@/lib/api-response";
import { getDueReminders, type Reminder } from "@/services/reminders-service";

export type { Reminder };

export async function dueRemindersAction(): Promise<ApiResponse<Reminder[]>> {
  try {
    const userId = await requireUserId();
    const reminders = await getDueReminders(userId, new Date());
    return ok(reminders);
  } catch (error) {
    return toApiResponse(error);
  }
}
