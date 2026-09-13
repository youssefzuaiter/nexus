import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { getNote } from "@/repositories/note-repository";
import { NoteEditor } from "@/components/note-editor";
import { updateNoteAction, deleteNoteAction } from "@/actions/notes";
import { listProjectOptions } from "@/repositories/project-repository";
import { isTrackingEnabled } from "@/repositories/focus-repository";
import { FocusTracker } from "@/components/focus-tracker";
import {
  getOutgoingLinks,
  getBacklinks,
  resolveNoteTitles,
} from "@/repositories/link-repository";
import { parseWikiLinks } from "@/lib/wiki-links";
import { NoteLinks } from "@/components/note-links";


export const metadata = { title: "Note · Nexus" };

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const userId = await requireUserId();
  const { id } = await params;

  const note = await getNote(userId, id);
  if (!note) notFound();

  const [projects, outgoing, backlinks, titles, trackFocus] = await Promise.all([
    listProjectOptions(userId),
    getOutgoingLinks(userId, note.id),
    getBacklinks(userId, note.id),
    Promise.resolve(parseWikiLinks(note.content)),
    isTrackingEnabled(userId),
  ]);
  const { unresolved } = await resolveNoteTitles(userId, titles);

  const updateThisNote = updateNoteAction.bind(null, note.id);
  const deleteThisNote = deleteNoteAction.bind(null, note.id);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <Link
          href="/notes"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← Notes
        </Link>
      </header>

      <NoteEditor
        action={updateThisNote}
        submitLabel="Save changes"
        projects={projects}
        initial={{
          title: note.title,
          content: note.content,
          tags: note.tags,
          isFavorite: note.isFavorite,
          projectId: note.projectId,
        }}
        onDelete={deleteThisNote}
      />

      {trackFocus && <FocusTracker selector='textarea[name="content"]' />}

      <section className="mt-6 border-t border-border-subtle pt-5">
        <NoteLinks
          outgoing={outgoing}
          backlinks={backlinks}
          unresolved={unresolved}
        />
      </section>
    </div>
  );
}
