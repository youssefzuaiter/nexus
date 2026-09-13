"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import {
  classifyLoad,
  MIN_SESSION_SECONDS,
  MAX_SESSION_SECONDS,
} from "@/lib/focus";
import * as focusRepository from "@/repositories/focus-repository";

const sessionSchema = z.object({
  // Clamped rather than unbounded: these numbers come from a browser timer and
  // a keystroke counter, both of which a client could report as anything.
  activeSeconds: z.coerce.number().int().min(0).max(MAX_SESSION_SECONDS),
  charactersTyped: z.coerce.number().int().min(0).max(1_000_000),
  typingSpeedWpm: z.coerce.number().int().min(0).max(400),
});

export async function recordFocusSessionAction(
  raw: unknown,
): Promise<ApiResponse<null>> {
  const parsed = sessionSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid session.");

  const { activeSeconds, charactersTyped, typingSpeedWpm } = parsed.data;

  // Sessions too short to mean anything are dropped rather than stored as noise.
  if (activeSeconds < MIN_SESSION_SECONDS || charactersTyped === 0) {
    return ok(null);
  }

  try {
    const userId = await requireUserId();

    // The opt-in is enforced here, not in the browser. A client that keeps
    // sending after the toggle is turned off records nothing.
    if (!(await focusRepository.isTrackingEnabled(userId))) {
      return fail("FORBIDDEN", "Focus tracking is off.");
    }

    await focusRepository.recordSession(userId, {
      sessionDuration: activeSeconds,
      typingSpeedWpm,
      cognitiveLoad: classifyLoad(activeSeconds, typingSpeedWpm),
    });

    revalidatePath("/focus");
    return ok(null);
  } catch (error) {
    return toApiResponse(error);
  }
}

export async function setFocusTrackingAction(
  enabled: boolean,
): Promise<ApiResponse<{ enabled: boolean }>> {
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid setting.");

  try {
    const userId = await requireUserId();
    await focusRepository.setTrackingEnabled(userId, parsed.data);
    revalidatePath("/focus");
    return ok({ enabled: parsed.data });
  } catch (error) {
    return toApiResponse(error);
  }
}

export async function clearFocusHistoryAction(): Promise<ApiResponse<{ deleted: number }>> {
  try {
    const userId = await requireUserId();
    const deleted = await focusRepository.deleteAllSessions(userId);
    revalidatePath("/focus");
    return ok({ deleted });
  } catch (error) {
    return toApiResponse(error);
  }
}
