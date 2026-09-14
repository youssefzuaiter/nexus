import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/wiki-links";

export type LinkedNote = { id: string; title: string };

/**
 * Resolves `[[title]]` references to the user's own notes. Titles are matched
 * case-insensitively; an ambiguous title resolves to the most recently updated
 * note bearing it, and titles with no match are returned as unresolved.
 */
export async function resolveNoteTitles(
  userId: string,
  titles: string[],
): Promise<{ resolved: LinkedNote[]; unresolved: string[] }> {
  if (titles.length === 0) return { resolved: [], unresolved: [] };

  const candidates = await prisma.note.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: titles.map((title) => ({
        title: { equals: title, mode: "insensitive" as const },
      })),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });

  const byTitle = new Map<string, LinkedNote>();
  for (const note of candidates) {
    const key = normalizeTitle(note.title);
    if (!byTitle.has(key)) byTitle.set(key, note);
  }

  const resolved: LinkedNote[] = [];
  const unresolved: string[] = [];

  for (const title of titles) {
    const match = byTitle.get(normalizeTitle(title));
    if (match) resolved.push(match);
    else unresolved.push(title);
  }

  return { resolved, unresolved };
}

export async function replaceOutgoingLinks(
  userId: string,
  sourceId: string,
  targetIds: string[],
): Promise<void> {
  // Self-links are meaningless and would make a note its own backlink.
  const targets = [...new Set(targetIds)].filter((id) => id !== sourceId);

  await prisma.$transaction([
    prisma.entityLink.deleteMany({
      where: { userId, sourceType: "note", sourceId },
    }),
    ...(targets.length === 0
      ? []
      : [
          prisma.entityLink.createMany({
            data: targets.map((targetId) => ({
              id: randomUUID(),
              userId,
              sourceType: "note",
              sourceId,
              targetType: "note",
              targetId,
            })),
          }),
        ]),
  ]);
}

export async function deleteLinksFor(
  userId: string,
  noteId: string,
): Promise<void> {
  // Both directions: the note disappears as a source and as a target.
  await prisma.entityLink.deleteMany({
    where: {
      userId,
      OR: [
        { sourceType: "note", sourceId: noteId },
        { targetType: "note", targetId: noteId },
      ],
    },
  });
}

export async function getOutgoingLinks(
  userId: string,
  noteId: string,
): Promise<LinkedNote[]> {
  const links = await prisma.entityLink.findMany({
    where: { userId, sourceType: "note", sourceId: noteId },
    select: { targetId: true },
  });

  return notesByIds(
    userId,
    links.map((link) => link.targetId),
  );
}

export async function getBacklinks(
  userId: string,
  noteId: string,
): Promise<LinkedNote[]> {
  const links = await prisma.entityLink.findMany({
    where: { userId, targetType: "note", targetId: noteId },
    select: { sourceId: true },
  });

  return notesByIds(
    userId,
    links.map((link) => link.sourceId),
  );
}

export type GraphNode = { id: string; title: string; tags: string[] };
export type GraphEdge = { source: string; target: string };

/** Every note as a node, and every resolved note-to-note link as an edge. */
export async function listGraph(
  userId: string,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const [notes, links] = await Promise.all([
    prisma.note.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, title: true, tags: true },
      orderBy: { title: "asc" },
    }),
    prisma.entityLink.findMany({
      where: { userId, sourceType: "note", targetType: "note" },
      select: { sourceId: true, targetId: true },
    }),
  ]);

  const nodeIds = new Set(notes.map((note) => note.id));
  const edges = links
    .filter((link) => nodeIds.has(link.sourceId) && nodeIds.has(link.targetId))
    .map((link) => ({ source: link.sourceId, target: link.targetId }));

  return { nodes: notes, edges };
}

async function notesByIds(
  userId: string,
  ids: string[],
): Promise<LinkedNote[]> {
  if (ids.length === 0) return [];

  return prisma.note.findMany({
    where: { userId, deletedAt: null, id: { in: ids } },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}
