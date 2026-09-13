import "server-only";
import { indexEntity, deleteEntityEmbeddings } from "@/lib/vector";
import { AppError } from "@/lib/api-response";
import * as taskRepository from "@/repositories/task-repository";
import { assertProjectOwned, recalculateProgress } from "@/services/project-service";
import type { TaskInput, TaskStatus } from "@/repositories/task-repository";
import type { TaskModel as Task } from "@/generated/prisma/models";

export type TaskBucket = "overdue" | "today" | "upcoming" | "someday";

export type GroupedTasks = {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  someday: Task[];
  done: Task[];
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Natural prose, not "Due …/Priority …" key-value lines — see the note in
// event-service.ts for the measured retrieval difference.
function embeddableText(task: Task): string {
  const due = task.dueDate
    ? `, due ${DATE_FORMAT.format(task.dueDate)}`
    : ", with no due date";

  const state = task.status === "done" ? " It is already completed." : "";

  const sentence = `${task.title}. This is a task${due}, with ${task.priority} priority, estimated at ${task.estimatedMinutes} minutes.${state}`;

  return task.description ? `${sentence}\n\n${task.description}` : sentence;
}

async function syncTaskIndex(userId: string, task: Task): Promise<void> {
  try {
    await indexEntity(userId, "task", task.id, embeddableText(task));
  } catch (error) {
    console.error(`[WARN] Failed to index task ${task.id}:`, error);
    await deleteEntityEmbeddings(userId, "task", task.id).catch(() => {});
  }
}

// Buckets are whole-day, not instant-based: a task due at 09:00 is still "today"
// at 18:00, not overdue. Only a due date before midnight this morning is overdue.
export function bucketOf(task: Task, now = new Date()): TaskBucket {
  if (!task.dueDate) return "someday";

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  if (task.dueDate < startOfToday) return "overdue";
  return task.dueDate <= endOfToday ? "today" : "upcoming";
}

export async function groupTasks(
  userId: string,
  now = new Date(),
): Promise<GroupedTasks> {
  const tasks = await taskRepository.listTasks(userId, { includeDone: true });

  const grouped: GroupedTasks = {
    overdue: [],
    today: [],
    upcoming: [],
    someday: [],
    done: [],
  };

  for (const task of tasks) {
    if (task.status === "done") {
      grouped.done.push(task);
    } else {
      grouped[bucketOf(task, now)].push(task);
    }
  }

  grouped.done.sort(
    (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
  );

  return grouped;
}

/**
 * A task may be scheduled with just a start; the block then runs for as long as
 * the task is estimated to take. An explicit end must be after the start.
 */
function resolveSchedule(input: TaskInput): TaskInput {
  if (!input.scheduledStart) {
    // An end without a start is meaningless, so it is dropped rather than stored.
    return { ...input, scheduledStart: null, scheduledEnd: null };
  }

  if (input.scheduledEnd && input.scheduledEnd <= input.scheduledStart) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The scheduled block must end after it starts.",
    );
  }

  return {
    ...input,
    scheduledEnd:
      input.scheduledEnd ??
      new Date(
        input.scheduledStart.getTime() + input.estimatedMinutes * 60_000,
      ),
  };
}

export async function createTask(
  userId: string,
  input: TaskInput,
): Promise<Task> {
  await assertProjectOwned(userId, input.projectId);
  const task = await taskRepository.createTask(userId, resolveSchedule(input));
  await syncTaskIndex(userId, task);
  await recalculateProgress(userId, task.projectId);
  return task;
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: TaskInput,
): Promise<Task> {
  await assertProjectOwned(userId, input.projectId);

  const before = await taskRepository.getTask(userId, taskId);
  const task = await taskRepository.updateTask(userId, taskId, resolveSchedule(input));
  if (!task) {
    throw new AppError("RESOURCE_NOT_FOUND", "That task no longer exists.");
  }

  await syncTaskIndex(userId, task);
  // Moving a task between projects changes the progress of both.
  await recalculateProgress(userId, before?.projectId);
  if (before?.projectId !== task.projectId) {
    await recalculateProgress(userId, task.projectId);
  }
  return task;
}

export async function setTaskStatus(
  userId: string,
  taskId: string,
  status: TaskStatus,
): Promise<Task> {
  const task = await taskRepository.setTaskStatus(userId, taskId, status);
  if (!task) {
    throw new AppError("RESOURCE_NOT_FOUND", "That task no longer exists.");
  }
  await syncTaskIndex(userId, task);
  await recalculateProgress(userId, task.projectId);
  return task;
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const before = await taskRepository.getTask(userId, taskId);
  const deleted = await taskRepository.softDeleteTask(userId, taskId);
  if (!deleted) {
    throw new AppError("RESOURCE_NOT_FOUND", "That task no longer exists.");
  }
  await deleteEntityEmbeddings(userId, "task", taskId);
  await recalculateProgress(userId, before?.projectId);
}
