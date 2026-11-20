/**
 * Sign-in diagnostic for local development.
 *
 * Run with: npm run db:check-signin -w server
 *
 * It loads .env exactly the way the API does, then checks the environment, the SQLite file the app
 * would actually open, migrations, demo accounts, and a real login over an in-process HTTP server.
 * Secrets, password hashes and cookie values are never printed.
 */

import "../src/env";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { prisma } from "../src/db";
import { verifyPassword } from "../src/auth/password";
import { app } from "../src/app";

const PRISMA_DIR = fileURLToPath(new URL(".", import.meta.url));
const SERVER_DIR = path.resolve(PRISMA_DIR, "..");
const DEMO_PASSWORD = "Demo@12345";
const DEMO_CANDIDATE = "candidate1@skillgraph.test";
const DEMO_EMAILS = [
  "recruiter@skillgraph.test",
  "candidate1@skillgraph.test",
  "candidate2@skillgraph.test",
  "candidate3@skillgraph.test",
];

type Failure = { check: string; fix: string };
const failures: Failure[] = [];

function pass(check: string, message: string) {
  console.log(`PASS ${check} ${message}`);
}

function fail(check: string, message: string, fix: string) {
  failures.push({ check, fix });
  console.log(`FAIL ${check} ${message}`);
  console.log(`     Fix: ${fix}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Resolves a file: DATABASE_URL the way Prisma resolves SQLite paths: from schema.prisma's folder. */
function resolveSqliteFile(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const raw = url.slice("file:".length);
  if (!raw) return null;
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(PRISMA_DIR, raw);
}

/** Every dev.db under server/, ignoring dependencies, so stray copies are visible. */
function findDevDatabases(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findDevDatabases(full, found);
    else if (entry.isFile() && entry.name === "dev.db") found.push(full);
  }
  return found;
}

async function checkEnvironment() {
  const nodeEnv = process.env.NODE_ENV ?? "";
  const port = process.env.PORT ?? "";
  const details = `NODE_ENV=${nodeEnv || "(unset)"} PORT=${port || "(unset)"}`;

  if (nodeEnv === "production") {
    fail(
      "a.",
      `${details} — production mode disables the local .env override and marks the session cookie Secure.`,
      'Set NODE_ENV=development (or remove NODE_ENV) in server/.env, then restart the API.',
    );
    return;
  }
  if (port === "0") {
    fail(
      "a.",
      `${details} — port 0 binds a random port, but the Vite client proxies /api to localhost:4000.`,
      "Set PORT=4000 in server/.env (or remove the shell PORT=0), then restart the API.",
    );
    return;
  }
  pass("a.", `${details}`);
}

async function checkDatabaseFile() {
  const url = process.env.DATABASE_URL ?? "";
  const resolved = resolveSqliteFile(url);

  if (!resolved) {
    fail(
      "b.",
      "DATABASE_URL is not a file: SQLite URL.",
      "Set DATABASE_URL=file:./dev.db in server/.env.",
    );
    return;
  }

  const exists = fs.existsSync(resolved);
  const size = exists ? fs.statSync(resolved).size : 0;
  const databases = findDevDatabases(SERVER_DIR);

  console.log(
    `     SQLite: ${resolved} (${exists ? `exists, ${formatBytes(size)}` : "missing"})`,
  );
  for (const file of databases) {
    const label = path.relative(SERVER_DIR, file);
    console.log(`     dev.db found: server/${label} (${formatBytes(fs.statSync(file).size)})`);
  }

  if (!exists) {
    fail(
      "b.",
      `${resolved} does not exist.`,
      "Run `npx prisma migrate deploy` from server/ to create it.",
    );
    return;
  }
  if (databases.length > 1) {
    const stray = databases
      .filter((file) => path.resolve(file) !== path.resolve(resolved))
      .map((file) => path.relative(process.cwd(), file));
    fail(
      "b.",
      `${databases.length} dev.db files exist under server/; the extra ${stray.join(", ")} can hide the real one.`,
      `Remove the stray file from PowerShell: Remove-Item "${path.join(SERVER_DIR, stray[0] ?? "")}" -Force`,
    );
    return;
  }
  pass("b.", `${path.relative(SERVER_DIR, resolved)} exists, ${formatBytes(size)}, only dev.db under server/`);
}

type MigrationRow = { migration_name: string; finished_at: unknown };

async function checkMigrations() {
  const dirs = fs
    .readdirSync(path.join(PRISMA_DIR, "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  try {
    const rows = await prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at FROM _prisma_migrations
    `;
    const finished = new Set(
      rows.filter((row) => row.finished_at !== null).map((row) => row.migration_name),
    );
    const pending = dirs.filter((name) => !finished.has(name));

    if (pending.length > 0) {
      fail(
        "c.",
        `${pending.length} pending migration(s): ${pending.join(", ")}`,
        "Run `npx prisma migrate deploy` from server/.",
      );
      return;
    }
    pass("c.", `${dirs.length} migrations on disk, all finished in _prisma_migrations`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(
      "c.",
      `could not read _prisma_migrations (${message.split("\n")[0]})`,
      "Run `npx prisma migrate deploy` from server/.",
    );
  }
}

async function checkUsers() {
  const total = await prisma.user.count();
  const users = await prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    select: { email: true, passwordHash: true },
  });
  const existing = new Set(users.map((user) => user.email));
  const found = DEMO_EMAILS.filter((email) => existing.has(email));
  const missing = DEMO_EMAILS.filter((email) => !existing.has(email));
  const candidate = users.find((user) => user.email === DEMO_CANDIDATE);
  const passwordOk = candidate ? await verifyPassword(DEMO_PASSWORD, candidate.passwordHash) : false;

  console.log(
    `     users=${total}; demo found=${found.length}/4${missing.length ? ` (missing ${missing.join(", ")})` : ""}; ${DEMO_CANDIDATE} password=${passwordOk ? "verifies" : "does not verify"}`,
  );

  if (total === 0 || missing.length > 0 || !passwordOk) {
    fail(
      "d.",
      total === 0
        ? "the database has no users."
        : `${missing.length} demo account(s) missing or the demo password does not verify.`,
      "Run `npm run db:seed -w server`.",
    );
    return;
  }
  pass("d.", `${total} users, all four demo accounts present, demo password verifies`);
}

async function checkHttpLogin() {
  let server: Server | undefined;
  try {
    server = app.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no ephemeral port");
    const base = `http://127.0.0.1:${address.port}`;

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: DEMO_CANDIDATE, password: DEMO_PASSWORD }),
    });
    const cookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith("sg_session="));
    const cookiePair = cookie?.split(";")[0] ?? "";

    const me = await fetch(`${base}/api/auth/me`, {
      headers: cookiePair ? { cookie: cookiePair } : undefined,
    });
    const health = await fetch(`${base}/api/health`);

    console.log(
      `     login=${login.status} sessionCookie=${cookie ? "yes" : "no"} me=${me.status} health=${health.status}`,
    );

    if (login.status !== 200 || !cookie || me.status !== 200 || health.status !== 200) {
      fail(
        "e.",
        `in-process login did not complete (login ${login.status}, cookie ${cookie ? "yes" : "no"}, me ${me.status}, health ${health.status}).`,
        "Fix the earlier failing check first; if all others pass, review server/src/routes/auth.ts.",
      );
      return;
    }
    pass("e.", "login 200 with session cookie; /api/auth/me 200; /api/health 200");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail("e.", `in-process server failed: ${message}`, "Inspect the first failing check.");
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
  }
}

async function main() {
  console.log("SkillGraph sign-in check");
  await checkEnvironment();
  await checkDatabaseFile();
  await checkMigrations();
  await checkUsers();
  await checkHttpLogin();

  if (failures.length === 0) {
    console.log("VERDICT: PASS — every sign-in check passed.");
    process.exitCode = 0;
  } else {
    const first = failures[0];
    console.log(`VERDICT: FAIL at ${first.check} — ${first.fix}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL runner — ${message}`);
    console.log("VERDICT: FAIL at runner — fix the error above, then rerun the check.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
