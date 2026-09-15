import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { getNote } from "@/repositories/note-repository";
import { NoteEditor } from "@/components/note-editor";
import { updateNoteAction, deleteNoteAction } from "@/actions/notes";
import { listProjectOptions } from "@/repositories/project-repository";
import { listCourseOptions } from "@/repositories/course-repository";
import { isTrackingEnabled } from "@/repositories/focus-repository";
import { FocusTracker } from "@/components/focus-tracker";
import {
  getOutgoingLinks,
  getBacklinks,
  resolveNoteTitles,
} from "@/repositories/link-repository";
import { parseWikiLinks } from "@/lib/wiki-links";
import { NoteLinks } from "@/components/note-links";
import { listForNote } from "@/repositories/flashcard-repository";
import { GenerateCards } from "@/components/generate-cards";
import { NoteView } from "@/components/note-view";
import { RelatedItems } from "@/components/related-items";
import { NoteAttachments } from "@/components/note-attachments";
import { listForNote as listAttachments } from "@/repositories/attachment-repository";
import { findRelated } from "@/services/search-service";
import { normalizeTitle } from "@/lib/wiki-links";


export const metadata = { title: "Note · Nexus" };

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const userId = await requireUserId();
  const { id } = await params;

  const note = await getNote(userId, id);
  if (!note) notFound();

  const [projects, courses, outgoing, backlinks, titles, trackFocus, cards, attachments] =
    await Promise.all([
      listProjectOptions(userId),
      listCourseOptions(userId),
      getOutgoingLinks(userId, note.id),
      getBacklinks(userId, note.id),
      Promise.resolve(parseWikiLinks(note.content)),
      isTrackingEnabled(userId),
      listForNote(userId, note.id),
      listAttachments(userId, note.id),
    ]);
  const [{ resolved, unresolved }, related] = await Promise.all([
    resolveNoteTitles(userId, titles),
    findRelated(userId, "note", note.id, 5),
  ]);

  // Normalized title -> id, so the renderer can turn [[Title]] into a real link
  // without re-querying per link.
  const linkTargets: Record<string, string | null> = {};
  for (const title of titles) linkTargets[normalizeTitle(title)] = null;
  for (const target of resolved) linkTargets[normalizeTitle(target.title)] = target.id;

  const updateThisNote = updateNoteAction.bind(null, note.id);
  const deleteThisNote = deleteNoteAction.bind(null, note.id);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/notes"
            className="text-sm text-text-muted transition-colors hover:text-text"
          >
            ← Notes
          </Link>
          <Link
            href={`/notes/${note.id}/history`}
            className="text-sm text-text-muted transition-colors hover:text-text"
          >
            History
          </Link>
        </div>
      </header>

      <NoteView
        content={note.content}
        links={linkTargets}
        editor={
          <NoteEditor
            action={updateThisNote}
            submitLabel="Save changes"
            projects={projects}
            courses={courses}
            initial={{
              title: note.title,
              content: note.content,
              tags: note.tags,
              isFavorite: note.isFavorite,
              projectId: note.projectId,
              courseId: note.courseId,
            }}
            onDelete={deleteThisNote}
          />
        }
      />

      {trackFocus && <FocusTracker selector='textarea[name="content"]' />}

      <section className="mt-6 border-t border-border-subtle pt-5">
        <GenerateCards noteId={note.id} existing={cards.length} />
      </section>

      <section className="mt-6 border-t border-border-subtle pt-5">
        <NoteAttachments
          noteId={note.id}
          attachments={attachments.map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: `${Math.max(1, Math.round(attachment.byteSize / 1024))} KB`,
            isImage: attachment.mimeType.startsWith("image/"),
          }))}
        />
      </section>

      <section className="mt-6 border-t border-border-subtle pt-5">
        <RelatedItems items={related} />
      </section>

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
