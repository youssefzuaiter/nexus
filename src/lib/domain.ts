// Shared domain vocabulary. Deliberately free of `server-only` and of any
// database import: client components need these values for their form controls,
// and importing them from a repository would pull Prisma into the browser bundle.

export const PROJECT_CATEGORIES = ["University", "Career", "Personal"] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type ProjectOption = { id: string; title: string };
