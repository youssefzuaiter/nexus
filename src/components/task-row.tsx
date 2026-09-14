import Link from "next/link";
import { setTaskStatusAction } from "@/actions/tasks";
import type { TaskModel as Task } from "@/generated/prisma/models";

const PRIORITY_STYLES: Record<string, string> = {
  high: "text-danger",
  medium: "text-text-muted",
  low: "text-text-faint",
};

function formatDue(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function TaskRow({ task, overdue }: { task: Task; overdue?: boolean }) {
  const done = task.status === "done";

  return (
    <li className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3">
      <form action={setTaskStatusAction} className="pt-0.5">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="status" value={done ? "todo" : "done"} />
        <button
          type="submit"
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          className={`flex size-4.5 items-center justify-center rounded-full border text-[10px] leading-none transition-colors ${
            done
              ? "border-accent bg-accent text-white"
              : "border-border-strong hover:border-accent"
          }`}
        >
          {done ? "✓" : ""}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <Link
          href={`/tasks/${task.id}`}
          className={`block truncate text-sm font-medium transition-colors hover:text-accent ${
            done ? "text-text-faint line-through" : "text-text"
          }`}
        >
          {task.recurrenceId && "↻ "}
          {task.title}
        </Link>

        {task.description && !done && (
          <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">
            {task.description}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          {task.dueDate && (
            <span className={overdue ? "font-medium text-danger" : "text-text-faint"}>
              {overdue ? "Overdue · " : ""}
              {formatDue(task.dueDate)}
            </span>
          )}
          <span className={PRIORITY_STYLES[task.priority]}>{task.priority}</span>
          <span className="text-text-faint">{task.estimatedMinutes}m</span>
          {task.tags.map((name) => (
            <span
              key={name}
              className="rounded-full bg-surface-raised px-2 py-0.5 text-text-muted"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
