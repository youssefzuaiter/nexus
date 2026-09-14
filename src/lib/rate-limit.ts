import "server-only";

// A single Next.js process is the whole deployment for this app, so an
// in-memory sliding window is enough — no Redis for a personal, single-server
// app. A restart clears it, which is an acceptable trade-off here.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function getFreshBucket(key: string): Bucket | null {
  const bucket = buckets.get(key);
  if (!bucket) return null;
  if (bucket.resetAt <= Date.now()) {
    buckets.delete(key);
    return null;
  }
  return bucket;
}

export function isRateLimited(key: string): boolean {
  const bucket = getFreshBucket(key);
  return bucket !== null && bucket.count >= MAX_ATTEMPTS;
}

export function registerFailedAttempt(key: string): void {
  const bucket = getFreshBucket(key);
  if (bucket) {
    bucket.count += 1;
  } else {
    buckets.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  }
}

export function clearAttempts(key: string): void {
  buckets.delete(key);
}

export function minutesUntilReset(key: string): number {
  const bucket = getFreshBucket(key);
  if (!bucket) return 0;
  return Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 60_000));
}
