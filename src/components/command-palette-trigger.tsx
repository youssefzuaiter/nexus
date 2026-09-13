"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

export function CommandPaletteTrigger() {
  // The server has no navigator, so the shortcut hint reads as Ctrl until the
  // client snapshot takes over. useSyncExternalStore gives that without a
  // setState-in-effect cascade.
  const isMac = useSyncExternalStore(
    noopSubscribe,
    () => navigator.platform.toLowerCase().includes("mac"),
    () => false,
  );

  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true }),
        )
      }
      className="mb-3 flex w-full items-center justify-between rounded-lg border border-border-subtle px-3 py-1.5 text-left text-xs text-text-faint transition-colors hover:border-border-strong hover:text-text-muted"
    >
      Search
      {/* The server cannot know the platform, so this text legitimately differs
          between the server and client renders. Marking it keeps React from
          warning about a mismatch it is meant to correct. */}
      <kbd suppressHydrationWarning className="font-mono text-[11px]">
        {isMac ? "⌘" : "Ctrl+"}K
      </kbd>
    </button>
  );
}
