import "dotenv/config";
import { deleteTestAccounts } from "./test-account";

export default async function globalTeardown() {
  const removed = await deleteTestAccounts();
  console.log(`[e2e] removed ${removed} test account(s)`);
}
