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
import { parseWikiLinks } from "@/lib/wiki-links";
import * as linkRepository from "@/repositories/link-repository";
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

async function syncNoteLinks(userId: string, note: Note): Promise<void> {
  const titles = parseWikiLinks(note.content);
  const { resolved } = await linkRepository.resolveNoteTitles(userId, titles);
  await linkRepository.replaceOutgoingLinks(
    userId,
    note.id,
    resolved.map((target) => target.id),
  );
}

const MAX_REFERRERS = 50;

/**
 * A `[[Thesis outline]]` written before that note exists resolves to nothing, so
 * creating or renaming a note has to re-resolve everyone who mentions its title
 * — otherwise those links would stay broken until each referrer was edited by
 * hand.
 */
async function resyncReferrers(userId: string, title: string, skipId: string) {
  const trimmed = title.trim();
  if (!trimmed) return;

  const referrers = await prisma.note.findMany({
    where: {
      userId,
      deletedAt: null,
      id: { not: skipId },
      content: { contains: trimmed, mode: "insensitive" },
    },
    take: MAX_REFERRERS,
  });

  for (const referrer of referrers) {
    await syncNoteLinks(userId, referrer);
  }
}

export async function createNote(
  userId: string,
  input: NoteInput,
): Promise<Note> {
  await assertProjectOwned(userId, input.projectId);
  const note = await noteRepository.createNote(userId, input);
  await syncNoteIndex(userId, note);
  await syncNoteLinks(userId, note);
  await resyncReferrers(userId, note.title, note.id);
  return note;
}

export async function updateNote(
  userId: string,
  noteId: string,
  input: NoteInput,
): Promise<Note> {
  await assertProjectOwned(userId, input.projectId);

  const before = await noteRepository.getNote(userId, noteId);
  const note = await noteRepository.updateNote(userId, noteId, input);
  if (!note) {
    throw new AppError("RESOURCE_NOT_FOUND", "That note no longer exists.");
  }

  await syncNoteIndex(userId, note);
  await syncNoteLinks(userId, note);

  // A rename changes who resolves to this note, under both the old and new title.
  if (before && before.title !== note.title) {
    await resyncReferrers(userId, before.title, note.id);
    await resyncReferrers(userId, note.title, note.id);
  }
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
  await linkRepository.deleteLinksFor(userId, noteId);
}

/**
 * Undoes `deleteNote`. Both halves of the delete have to be undone too: the
 * note is re-indexed so semantic search can see it again, and its links are
 * re-resolved in both directions — `[[Title]]` mentions written while it was
 * in the trash resolve to nothing, and stay broken unless referrers are resynced.
 */
export async function restoreNote(userId: string, noteId: string): Promise<Note> {
  const note = await noteRepository.restoreNote(userId, noteId);
  if (!note) {
    throw new AppError("RESOURCE_NOT_FOUND", "That note is not in the trash.");
  }

  await syncNoteIndex(userId, note);
  await syncNoteLinks(userId, note);
  await resyncReferrers(userId, note.title, note.id);
  return note;
}

export async function purgeNote(userId: string, noteId: string): Promise<void> {
  // Embeddings and links were already dropped when it was soft-deleted, so
  // nothing survives the row itself.
  const purged = await noteRepository.purgeNote(userId, noteId);
  if (!purged) {
    throw new AppError("RESOURCE_NOT_FOUND", "That note is not in the trash.");
  }
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
