import { requireUserId } from "@/lib/session";
import { listDeletedNotes } from "@/repositories/note-repository";
import { listDeletedTasks } from "@/repositories/task-repository";
import { listDeletedProjects } from "@/repositories/project-repository";
import { TrashRow } from "@/components/trash-row";
import type { TrashKind } from "@/actions/trash";

export const metadata = { title: "Trash · Nexus" };

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function TrashPage() {
  const userId = await requireUserId();
  const [notes, tasks, projects] = await Promise.all([
    listDeletedNotes(userId),
    listDeletedTasks(userId),
    listDeletedProjects(userId),
  ]);

  const items: { kind: TrashKind; id: string; title: string; deletedAt: Date }[] = [
    ...notes.map((n) => ({ kind: "note" as const, ...n, deletedAt: n.deletedAt! })),
    ...tasks.map((t) => ({ kind: "task" as const, ...t, deletedAt: t.deletedAt! })),
    ...projects.map((p) => ({
      kind: "project" as const,
      ...p,
      deletedAt: p.deletedAt!,
    })),
  ].sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Trash</h1>
        <p className="mt-1 text-sm text-text-muted">
          {items.length} deleted {items.length === 1 ? "item" : "items"}. Events
          are deleted outright and never appear here.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-text-muted">
          Nothing deleted.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <TrashRow
                key={`${item.kind}:${item.id}`}
                kind={item.kind}
                id={item.id}
                title={item.title}
                deletedAt={WHEN.format(item.deletedAt)}
              />
            ))}
          </ul>
          <p className="mt-4 text-xs text-text-muted">
            Restoring a note puts it back in semantic search and re-resolves its
            links. Restoring a project does not re-attach the notes, tasks and
            events it held — deleting it detached them, and that association is
            not kept anywhere.
          </p>
        </>
      )}
    </div>
  );
}
