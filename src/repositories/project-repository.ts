import "server-only";
import { prisma } from "@/lib/prisma";
import type { ProjectModel as Project } from "@/generated/prisma/models";

export type {
  ProjectCategory,
  ProjectOption,
} from "@/lib/domain";

import type { ProjectCategory } from "@/lib/domain";

export type ProjectInput = {
  title: string;
  category: ProjectCategory;
};

export type ProjectSummary = Project & {
  counts: { notes: number; tasks: number; openTasks: number; events: number };
};

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          notes: { where: { deletedAt: null } },
          events: true,
        },
      },
      tasks: {
        where: { deletedAt: null },
        select: { status: true },
      },
    },
  });

  return projects.map(({ _count, tasks, ...project }) => ({
    ...project,
    counts: {
      notes: _count.notes,
      events: _count.events,
      tasks: tasks.length,
      openTasks: tasks.filter((task) => task.status !== "done").length,
    },
  }));
}

export async function listProjectOptions(
  userId: string,
): Promise<{ id: string; title: string }[]> {
  return prisma.project.findMany({
    where: { userId, deletedAt: null },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}

export async function getProject(
  userId: string,
  projectId: string,
): Promise<Project | null> {
  return prisma.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
  });
}

export async function createProject(
  userId: string,
  input: ProjectInput,
): Promise<Project> {
  return prisma.project.create({ data: { ...input, userId } });
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: ProjectInput,
): Promise<Project | null> {
  const { count } = await prisma.project.updateMany({
    where: { id: projectId, userId, deletedAt: null },
    data: input,
  });
  if (count === 0) return null;
  return getProject(userId, projectId);
}

export async function softDeleteProject(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const { count } = await prisma.project.updateMany({
    where: { id: projectId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return count > 0;
}

export async function setProgress(
  userId: string,
  projectId: string,
  progress: number,
): Promise<void> {
  await prisma.project.updateMany({
    where: { id: projectId, userId, deletedAt: null },
    data: { progress },
  });
}

export async function getProjectContents(userId: string, projectId: string) {
  const [notes, tasks, events] = await Promise.all([
    prisma.note.findMany({
      where: { userId, projectId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    }),
    prisma.task.findMany({
      where: { userId, projectId, deletedAt: null },
      orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
    }),
    prisma.event.findMany({
      where: { userId, projectId },
      orderBy: { startTime: "asc" },
      select: { id: true, title: true, startTime: true },
    }),
  ]);

  return { notes, tasks, events };
}
