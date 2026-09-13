import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { CommandPalette } from "@/components/command-palette";
import { CommandPaletteTrigger } from "@/components/command-palette-trigger";

// Extended as each section of the spec's directory map is actually built;
// unbuilt routes are deliberately absent rather than linked as dead ends.
const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/notes", label: "Notes" },
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/projects", label: "Projects" },
  { href: "/ai", label: "Assistant" },
];

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const displayName = session.user.name ?? session.user.email ?? "Account";

  return (
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-surface px-3 py-5 sm:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
            N
          </span>
          <span className="text-sm font-semibold tracking-tight text-text">
            Nexus
          </span>
        </div>

        <CommandPaletteTrigger />

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-border-subtle pt-3">
          <p className="truncate px-3 pb-1 text-xs text-text-faint">
            {displayName}
          </p>
          <SignOutButton />
        </div>
      </aside>

      {/* min-w-0 lets this flex item shrink below its content width; without it
          an overflow-x-auto child cannot clip and the whole page scrolls. */}
      <main className="min-w-0 flex-1 px-6 py-8 sm:px-10">{children}</main>

      <CommandPalette />
    </div>
  );
}
