import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSessionUserId()) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl text-text">Nexus</h1>
          <p className="mt-2 text-sm text-text-muted">
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
