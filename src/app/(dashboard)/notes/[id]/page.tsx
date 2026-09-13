import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { getNote } from "@/repositories/note-repository";
import { NoteEditor } from "@/components/note-editor";
import { updateNoteAction, deleteNoteAction } from "@/actions/notes";
import { listProjectOptions } from "@/repositories/project-repository";


export const metadata = { title: "Note · Nexus" };

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const userId = await requireUserId();
  const { id } = await params;

  const note = await getNote(userId, id);
  if (!note) notFound();

  const projects = await listProjectOptions(userId);

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
    </div>
  );
}
