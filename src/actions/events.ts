"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { type ApiResponse, ok, fail, toApiResponse } from "@/lib/api-response";
import * as eventService from "@/services/event-service";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const eventSchema = z.object({
  title: z.string().trim().min(1, "Give the event a title.").max(200),
  description: z.preprocess(
    emptyToNull,
    z.string().trim().max(5000).nullable().default(null),
  ),
  location: z.preprocess(
    emptyToNull,
    z.string().trim().max(200).nullable().default(null),
  ),
  startTime: z
    .string()
    .regex(LOCAL_DATETIME, "Pick a start date and time."),
  endTime: z.string().regex(LOCAL_DATETIME, "Pick an end date and time."),
  projectId: z.preprocess(
    emptyToNull,
    z.uuid().nullable().default(null),
  ),
});

// datetime-local has no timezone, and it means local wall-clock time. Building
// the Date from parts keeps it local; new Date("...") would read it as UTC.
function fromLocalInput(value: string): Date {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function parseForm(formData: FormData) {
  const parsed = eventSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    location: formData.get("location") ?? "",
    startTime: formData.get("startTime") ?? "",
    endTime: formData.get("endTime") ?? "",
    projectId: formData.get("projectId") ?? "",
  });

  if (!parsed.success) return parsed;

  return {
    success: true as const,
    data: {
      ...parsed.data,
      startTime: fromLocalInput(parsed.data.startTime),
      endTime: fromLocalInput(parsed.data.endTime),
    },
  };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the event and try again.";
}

function revalidateCalendar(eventId?: string) {
  revalidatePath("/calendar");
  if (eventId) revalidatePath(`/calendar/${eventId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function createEventAction(
  _prevState: ApiResponse<null> | null,
  formData: FormData,
): Promise<ApiResponse<null>> {
  const parsed = parseForm(formData);
  if (!parsed.success) return fail("VALIDATION_ERROR", firstIssue(parsed.error));

  try {
    const userId = await requireUserId();
    await eventService.createEvent(userId, parsed.data);
  } catch (error) {
    return toApiResponse(error);
  }

  revalidateCalendar();
  return ok(null);
}

export async function updateEventAction(
  eventId: string,
  _prevState: ApiResponse<null> | null,
  formData: FormData,
): Promise<ApiResponse<null>> {
  const parsed = parseForm(formData);
  if (!parsed.success) return fail("VALIDATION_ERROR", firstIssue(parsed.error));

  try {
    const userId = await requireUserId();
    await eventService.updateEvent(userId, eventId, parsed.data);
  } catch (error) {
    return toApiResponse(error);
  }

  revalidateCalendar(eventId);
  return ok(null);
}

export async function deleteEventAction(eventId: string): Promise<void> {
  const userId = await requireUserId();
  await eventService.deleteEvent(userId, eventId);

  revalidateCalendar();
  redirect("/calendar");
}
