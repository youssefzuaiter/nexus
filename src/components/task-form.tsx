"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ApiResponse } from "@/lib/api-response";
import type { TaskPriority, ProjectOption } from "@/lib/domain";
import { ProjectSelect } from "@/components/project-select";

type TaskAction = (
  prevState: ApiResponse<null> | null,
  formData: FormData,
) => Promise<ApiResponse<null>>;

type TaskFormProps = {
  action: TaskAction;
  submitLabel: string;
  resetOnSuccess?: boolean;
  projects: ProjectOption[];
  initial?: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    dueDate: string;
    estimatedMinutes: number;
    projectId: string | null;
    scheduledStart: string;
    scheduledEnd: string;
  };
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function TaskForm({
  action,
  submitLabel,
  initial,
  projects,
  resetOnSuccess = false,
}: TaskFormProps) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.success) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface p-4"
    >
      <input
        name="title"
        defaultValue={initial?.title}
        placeholder="What needs doing?"
        required
        maxLength={200}
        aria-label="Task title"
        className="w-full rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm font-medium text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
      />

      <textarea
        name="description"
        defaultValue={initial?.description ?? ""}
        placeholder="Notes (optional)"
        rows={initial ? 4 : 2}
        aria-label="Task description"
        className="w-full resize-y rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
      />

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Due
          <input
            type="date"
            name="dueDate"
            defaultValue={initial?.dueDate}
            aria-label="Due date"
            className="rounded-lg border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Priority
          <select
            name="priority"
            defaultValue={initial?.priority ?? "medium"}
            aria-label="Priority"
            className="rounded-lg border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Minutes
          <input
            type="number"
            name="estimatedMinutes"
            defaultValue={initial?.estimatedMinutes ?? 60}
            min={1}
            max={1440}
            aria-label="Estimated minutes"
            className="w-24 rounded-lg border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>

        <ProjectSelect projects={projects} defaultValue={initial?.projectId} />
      </div>

      {initial && (
        <fieldset className="flex flex-wrap items-end gap-2 rounded-lg border border-border-subtle p-3">
          <legend className="px-1 text-xs text-text-muted">
            Time block (optional)
          </legend>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Starts
            <input
              type="datetime-local"
              name="scheduledStart"
              defaultValue={initial.scheduledStart}
              aria-label="Scheduled start"
              className="rounded-lg border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Ends
            <input
              type="datetime-local"
              name="scheduledEnd"
              defaultValue={initial.scheduledEnd}
              aria-label="Scheduled end"
              className="rounded-lg border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
            />
          </label>

          <p className="w-full text-xs text-text-faint">
            Leave the end empty and the block runs for the estimate above.
          </p>
        </fieldset>
      )}

      {state && !state.success && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {state.error.message}
        </p>
      )}

      {state?.success && !resetOnSuccess && (
        <p role="status" className="text-sm text-text-muted">
          Saved.
        </p>
      )}

      <div>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
