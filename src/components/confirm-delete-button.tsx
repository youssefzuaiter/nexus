"use client";

import { useFormStatus } from "react-dom";

function Button({ label, confirmText }: { label: string; confirmText: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!confirm(confirmText)) event.preventDefault();
      }}
      className="rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-60"
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}

export function ConfirmDeleteButton({
  action,
  label,
  confirmText,
}: {
  action: () => Promise<void>;
  label: string;
  confirmText: string;
}) {
  return (
    <form action={action}>
      <Button label={label} confirmText={confirmText} />
    </form>
  );
}
