"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import * as profileRepository from "@/repositories/profile-repository";

const profileSchema = z.object({
  university: z.string().trim().min(1, "Give your university a name.").max(120),
  program: z.string().trim().min(1, "Give your program a name.").max(120),
  studentId: z.string().trim().max(40).default(""),
});

export async function updateProfileAction(
  _prevState: ApiResponse<null> | null,
  formData: FormData,
): Promise<ApiResponse<null>> {
  const parsed = profileSchema.safeParse({
    university: formData.get("university"),
    program: formData.get("program"),
    studentId: formData.get("studentId") ?? "",
  });
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Please check the form and try again.",
    );
  }

  try {
    const userId = await requireUserId();
    await profileRepository.updateProfile(userId, parsed.data);
  } catch (error) {
    return toApiResponse(error);
  }

  revalidatePath("/settings");
  return ok(null);
}
