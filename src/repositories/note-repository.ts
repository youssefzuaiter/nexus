import "server-only";
import { prisma } from "@/lib/prisma";
import type { NoteModel as Note } from "@/generated/prisma/models";

export type NoteSummary = Pick<
  Note,
  "id" | "title" | "tags" | "isFavorite" | "updatedAt"
> & { excerpt: string };

export type NoteInput = {
  title: string;
  content: string;
  tags: string[];
  isFavorite: boolean;
  projectId: string | null;
};

const EXCERPT_LENGTH = 160;

function toSummary(
  note: Pick<Note, "id" | "title" | "tags" | "isFavorite" | "updatedAt" | "content">,
): NoteSummary {
  const flattened = note.content.replace(/\s+/g, " ").trim();
  return {
    id: note.id,
    title: note.title,
    tags: note.tags,
    isFavorite: note.isFavorite,
    updatedAt: note.updatedAt,
    excerpt:
      flattened.length > EXCERPT_LENGTH
        ? `${flattened.slice(0, EXCERPT_LENGTH).trimEnd()}…`
        : flattened,
  };
}

export async function listNotes(
  userId: string,
  options: { favoritesOnly?: boolean; tag?: string; take?: number } = {},
): Promise<NoteSummary[]> {
  const notes = await prisma.note.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(options.favoritesOnly ? { isFavorite: true } : {}),
      ...(options.tag ? { tags: { has: options.tag } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    ...(options.take ? { take: options.take } : {}),
    select: {
      id: true,
      title: true,
      tags: true,
      isFavorite: true,
      updatedAt: true,
      content: true,
    },
  });

  return notes.map(toSummary);
}

export async function findNotesByIds(
  userId: string,
  ids: string[],
): Promise<NoteSummary[]> {
  if (ids.length === 0) return [];

  const notes = await prisma.note.findMany({
    where: { userId, deletedAt: null, id: { in: ids } },
    select: {
      id: true,
      title: true,
      tags: true,
      isFavorite: true,
      updatedAt: true,
      content: true,
    },
  });

  const byId = new Map(notes.map((note) => [note.id, toSummary(note)]));
  // Preserve the caller's ordering, which for search results is by relevance.
  return ids.flatMap((id) => {
    const note = byId.get(id);
    return note ? [note] : [];
  });
}

export async function getNote(
  userId: string,
  noteId: string,
): Promise<Note | null> {
  return prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
}

export async function createNote(
  userId: string,
  input: NoteInput,
): Promise<Note> {
  return prisma.note.create({ data: { ...input, userId } });
}

export async function updateNote(
  userId: string,
  noteId: string,
  input: NoteInput,
): Promise<Note | null> {
  // updateMany rather than update so the userId predicate is part of the write
  // itself; update() would match on id alone and only then check ownership.
  const { count } = await prisma.note.updateMany({
    where: { id: noteId, userId, deletedAt: null },
    data: input,
  });
  if (count === 0) return null;
  return getNote(userId, noteId);
}

export async function softDeleteNote(
  userId: string,
  noteId: string,
): Promise<boolean> {
  const { count } = await prisma.note.updateMany({
    where: { id: noteId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return count > 0;
}

export type DeletedNote = Pick<Note, "id" | "title" | "deletedAt">;

export async function listDeletedNotes(userId: string): Promise<DeletedNote[]> {
  return prisma.note.findMany({
    where: { userId, deletedAt: { not: null } },
    select: { id: true, title: true, deletedAt: true },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreNote(
  userId: string,
  noteId: string,
): Promise<Note | null> {
  const { count } = await prisma.note.updateMany({
    where: { id: noteId, userId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  if (count === 0) return null;
  return getNote(userId, noteId);
}

/** Permanent. Only ever called on a row that is already soft-deleted. */
export async function purgeNote(
  userId: string,
  noteId: string,
): Promise<boolean> {
  const { count } = await prisma.note.deleteMany({
    where: { id: noteId, userId, deletedAt: { not: null } },
  });
  return count > 0;
}

export async function listTags(userId: string): Promise<string[]> {
  const rows = await prisma.note.findMany({
    where: { userId, deletedAt: null },
    select: { tags: true },
  });
  return [...new Set(rows.flatMap((row) => row.tags))].sort((a, b) =>
    a.localeCompare(b),
  );
}
