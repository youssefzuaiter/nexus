"use client";

import { useFormStatus } from "react-dom";
import { signOutAction } from "@/actions/auth";

const SIDEBAR_CLASS =
  "w-full rounded-lg px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-60";

function Button({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function SignOutButton({ className = SIDEBAR_CLASS }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <Button className={className} />
    </form>
  );
}
