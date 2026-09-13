import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSessionUserId()) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-white">
            N
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Nexus</h1>
          <p className="mt-1 text-sm text-text-muted">
            Your notes, tasks and calendar — connected.
          </p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 shadow-[var(--shadow)]">
          {children}
        </div>
      </div>
    </main>
  );
}
