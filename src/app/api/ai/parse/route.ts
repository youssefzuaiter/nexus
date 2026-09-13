import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { ok, toApiResponse } from "@/lib/api-response";
import { parseCapture } from "@/services/parse-service";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request) {
  try {
    // Parsing reads nothing and writes nothing, but it still costs model time,
    // so it stays behind authentication like every other AI route.
    await requireUserId();

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          data: null,
          error: {
            code: "VALIDATION_ERROR",
            message: "Provide text between 1 and 1000 characters.",
          },
        },
        { status: 400 },
      );
    }

    return Response.json(ok(await parseCapture(parsed.data.text)));
  } catch (error) {
    const body = toApiResponse(error);
    const status =
      body.error?.code === "AUTH_REQUIRED"
        ? 401
        : body.error?.code === "AI_UNAVAILABLE"
          ? 503
          : 500;
    return Response.json(body, { status });
  }
}
