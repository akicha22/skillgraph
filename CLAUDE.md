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

## Code conventions
- Server imports are extensionless (`from "../db"`). Client uses `import type` for types.
- Async route handlers are wrapped in `asyncHandler`. Errors return `{ error: string, details?: [...] }`.
- Auth: JWT in httpOnly cookie `sg_session`. `requireAuth` then `requireRole(...)`. The role always comes from the database.
- Enums are strings validated with Zod. JSON data is stored as a String column.
- The server owns the truth: AI writes wording; code computes answers, scores, state and facts.
- Candidates must never receive private answer keys, private rubric guidance or `privateData`.
- Private practice evidence must never be returned to recruiters (enforce in server queries, not just the UI).

## Layout
- `server/src/`: auth, middleware, routes, skills, assessments, utils; `server/prisma/`: schema, migrations, seed files
- `client/src/`: components, hooks, layouts, pages, services, types

## HARD RULES (never break these)
- NEVER run `git commit`, `git push`, `git reset`, `git clean`, `git checkout .`, `git stash drop` or any history-changing git command. I commit myself.
- NEVER create, switch or delete git branches.
- NEVER run `prisma migrate reset`, `prisma db push --force-reset`, or delete/replace any `*.db` file.
- NEVER edit or delete an existing folder in `server/prisma/migrations/`. Schema changes must be additive (new tables or nullable columns).
- NEVER read, print or edit `.env` files. Never put secrets in code or chat.
- NEVER delete files or folders. Never rewrite a whole existing file when a small edit works.
- NEVER add a dependency, rename a table/column, or change the stack without asking me first.
- No fake data, hardcoded scores or non-working buttons. Label template output honestly; never call it AI-generated.

## How to work
1. Do exactly ONE task per prompt. Do not start the next task.
2. Before editing, list the files you will create or change, then proceed.
3. After editing, run the type-check and build commands above and show the results.
4. If something fails and you cannot fix it in two attempts, STOP and report the exact error.
5. If a task needs more than about 8 files, STOP and propose how to split it.
6. Finish with: files changed, commands run and their results, what is left. Then stop.