import os from "node:os";
import path from "node:path";

/**
 * Environment for the end-to-end permission tests. It must be imported before the app so that
 * `env.ts` sees these values: a throwaway SQLite file in the OS temp directory, never dev.db, and
 * a test-only signing secret.
 */
export const TEST_DATABASE_FILE = path.join(os.tmpdir(), `skillgraph-permissions-${process.pid}.db`);

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = `file:${TEST_DATABASE_FILE}`;
process.env.JWT_SECRET = "permission-test-secret-not-used-in-app";
process.env.AI_PROVIDER = "template";
