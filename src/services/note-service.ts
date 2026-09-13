import "server-only";
import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/ollama";
import {
  indexEntity,
  deleteEntityEmbeddings,
  searchWorkspaceVectors,
} from "@/lib/vector";
import { AppError } from "@/lib/api-response";
import * as noteRepository from "@/repositories/note-repository";
import { assertProjectOwned } from "@/services/project-service";
import type { NoteInput, NoteSummary } from "@/repositories/note-repository";
import type { NoteModel as Note } from "@/generated/prisma/models";

export type NoteSearchResult = {
  mode: "semantic" | "keyword";
  notes: NoteSummary[];
};

function embeddableText(note: Pick<Note, "title" | "content" | "tags">): string {
  const tagLine = note.tags.length > 0 ? `Tags: ${note.tags.join(", ")}` : "";
  return [note.title, tagLine, note.content].filter(Boolean).join("\n\n");
}

/**
 * Keeps the note's vector index in step with its content. A note must never be
 * left with embeddings of superseded text, so a failed re-index clears the old
 * rows: the note then simply misses from semantic search until it is saved
 * again, which is recoverable in a way that serving stale chunks is not.
 */
async function syncNoteIndex(userId: string, note: Note): Promise<void> {
  try {
    await indexEntity(userId, "note", note.id, embeddableText(note));
  } catch (error) {
    console.error(`[WARN] Failed to index note ${note.id}:`, error);
    await deleteEntityEmbeddings(userId, "note", note.id).catch(() => {});
  }
}

export async function createNote(
  userId: string,
  input: NoteInput,
): Promise<Note> {
  await assertProjectOwned(userId, input.projectId);
  const note = await noteRepository.createNote(userId, input);
  await syncNoteIndex(userId, note);
  return note;
}

export async function updateNote(
  userId: string,
  noteId: string,
  input: NoteInput,
): Promise<Note> {
  await assertProjectOwned(userId, input.projectId);
  const note = await noteRepository.updateNote(userId, noteId, input);
  if (!note) {
    throw new AppError("RESOURCE_NOT_FOUND", "That note no longer exists.");
  }
  await syncNoteIndex(userId, note);
  return note;
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const deleted = await noteRepository.softDeleteNote(userId, noteId);
  if (!deleted) {
    throw new AppError("RESOURCE_NOT_FOUND", "That note no longer exists.");
  }
  // Soft-deleted notes must leave the search index immediately, or the
  // assistant would keep citing content the user believes is gone.
  await deleteEntityEmbeddings(userId, "note", noteId);
}

async function keywordSearch(
  userId: string,
  query: string,
): Promise<NoteSummary[]> {
  const matches = await prisma.note.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true },
  });
  return noteRepository.findNotesByIds(
    userId,
    matches.map((note) => note.id),
  );
}

export async function searchNotes(
  userId: string,
  query: string,
): Promise<NoteSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { mode: "semantic", notes: await noteRepository.listNotes(userId) };
  }

  try {
    const hits = await searchWorkspaceVectors(
      userId,
      await embedQuery(trimmed),
      20,
      ["note"],
    );
    const orderedIds = [...new Set(hits.map((hit) => hit.sourceId))];
    return {
      mode: "semantic",
      notes: await noteRepository.findNotesByIds(userId, orderedIds),
    };
  } catch (error) {
    // Losing the model should degrade search, not remove it.
    console.error("[WARN] Semantic note search unavailable:", error);
    return { mode: "keyword", notes: await keywordSearch(userId, trimmed) };
  }
}
