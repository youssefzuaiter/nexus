import "server-only";
import { prisma } from "@/lib/prisma";
import { indexEntity, deleteEntityEmbeddings } from "@/lib/vector";
import { AppError } from "@/lib/api-response";
import * as projectRepository from "@/repositories/project-repository";
import type { ProjectInput } from "@/repositories/project-repository";
import type { ProjectModel as Project } from "@/generated/prisma/models";

function embeddableText(project: Project, taskSummary: string): string {
  return `${project.title}. This is a ${project.category.toLowerCase()} project, ${project.progress}% complete. ${taskSummary}`;
}

async function syncProjectIndex(userId: string, project: Project) {
  const tasks = await prisma.task.findMany({
    where: { userId, projectId: project.id, deletedAt: null },
    select: { title: true, status: true },
  });

  const summary =
    tasks.length === 0
      ? "It has no tasks yet."
      : `Its tasks are: ${tasks
          .map((t) => `${t.title}${t.status === "done" ? " (done)" : ""}`)
          .join("; ")}.`;

  try {
    await indexEntity(
      userId,
      "project",
      project.id,
      embeddableText(project, summary),
    );
  } catch (error) {
    console.error(`[WARN] Failed to index project ${project.id}:`, error);
    await deleteEntityEmbeddings(userId, "project", project.id).catch(() => {});
  }
}

/**
 * A projectId arriving from a form is client-supplied. The database would
 * happily accept another user's project id, so ownership must be checked here
 * before any entity is attached to it.
 */
export async function assertProjectOwned(
  userId: string,
  projectId: string | null,
): Promise<void> {
  if (!projectId) return;

  const project = await projectRepository.getProject(userId, projectId);
  if (!project) {
    throw new AppError("RESOURCE_NOT_FOUND", "That project no longer exists.");
  }
}

/**
 * Progress is derived from linked tasks and written only here, so the stored
 * column can never disagree with the tasks it summarises. Nothing else may
 * write `progress`.
 */
export async function recalculateProgress(
  userId: string,
  projectId: string | null | undefined,
): Promise<void> {
  if (!projectId) return;

  const project = await projectRepository.getProject(userId, projectId);
  if (!project) return;

  const tasks = await prisma.task.findMany({
    where: { userId, projectId, deletedAt: null },
    select: { status: true },
  });

  const done = tasks.filter((task) => task.status === "done").length;
  const progress =
    tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);

  if (progress !== project.progress) {
    await projectRepository.setProgress(userId, projectId, progress);
  }

  await syncProjectIndex(userId, { ...project, progress });
}

export async function createProject(
  userId: string,
  input: ProjectInput,
): Promise<Project> {
  const project = await projectRepository.createProject(userId, input);
  await syncProjectIndex(userId, project);
  return project;
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: ProjectInput,
): Promise<Project> {
  const project = await projectRepository.updateProject(
    userId,
    projectId,
    input,
  );
  if (!project) {
    throw new AppError("RESOURCE_NOT_FOUND", "That project no longer exists.");
  }
  await syncProjectIndex(userId, project);
  return project;
}

/**
 * Soft-deletes the project and detaches its contents rather than cascading.
 * Losing a project must never silently take the user's notes with it.
 */
export async function deleteProject(
  userId: string,
  projectId: string,
): Promise<void> {
  const deleted = await projectRepository.softDeleteProject(userId, projectId);
  if (!deleted) {
    throw new AppError("RESOURCE_NOT_FOUND", "That project no longer exists.");
  }

  await prisma.$transaction([
    prisma.note.updateMany({
      where: { userId, projectId },
      data: { projectId: null },
    }),
    prisma.task.updateMany({
      where: { userId, projectId },
      data: { projectId: null },
    }),
    prisma.event.updateMany({
      where: { userId, projectId },
      data: { projectId: null },
    }),
  ]);

  await deleteEntityEmbeddings(userId, "project", projectId);
}

/**
 * Undoes `deleteProject` as far as it can be undone. Deleting detached the
 * project's notes, tasks and events by nulling their `projectId`, and that
 * association is not recorded anywhere else — so a restored project comes back
 * empty. The UI has to say so rather than implying a full undo.
 */
export async function restoreProject(
  userId: string,
  projectId: string,
): Promise<Project> {
  const project = await projectRepository.restoreProject(userId, projectId);
  if (!project) {
    throw new AppError("RESOURCE_NOT_FOUND", "That project is not in the trash.");
  }

  await syncProjectIndex(userId, project);
  return project;
}

export async function purgeProject(
  userId: string,
  projectId: string,
): Promise<void> {
  const purged = await projectRepository.purgeProject(userId, projectId);
  if (!purged) {
    throw new AppError("RESOURCE_NOT_FOUND", "That project is not in the trash.");
  }
}
