import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { auth } from "@/auth";

export const metadata = { title: "Dashboard · Nexus" };

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const userId = await requireUserId();
  const session = await auth();

  const [notes, tasks, events, projects, indexedChunks] = await Promise.all([
    prisma.note.count({ where: { userId, deletedAt: null } }),
    prisma.task.count({ where: { userId, deletedAt: null, status: { not: "done" } } }),
    prisma.event.count({ where: { userId } }),
    prisma.project.count({ where: { userId, deletedAt: null } }),
    prisma.workspaceEmbedding.count({ where: { userId } }),
  ]);

  const stats = [
    { label: "Notes", value: notes },
    { label: "Open tasks", value: tasks },
    { label: "Events", value: events },
    { label: "Projects", value: projects },
  ];

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          {greeting(new Date().getHours())}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Everything in your workspace, connected.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border-subtle bg-surface p-4"
          >
            <p className="text-2xl font-semibold tabular-nums text-text">
              {stat.value}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-4 rounded-xl border border-border-subtle bg-surface p-4">
        <p className="text-sm text-text-muted">
          <span className="font-medium text-text tabular-nums">
            {indexedChunks}
          </span>{" "}
          {indexedChunks === 1 ? "chunk" : "chunks"} indexed for semantic search.
        </p>
      </section>
    </div>
  );
}
