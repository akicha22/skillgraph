# SkillGraph: standing rules for Claude Code

## What this project is
SkillGraph is an existing, working app being evolved step by step. It is NOT a rebuild.
Preserve working code. Make the smallest change that does the task.

## Stack (do not change or upgrade)
- npm workspaces: `client/` and `server/`. Windows + PowerShell.
- Client: React, Vite, TypeScript, Tailwind v4, react-router-dom, recharts, lucide-react.
- Server: Node, Express, TypeScript (`"type": "module"`, run with tsx), Zod, bcryptjs, jsonwebtoken, cookie-parser.
- Database: Prisma 6 + SQLite (`server/prisma/dev.db`). Do NOT upgrade to Prisma 7.
- Free tools only. No paid APIs or services. `AI_PROVIDER=template` must always work with no API key.

## Commands
- Run both: `npm run dev` (from repo root)
- Type-check server: `npx tsc --noEmit -p server`
- Build + type-check client: `npm run build -w client`
- Lint client: `npm run lint -w client`
- Run one test file: `npx tsx --test <path-to-file>.test.ts` (uses node:test, no extra dependencies)
- Seed: `npm run db:seed -w server`
- Migrations: only when a task says so: `cd server` then `npx prisma migrate dev --name <name>`, then `npx prisma generate`

Run only the checks that match what you changed. Do not run the full client+server suite "to be safe".
- Server-only (`server/`): `npx tsc --noEmit -p server`. If a matching `*.test.ts` exists, run that one file. Skip client build and lint.
- Client-only (`client/`): `npm run build -w client` and `npm run lint -w client`. Skip server type-check and tests.
- Both sides, or shared types/API contract: run the server checks and the client checks.
- Do not start `npm run dev` unless the task asks you to.

## Code conventions
- Server imports are extensionless (`from "../db"`). Client uses `import type` for types.
- Async route handlers are wrapped in `asyncHandler`. Errors return `{ error: string, details?: [...] }`.
- Auth: JWT in httpOnly cookie `sg_session`. `requireAuth` then `requireRole(...)`. The role always comes from the database.
- Enums are strings validated with Zod. JSON data is stored as a String column.
- The server owns the truth: AI writes wording; code computes answers, scores, state and facts.
- Candidates must never receive private answer keys, private rubric guidance or `privateData`.
- Private practice evidence must never be returned to recruiters (enforce in server queries, not just the UI).

## Layout
- Real source is only `server/src/`, `server/prisma/`, and `client/src/`. Read and edit those paths, never copies.
- npm workspaces also expose the same files under `node_modules/server/` and `node_modules/client/`. Ignore those.

## HARD RULES (never break these)
- NEVER run `git commit`, `git push`, `git reset`, `git clean`, `git checkout .`, `git stash drop` or any history-changing git command. I commit myself.
- NEVER create, switch or delete git branches.
- NEVER run `prisma migrate reset`, `prisma db push --force-reset`, or delete/replace any `*.db` file.
- NEVER edit or delete an existing folder in `server/prisma/migrations/`. Schema changes must be additive (new tables or nullable columns).
- NEVER read, print or edit `.env` files. Never put secrets in code or chat.
- NEVER delete files or folders. Never rewrite a whole existing file when a small edit works.
- NEVER add a dependency, rename a table/column, or change the stack without asking me first.
- NEVER read, search, grep, list, or edit `node_modules/`, `client/dist/`, `**/dist/`, lockfile internals, or any path under `node_modules/server` / `node_modules/client`. If a search hits those, ignore the hit and use `server/src` or `client/src` instead.
- No fake data, hardcoded scores or non-working buttons. Label template output honestly; never call it AI-generated.

## How to work
1. Do exactly ONE task per prompt. Do not start the next task.
2. Stay in the files the task names. Do not explore the rest of the repo unless a named file is missing or an error points there.
3. Before editing, list the files you will create or change (real `server/` / `client/` paths only), then proceed.
4. After editing, run only the scoped checks in Commands. Show the results. Do not rerun passing checks.
5. If something fails and you cannot fix it in two attempts, STOP and report the exact error.
6. If a task needs more than about 8 files, STOP and propose how to split it.
7. Finish with: files changed, commands run and their results, what is left. Then stop.