"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import * as taskService from "@/services/task-service";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// datetime-local carries no timezone and means local wall-clock time; building
// the Date from parts keeps it local, where new Date(string) would read it as UTC.
function fromLocalInput(value: string | null): Date | null {
  if (!value) return null;
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const taskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(200),
  description: z.preprocess(
    emptyToNull,
    z.string().trim().max(5000).nullable().default(null),
  ),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  dueDate: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
      .nullable()
      .default(null),
  ),
  estimatedMinutes: z.coerce
    .number()
    .int()
    .min(1, "Estimate at least a minute.")
    .max(60 * 24)
    .default(60),
  projectId: z.preprocess(
    emptyToNull,
    z.uuid().nullable().default(null),
  ),
  scheduledStart: z.preprocess(
    emptyToNull,
    z.string().regex(LOCAL_DATETIME, "Pick a valid start time.").nullable().default(null),
  ),
  scheduledEnd: z.preprocess(
    emptyToNull,
    z.string().regex(LOCAL_DATETIME, "Pick a valid end time.").nullable().default(null),
  ),
});


function parseForm(formData: FormData) {
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    priority: formData.get("priority") ?? "medium",
    dueDate: formData.get("dueDate") ?? "",
    estimatedMinutes: formData.get("estimatedMinutes") ?? 60,
    projectId: formData.get("projectId") ?? "",
    scheduledStart: formData.get("scheduledStart") ?? "",
    scheduledEnd: formData.get("scheduledEnd") ?? "",
  });

  if (!parsed.success) return parsed;

  return {
    success: true as const,
    data: {
      ...parsed.data,
      // A bare yyyy-mm-dd parses as UTC midnight, which lands on the previous
      // day for anyone behind UTC. Pin it to local end-of-day instead.
      dueDate: parsed.data.dueDate ? endOfLocalDay(parsed.data.dueDate) : null,
      scheduledStart: fromLocalInput(parsed.data.scheduledStart),
      scheduledEnd: fromLocalInput(parsed.data.scheduledEnd),
    },
  };
}

function endOfLocalDay(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the task and try again.";
}

function revalidateTaskViews(taskId?: string) {
  revalidatePath("/tasks");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function createTaskAction(
  _prevState: ApiResponse<null> | null,
  formData: FormData,
): Promise<ApiResponse<null>> {
  const parsed = parseForm(formData);
  if (!parsed.success) return fail("VALIDATION_ERROR", firstIssue(parsed.error));

  try {
    const userId = await requireUserId();
    await taskService.createTask(userId, parsed.data);
  } catch (error) {
    return toApiResponse(error);
  }

  revalidateTaskViews();
  return ok(null);
}

export async function updateTaskAction(
  taskId: string,
  _prevState: ApiResponse<null> | null,
  formData: FormData,
): Promise<ApiResponse<null>> {
  const parsed = parseForm(formData);
  if (!parsed.success) return fail("VALIDATION_ERROR", firstIssue(parsed.error));

  try {
    const userId = await requireUserId();
    await taskService.updateTask(userId, taskId, parsed.data);
  } catch (error) {
    return toApiResponse(error);
  }

  revalidateTaskViews(taskId);
  return ok(null);
}

export async function setTaskStatusAction(formData: FormData): Promise<void> {
  const parsed = z
    .object({
      taskId: z.uuid(),
      status: z.enum(TASK_STATUSES),
    })
    .safeParse({
      taskId: formData.get("taskId"),
      status: formData.get("status"),
    });

  if (!parsed.success) return;

  const userId = await requireUserId();
  await taskService.setTaskStatus(userId, parsed.data.taskId, parsed.data.status);
  revalidateTaskViews(parsed.data.taskId);
}

export async function deleteTaskAction(taskId: string): Promise<void> {
  const userId = await requireUserId();
  await taskService.deleteTask(userId, taskId);

  revalidateTaskViews();
  redirect("/tasks");
}
