import "server-only";
import { prisma } from "@/lib/prisma";
import type { AttachmentModel as Attachment } from "@/generated/prisma/models";

export async function listForNote(
  userId: string,
  noteId: string,
): Promise<Attachment[]> {
  return prisma.attachment.findMany({
    where: { userId, noteId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAttachmentRow(
  userId: string,
  attachmentId: string,
): Promise<Attachment | null> {
  return prisma.attachment.findFirst({ where: { id: attachmentId, userId } });
}

export async function createAttachment(
  userId: string,
  input: {
    noteId: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    storageKey: string;
  },
): Promise<Attachment> {
  return prisma.attachment.create({ data: { ...input, userId } });
}

export async function deleteAttachmentRow(
  userId: string,
  attachmentId: string,
): Promise<Attachment | null> {
  const row = await getAttachmentRow(userId, attachmentId);
  if (!row) return null;
  await prisma.attachment.delete({ where: { id: row.id } });
  return row;
}
