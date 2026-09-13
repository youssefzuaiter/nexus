"use client";

import { useFormStatus } from "react-dom";
import { signOutAction } from "@/actions/auth";

function Button() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button />
    </form>
  );
}
