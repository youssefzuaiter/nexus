"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import * as planService from "@/services/plan-service";

export type PlanBlockView = {
  taskId: string;
  title: string;
  start: string;
  end: string;
};

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export async function proposePlanAction(): Promise<ApiResponse<PlanBlockView[]>> {
  try {
    const userId = await requireUserId();
    const plan = await planService.proposePlan(userId, new Date());
    return ok(
      plan.map((block) => ({
        taskId: block.taskId,
        title: block.title,
        start: TIME.format(block.start),
        end: TIME.format(block.end),
      })),
    );
  } catch (error) {
    return toApiResponse(error);
  }
}

export async function applyPlanAction(
  taskIds: string[],
): Promise<ApiResponse<{ scheduled: number }>> {
  const parsed = z.array(z.uuid()).min(1).max(20).safeParse(taskIds);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Nothing to schedule.");

  try {
    const userId = await requireUserId();
    const result = await planService.applyPlan(userId, new Date(), parsed.data);

    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/calendar");
    return ok(result);
  } catch (error) {
    return toApiResponse(error);
  }
}
