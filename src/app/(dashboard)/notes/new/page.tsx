import Link from "next/link";
import { NoteEditor } from "@/components/note-editor";
import { createNoteAction } from "@/actions/notes";
import { requireUserId } from "@/lib/session";
import { listProjectOptions } from "@/repositories/project-repository";
import { isTrackingEnabled } from "@/repositories/focus-repository";
import { FocusTracker } from "@/components/focus-tracker";


export const metadata = { title: "New note · Nexus" };

export default async function NewNotePage({
  searchParams,
}: PageProps<"/notes/new">) {
  const userId = await requireUserId();
  const params = await searchParams;
  const presetTitle = typeof params.title === "string" ? params.title.slice(0, 200) : "";
  const [projects, trackFocus] = await Promise.all([
    listProjectOptions(userId),
    isTrackingEnabled(userId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <Link
          href="/notes"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← Notes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text">
          New note
        </h1>
      </header>

      <NoteEditor
        action={createNoteAction}
        submitLabel="Create note"
        projects={projects}
        initial={{
          title: presetTitle,
          content: "",
          tags: [],
          isFavorite: false,
          projectId: null,
        }}
      />

      {trackFocus && <FocusTracker selector='textarea[name="content"]' />}
    </div>
  );
}
