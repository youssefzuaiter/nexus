import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { toApiResponse } from "@/lib/api-response";
import { answerQuestion } from "@/services/assistant-service";

const chatSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10_000),
      }),
    )
    .max(20)
    .default([]),
});

export async function POST(request: Request) {
  let userId: string;
  let parsed: z.infer<typeof chatSchema>;

  try {
    userId = await requireUserId();
    const result = chatSchema.safeParse(await request.json());
    if (!result.success) {
      return Response.json(
        { success: false, data: null, error: { code: "VALIDATION_ERROR", message: "Ask a question between 1 and 2000 characters." } },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch (error) {
    const body = toApiResponse(error);
    const status = body.error?.code === "AUTH_REQUIRED" ? 401 : 500;
    return Response.json(body, { status });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));

      try {
        for await (const event of answerQuestion(
          userId,
          parsed.question,
          parsed.history,
          request.signal,
        )) {
          send(event);
        }
      } catch (error) {
        const body = toApiResponse(error);
        send({ type: "error", error: body.error });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
