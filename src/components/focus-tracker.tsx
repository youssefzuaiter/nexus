"use client";

import { useEffect, useRef } from "react";
import { recordFocusSessionAction } from "@/actions/focus";
import { wordsPerMinute, MIN_SESSION_SECONDS } from "@/lib/focus";

// Typing counts as "active" until this much silence passes, so a session that is
// left open on screen overnight does not record eight hours of focus.
const IDLE_TIMEOUT_MS = 60_000;

/**
 * Measures only how long writing was active and how many characters were typed.
 * It never reads, stores or transmits what was written — the note content is
 * already saved by the editor itself and has nothing to do with this.
 *
 * Rendered only when the user has switched tracking on.
 */
export function FocusTracker({ selector }: { selector: string }) {
  const activeMs = useRef(0);
  const characters = useRef(0);
  const lastKeyAt = useRef<number | null>(null);
  const flushed = useRef(false);

  useEffect(() => {
    const element = document.querySelector(selector);
    if (!element) return;

    function settle(now: number) {
      if (lastKeyAt.current === null) return;
      const gap = now - lastKeyAt.current;
      if (gap < IDLE_TIMEOUT_MS) activeMs.current += gap;
      lastKeyAt.current = null;
    }

    function onKeyDown(event: Event) {
      const key = (event as KeyboardEvent).key;
      // Modifier and navigation keys are not writing.
      if (key.length !== 1 && key !== "Backspace" && key !== "Enter") return;

      const now = Date.now();
      settle(now);
      lastKeyAt.current = now;
      characters.current += 1;
    }

    function flush() {
      if (flushed.current) return;
      settle(Date.now());

      const activeSeconds = Math.round(activeMs.current / 1000);
      if (activeSeconds < MIN_SESSION_SECONDS || characters.current === 0) return;

      flushed.current = true;
      const charactersTyped = characters.current;

      void recordFocusSessionAction({
        activeSeconds,
        charactersTyped,
        typingSpeedWpm: wordsPerMinute(charactersTyped, activeSeconds),
      });

      activeMs.current = 0;
      characters.current = 0;
      flushed.current = false;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }

    element.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flush);

    return () => {
      element.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [selector]);

  return null;
}
