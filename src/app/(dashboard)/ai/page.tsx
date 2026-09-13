import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AssistantChat } from "@/components/assistant-chat";

export const metadata = { title: "Assistant · Nexus" };

export default async function AssistantPage() {
  const userId = await requireUserId();
  const indexedChunks = await prisma.workspaceEmbedding.count({
    where: { userId },
  });

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          Assistant
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {indexedChunks === 0
            ? "Nothing is indexed yet — write a note and it becomes searchable here."
            : `Grounded in ${indexedChunks} indexed ${indexedChunks === 1 ? "chunk" : "chunks"} from your workspace.`}
        </p>
      </header>

      <AssistantChat />
    </div>
  );
}
