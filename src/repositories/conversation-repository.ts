import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  ConversationModel as Conversation,
  MessageModel as Message,
} from "@/generated/prisma/models";

/** A thread is named after the question that started it. */
export function titleFrom(question: string): string {
  const flattened = question.replace(/\s+/g, " ").trim();
  return flattened.length > 80 ? `${flattened.slice(0, 80)}…` : flattened;
}

export async function listConversations(
  userId: string,
  take = 30,
): Promise<(Conversation & { messageCount: number })[]> {
  const rows = await prisma.conversation.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take,
    include: { _count: { select: { messages: true } } },
  });
  return rows.map(({ _count, ...row }) => ({
    ...row,
    messageCount: _count.messages,
  }));
}

export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<(Conversation & { messages: Message[] }) | null> {
  return prisma.conversation.findFirst({
    where: { id: conversationId, userId, deletedAt: null },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function createConversation(
  userId: string,
  title: string,
): Promise<Conversation> {
  return prisma.conversation.create({ data: { userId, title } });
}

export async function appendMessage(
  userId: string,
  conversationId: string,
  message: {
    role: "user" | "assistant";
    content: string;
    citations?: unknown;
  },
): Promise<void> {
  // The conversation is re-checked rather than trusted: its id arrives from the
  // browser with every turn.
  const owned = await prisma.conversation.findFirst({
    where: { id: conversationId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!owned) return;

  await prisma.$transaction([
    prisma.message.create({
      data: {
        userId,
        conversationId,
        role: message.role,
        content: message.content,
        citations: message.citations
          ? JSON.parse(JSON.stringify(message.citations))
          : undefined,
      },
    }),
    // Touch the thread so the list orders by real activity.
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

export async function softDeleteConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return count > 0;
}
