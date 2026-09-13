import "server-only";
import { prisma } from "@/lib/prisma";
import type { TaskModel as Task } from "@/generated/prisma/models";

export { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/domain";
export type { TaskStatus, TaskPriority } from "@/lib/domain";

import type { TaskStatus, TaskPriority } from "@/lib/domain";

export type TaskInput = {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: Date | null;
  estimatedMinutes: number;
  projectId: string | null;
};

export async function listTasks(
  userId: string,
  options: { includeDone?: boolean } = {},
): Promise<Task[]> {
  return prisma.task.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(options.includeDone ? {} : { status: { not: "done" } }),
    },
    orderBy: [
      { dueDate: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
  });
}

export async function getTask(
  userId: string,
  taskId: string,
): Promise<Task | null> {
  return prisma.task.findFirst({
    where: { id: taskId, userId, deletedAt: null },
  });
}

export async function createTask(
  userId: string,
  input: TaskInput,
): Promise<Task> {
  return prisma.task.create({ data: { ...input, userId } });
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: TaskInput,
): Promise<Task | null> {
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, userId, deletedAt: null },
    data: input,
  });
  if (count === 0) return null;
  return getTask(userId, taskId);
}

export async function setTaskStatus(
  userId: string,
  taskId: string,
  status: TaskStatus,
): Promise<Task | null> {
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, userId, deletedAt: null },
    data: {
      status,
      // completedAt is derived from status, never set independently, so the two
      // cannot drift apart.
      completedAt: status === "done" ? new Date() : null,
    },
  });
  if (count === 0) return null;
  return getTask(userId, taskId);
}

export async function softDeleteTask(
  userId: string,
  taskId: string,
): Promise<boolean> {
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return count > 0;
}

export async function countOpenTasks(userId: string): Promise<number> {
  return prisma.task.count({
    where: { userId, deletedAt: null, status: { not: "done" } },
  });
}
