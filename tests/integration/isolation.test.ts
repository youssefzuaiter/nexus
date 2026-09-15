/**
 * Cross-tenant isolation for the features that shipped without any tests at
 * all in an earlier session: reminders, attachments, conversations, bulk
 * note actions, and reindexing. Every other entity already has this kind of
 * check in tests/ai/evals.ts; these five did not.
 *
 * DB-only (a real Postgres, via DATABASE_URL) and deliberately Ollama-free —
 * unlike tests/ai/evals.ts, nothing here calls embedQuery or the chat model,
 * so this tier stays fast and drops into the same CI job as the pure unit
 * tests rather than the slower model-backed one.
 */
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getDueReminders } from "@/services/reminders-service";
import * as conversationRepository from "@/repositories/conversation-repository";
import * as attachmentRepository from "@/repositories/attachment-repository";
import * as noteRepository from "@/repositories/note-repository";
import { reindexEverything } from "@/services/reindex-service";

let userA: { id: string };
let userB: { id: string };

before(async () => {
  userA = await prisma.user.create({
    data: { email: `isolation-a-${randomUUID()}@test.local`, passwordHash: "x" },
  });
  userB = await prisma.user.create({
    data: { email: `isolation-b-${randomUUID()}@test.local`, passwordHash: "x" },
  });
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.$disconnect();
});

test("reminders: a task due today never appears in another account's reminders", async () => {
  const now = new Date();
  await prisma.task.create({
    data: {
      userId: userA.id,
      title: "A's task due today",
      status: "todo",
      priority: "medium",
      estimatedMinutes: 30,
      dueDate: now,
    },
  });

  const forB = await getDueReminders(userB.id, now);
  assert.equal(forB.some((r) => r.title === "A's task due today"), false);

  const forA = await getDueReminders(userA.id, now);
  assert.equal(forA.some((r) => r.title === "A's task due today"), true);
});

test("reminders: an event starting within the hour never appears for another account", async () => {
  const now = new Date();
  await prisma.event.create({
    data: {
      userId: userA.id,
      title: "A's event soon",
      startTime: new Date(now.getTime() + 10 * 60 * 1000),
      endTime: new Date(now.getTime() + 40 * 60 * 1000),
    },
  });

  const forB = await getDueReminders(userB.id, now);
  assert.equal(forB.some((r) => r.title === "A's event soon"), false);
});

test("reminders: a completed task is never reminded about, even if due today", async () => {
  const now = new Date();
  await prisma.task.create({
    data: {
      userId: userA.id,
      title: "Already finished",
      status: "done",
      priority: "medium",
      estimatedMinutes: 30,
      dueDate: now,
    },
  });

  const forA = await getDueReminders(userA.id, now);
  assert.equal(forA.some((r) => r.title === "Already finished"), false);
});

test("attachments: another account's attachment row is invisible by id", async () => {
  const note = await prisma.note.create({
    data: { userId: userA.id, title: "A's note", content: "x" },
  });
  const attachment = await attachmentRepository.createAttachment(userA.id, {
    noteId: note.id,
    filename: "secret.txt",
    mimeType: "text/plain",
    byteSize: 4,
    storageKey: `${randomUUID()}.txt`,
  });

  assert.equal(
    await attachmentRepository.getAttachmentRow(userB.id, attachment.id),
    null,
  );
  assert.deepEqual(await attachmentRepository.listForNote(userB.id, note.id), []);
});

test("attachments: another account cannot delete an attachment by id", async () => {
  const note = await prisma.note.create({
    data: { userId: userA.id, title: "A's other note", content: "x" },
  });
  const attachment = await attachmentRepository.createAttachment(userA.id, {
    noteId: note.id,
    filename: "keep.txt",
    mimeType: "text/plain",
    byteSize: 4,
    storageKey: `${randomUUID()}.txt`,
  });

  const deletedByIntruder = await attachmentRepository.deleteAttachmentRow(
    userB.id,
    attachment.id,
  );
  assert.equal(deletedByIntruder, null);
  assert.notEqual(
    await attachmentRepository.getAttachmentRow(userA.id, attachment.id),
    null,
    "the row must still exist for its real owner",
  );
});

test("conversations: another account cannot read a conversation by id", async () => {
  const conversation = await conversationRepository.createConversation(
    userA.id,
    "A's private thread",
  );
  assert.equal(
    await conversationRepository.getConversation(userB.id, conversation.id),
    null,
  );
});

test("conversations: appending to another account's conversation id silently does nothing", async () => {
  const conversation = await conversationRepository.createConversation(
    userA.id,
    "A's other thread",
  );

  // The id arrives from the browser on every turn, not just the first — this
  // is the check that stands between that and one tenant's message landing
  // in another tenant's thread.
  await conversationRepository.appendMessage(userB.id, conversation.id, {
    role: "user",
    content: "Injected from another account",
  });

  const owned = await conversationRepository.getConversation(userA.id, conversation.id);
  assert.equal(owned?.messages.length, 0);
});

test("bulk note actions: cannot bulk-move another account's notes", async () => {
  const note = await prisma.note.create({
    data: { userId: userA.id, title: "Not yours", content: "x" },
  });

  const changed = await noteRepository.bulkUpdateNotes(userB.id, [note.id], {
    projectId: null,
  });
  assert.equal(changed, 0);
});

test("bulk note actions: cannot bulk-tag another account's notes", async () => {
  const note = await prisma.note.create({
    data: { userId: userA.id, title: "Still not yours", content: "x", tags: [] },
  });

  const changed = await noteRepository.bulkAddTag(userB.id, [note.id], "hijacked");
  assert.equal(changed, 0);
  const untouched = await noteRepository.getNote(userA.id, note.id);
  assert.deepEqual(untouched?.tags, []);
});

test("bulk note actions: cannot bulk-delete another account's notes", async () => {
  const note = await prisma.note.create({
    data: { userId: userA.id, title: "Definitely not yours", content: "x" },
  });

  const deletedIds = await noteRepository.bulkSoftDelete(userB.id, [note.id]);
  assert.deepEqual(deletedIds, []);
  assert.equal((await noteRepository.getNote(userA.id, note.id)) === null, false);
});

test("bulk note actions: a mixed selection only ever touches the caller's own notes", async () => {
  const ownNote = await prisma.note.create({
    data: { userId: userB.id, title: "B's own note", content: "x" },
  });
  const otherNote = await prisma.note.create({
    data: { userId: userA.id, title: "A's note in the mix", content: "x" },
  });

  const changed = await noteRepository.bulkUpdateNotes(
    userB.id,
    [ownNote.id, otherNote.id],
    { projectId: null },
  );
  assert.equal(changed, 1, "only the caller's own note in the selection counts");
});

test("reindex: rebuilding one account's index never creates or removes another account's embeddings", async () => {
  const note = await prisma.note.create({
    data: { userId: userB.id, title: "B's note", content: "Untouched by A's rebuild." },
  });
  await prisma.workspaceEmbedding.create({
    data: {
      id: randomUUID(),
      userId: userB.id,
      sourceType: "note",
      sourceId: note.id,
      contentChunk: "B's existing chunk, planted directly rather than via Ollama.",
    },
  });
  const beforeCount = await prisma.workspaceEmbedding.count({
    where: { userId: userB.id },
  });

  // A's rebuild is expected to fail to embed anything (no Ollama in this
  // tier) — reindexEverything must swallow that per-row and still return
  // normally, per its own documented "one unembeddable row does not abort
  // the rebuild" behaviour. What's under test here is isolation, not success.
  await reindexEverything(userA.id);

  const afterCount = await prisma.workspaceEmbedding.count({
    where: { userId: userB.id },
  });
  assert.equal(afterCount, beforeCount);
});
