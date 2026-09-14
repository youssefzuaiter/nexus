import { requireUserId } from "@/lib/session";
import { toApiResponse } from "@/lib/api-response";
import { buildFullExport } from "@/services/export-service";

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    const body = toApiResponse(error);
    return Response.json(body, { status: 401 });
  }

  const payload = await buildFullExport(userId);
  const filename = `nexus-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
