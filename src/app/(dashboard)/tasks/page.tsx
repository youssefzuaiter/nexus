import { requireUserId } from "@/lib/session";
import { groupTasks } from "@/services/task-service";
import { TaskForm } from "@/components/task-form";
import { TaskRow } from "@/components/task-row";
import { createTaskAction } from "@/actions/tasks";
import { listProjectOptions } from "@/repositories/project-repository";

import type { TaskModel as Task } from "@/generated/prisma/models";

export const metadata = { title: "Tasks · Nexus" };

function Section({
  title,
  tasks,
  overdue,
}: {
  title: string;
  tasks: Task[];
  overdue?: boolean;
}) {
  if (tasks.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">
        {title} · {tasks.length}
      </h2>
      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} overdue={overdue} />
        ))}
      </ul>
    </section>
  );
}

export default async function TasksPage() {
  const userId = await requireUserId();
  const [grouped, projects] = await Promise.all([
    groupTasks(userId),
    listProjectOptions(userId),
  ]);

  const openCount =
    grouped.overdue.length +
    grouped.today.length +
    grouped.upcoming.length +
    grouped.someday.length;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Tasks</h1>
        <p className="mt-1 text-sm text-text-muted">
          {openCount} open
          {grouped.overdue.length > 0 && ` · ${grouped.overdue.length} overdue`}
        </p>
      </header>

      <TaskForm
        action={createTaskAction}
        submitLabel="Add task"
        projects={projects}
        resetOnSuccess
      />

      {openCount === 0 && grouped.done.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-text-muted">
          Nothing on your list yet.
        </p>
      )}

      <Section title="Overdue" tasks={grouped.overdue} overdue />
      <Section title="Today" tasks={grouped.today} />
      <Section title="Upcoming" tasks={grouped.upcoming} />
      <Section title="Someday" tasks={grouped.someday} />
      <Section title="Done" tasks={grouped.done.slice(0, 20)} />
    </div>
  );
}
