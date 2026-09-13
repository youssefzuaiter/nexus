"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmCaptureAction } from "@/actions/capture";
import type { Proposal } from "@/services/parse-service";

const KIND_LABEL: Record<Proposal["kind"], string> = {
  task: "Task",
  event: "Event",
  note: "Note",
};

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function describe(proposal: Proposal): string[] {
  if (proposal.kind === "task") {
    return [
      proposal.dueDate
        ? `Due ${DATE_ONLY.format(new Date(proposal.dueDate))}`
        : "No due date",
      `${proposal.priority} priority`,
      `${proposal.estimatedMinutes}m`,
    ];
  }
  if (proposal.kind === "event") {
    return [
      DATE_TIME.format(new Date(proposal.startTime)),
      `until ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(proposal.endTime))}`,
      ...(proposal.location ? [proposal.location] : []),
    ];
  }
  return ["Saved as a note"];
}

export function QuickCapture() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    setProposal(null);

    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const body = await response.json();
      if (body.success) setProposal(body.data);
      else setError(body.error?.message ?? "Could not read that.");
    } catch {
      setError("Could not reach the parser.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!proposal || busy) return;

    setBusy(true);
    setError(null);
    const response = await confirmCaptureAction(proposal);
    setBusy(false);

    if (!response.success) {
      setError(response.error.message);
      return;
    }

    setText("");
    setProposal(null);
    router.push(response.data.href);
  }

  return (
    <section className="mb-6">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              parse();
            }
          }}
          placeholder="Capture anything — “coffee with Ada friday 3pm”"
          aria-label="Quick capture"
          disabled={busy}
          className="flex-1 rounded-lg border border-border-subtle bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={parse}
          disabled={busy || !text.trim()}
          className="rounded-lg border border-border-subtle bg-surface px-3.5 py-2.5 text-sm text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && !proposal ? "Reading…" : "Capture"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {proposal && (
        <div
          role="status"
          className="mt-2 rounded-xl border border-accent bg-surface p-3.5"
        >
          <div className="flex items-start gap-3">
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
              {KIND_LABEL[proposal.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">
                {proposal.title}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {describe(proposal).join(" · ")}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? "Saving…" : `Create ${KIND_LABEL[proposal.kind].toLowerCase()}`}
            </button>
            <button
              type="button"
              onClick={() => setProposal(null)}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-60"
            >
              Discard
            </button>
            <span className="ml-auto text-xs text-text-faint">
              Nothing is saved until you confirm
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
