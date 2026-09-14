"use client";

import { useState, type ReactNode } from "react";
import { NoteContent } from "@/components/note-content";

/**
 * Reading is the default; editing is the deliberate act. The editor is only
 * mounted once you switch to it, so the rendered view costs nothing extra.
 */
export function NoteView({
  content,
  links,
  editor,
}: {
  content: string;
  links: Record<string, string | null>;
  editor: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (
                confirm("Leave the editor? Anything unsaved will be lost.")
              ) {
                setEditing(false);
              }
            }}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
          >
            Done
          </button>
        </div>
        {editor}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-raised"
        >
          Edit
        </button>
      </div>

      {content.trim() ? (
        <NoteContent content={content} links={links} />
      ) : (
        <p className="text-sm text-text-muted">
          This note is empty. Use Edit to write something.
        </p>
      )}
    </div>
  );
}
