import "server-only";
import { auth } from "@/auth";
import { AppError } from "@/lib/api-response";

export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * The only sanctioned source of a userId for queries. Never accept one from the
 * client — every repository call must scope to the value this returns.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new AppError("AUTH_REQUIRED", "You must be signed in to do that.");
  }
  return userId;
}
