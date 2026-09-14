"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import * as courseRepository from "@/repositories/course-repository";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const courseSchema = z.object({
  code: z.string().trim().min(1, "Give the course a code.").max(20),
  title: z.string().trim().min(1, "Give the course a name.").max(160),
  term: z.string().trim().min(1, "Which term is it?").max(60),
});

const assessmentSchema = z.object({
  title: z.string().trim().min(1, "Name the assessment.").max(120),
  weight: z.coerce
    .number()
    .min(0, "Weight cannot be negative.")
    .max(100, "A single assessment cannot be worth more than the course."),
  score: z.preprocess(
    emptyToNull,
    z.coerce.number().min(0).max(1000).nullable().default(null),
  ),
  maxScore: z.coerce.number().min(0.01, "Out of what?").max(1000).default(100),
  dueDate: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  ),
});

function endOfLocalDay(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

export async function createCourseAction(
  _prevState: ApiResponse<null> | null,
  formData: FormData,
): Promise<ApiResponse<null>> {
  const parsed = courseSchema.safeParse({
    code: formData.get("code"),
    title: formData.get("title"),
    term: formData.get("term"),
  });
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", firstIssue(parsed.error, "Check the form."));
  }

  try {
    const userId = await requireUserId();
    await courseRepository.createCourse(userId, parsed.data);
  } catch (error) {
    return toApiResponse(error);
  }

  revalidatePath("/courses");
  return ok(null);
}

export async function addAssessmentAction(
  courseId: string,
  _prevState: ApiResponse<null> | null,
  formData: FormData,
): Promise<ApiResponse<null>> {
  const parsedId = z.uuid().safeParse(courseId);
  if (!parsedId.success) return fail("VALIDATION_ERROR", "Unknown course.");

  const parsed = assessmentSchema.safeParse({
    title: formData.get("title"),
    weight: formData.get("weight"),
    score: formData.get("score") ?? "",
    maxScore: formData.get("maxScore") ?? 100,
    dueDate: formData.get("dueDate") ?? "",
  });
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", firstIssue(parsed.error, "Check the form."));
  }

  try {
    const userId = await requireUserId();
    // The course must be the caller's own; the assessment would otherwise
    // attach to someone else's course by id alone.
    const course = await courseRepository.getCourse(userId, parsedId.data);
    if (!course) return fail("RESOURCE_NOT_FOUND", "That course no longer exists.");

    await courseRepository.createAssessment(userId, parsedId.data, {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? endOfLocalDay(parsed.data.dueDate) : null,
    });
  } catch (error) {
    return toApiResponse(error);
  }

  revalidatePath(`/courses/${parsedId.data}`);
  revalidatePath("/courses");
  return ok(null);
}

export async function setAssessmentScoreAction(
  assessmentId: string,
  rawScore: string,
): Promise<ApiResponse<null>> {
  const parsed = z
    .object({
      assessmentId: z.uuid(),
      score: z.preprocess(
        emptyToNull,
        z.coerce.number().min(0).max(1000).nullable(),
      ),
    })
    .safeParse({ assessmentId, score: rawScore });
  if (!parsed.success) return fail("VALIDATION_ERROR", "That is not a score.");

  try {
    const userId = await requireUserId();
    const updated = await courseRepository.updateAssessment(
      userId,
      parsed.data.assessmentId,
      { score: parsed.data.score },
    );
    if (!updated) return fail("RESOURCE_NOT_FOUND", "That assessment is gone.");
  } catch (error) {
    return toApiResponse(error);
  }

  revalidatePath("/courses");
  return ok(null);
}

export async function deleteAssessmentAction(
  assessmentId: string,
): Promise<ApiResponse<null>> {
  const parsed = z.uuid().safeParse(assessmentId);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Unknown assessment.");

  try {
    const userId = await requireUserId();
    await courseRepository.deleteAssessment(userId, parsed.data);
  } catch (error) {
    return toApiResponse(error);
  }

  revalidatePath("/courses");
  return ok(null);
}

export async function linkTimetableAction(
  courseId: string,
): Promise<ApiResponse<{ linked: number }>> {
  const parsed = z.uuid().safeParse(courseId);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Unknown course.");

  try {
    const userId = await requireUserId();
    const course = await courseRepository.getCourse(userId, parsed.data);
    if (!course) return fail("RESOURCE_NOT_FOUND", "That course no longer exists.");

    const linked = await courseRepository.linkEventsByCode(
      userId,
      course.id,
      course.code,
    );
    revalidatePath(`/courses/${course.id}`);
    revalidatePath("/calendar");
    return ok({ linked });
  } catch (error) {
    return toApiResponse(error);
  }
}

export async function deleteCourseAction(courseId: string): Promise<void> {
  const userId = await requireUserId();
  const parsed = z.uuid().safeParse(courseId);
  if (!parsed.success) redirect("/courses");

  // Detach rather than cascade, exactly as deleting a project does: losing a
  // course must never quietly take the user's notes and tasks with it.
  await prisma.$transaction([
    prisma.note.updateMany({
      where: { userId, courseId: parsed.data },
      data: { courseId: null },
    }),
    prisma.task.updateMany({
      where: { userId, courseId: parsed.data },
      data: { courseId: null },
    }),
    prisma.event.updateMany({
      where: { userId, courseId: parsed.data },
      data: { courseId: null },
    }),
  ]);
  await courseRepository.softDeleteCourse(userId, parsed.data);

  revalidatePath("/courses");
  revalidatePath("/");
  redirect("/courses");
}
