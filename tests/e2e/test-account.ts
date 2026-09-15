/**
 * The e2e account. Shared by setup and teardown, which both run outside the
 * Next.js runtime — so this file deliberately uses `pg` directly rather than
 * Prisma, whose client imports `server-only` and refuses to load here.
 */
import { Client } from "pg";

export const TEST_EMAIL_PREFIX = "e2e-";
export const TEST_PASSWORD = "e2e-password-1234";

export function testEmail(): string {
  return `${TEST_EMAIL_PREFIX}${Date.now()}@test.local`;
}

export const STORAGE_STATE = "tests/e2e/.auth/state.json";

/** Removes every account this suite has ever created, including leftovers
 *  from a run that was interrupted before teardown. */
export async function deleteTestAccounts(): Promise<number> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `DELETE FROM "User" WHERE email LIKE $1`,
      [`${TEST_EMAIL_PREFIX}%@test.local`],
    );
    return rowCount ?? 0;
  } finally {
    await client.end();
  }
}
