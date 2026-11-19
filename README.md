# SkillGraph

SkillGraph turns a hiring brief into a practical, skill-by-skill assessment, lets a candidate take
it in the browser, and gives the recruiter a marked, evidence-backed view of the result. Scoring is
always human: the server computes totals, coverage and follow-up prompts from the rubric, and the
recruiter decides every mark.

## Roles

| Role | Can do |
|---|---|
| Candidate | Read open requirements posts, work through **daily practice tasks** built from their skills, keep a profile, browse published assessments, start or resume **one** attempt per version, answer and re-save until submitting, then read their own total, per-criterion marks and answer the interview follow-up questions |
| Recruiter | Publish and manage requirements posts, create and edit assessment drafts, publish a version, read submitted attempts of **their own** assessments, mark each rubric criterion, compare submissions, keep shortlists with private notes |

Registration picks the role once; the role used by the server is always reloaded from the database,
never taken from the session token.

## Stack

- Client: React, Vite, TypeScript, Tailwind v4, react-router-dom, recharts, lucide-react
- Server: Node, Express 5, TypeScript (`tsx`), Zod, bcryptjs, jsonwebtoken, cookie-parser
- Database: Prisma 6 + SQLite (`server/prisma/dev.db`)
- AI is optional. `AI_PROVIDER=template` (the default) needs no key and every draft it produces is
  labelled "Template wording — no AI used".

## Running it

Node 20+ and npm. The repo is an npm workspace with `client/` and `server/`.

```bash
npm install
npm run db:migrate -w server   # apply migrations to server/prisma/dev.db
npm run db:seed -w server      # skills, plus demo accounts
npm run dev                    # API on :4000, client on :5173
```

`server/.env` must provide:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` when running from `server/` |
| `JWT_SECRET` | at least 16 characters |
| `PORT` | defaults to `4000` |
| `AI_PROVIDER` | `template` or `gemini` (optional) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | only for `AI_PROVIDER=gemini` |

`.env` is never committed. If `AI_PROVIDER=gemini` is set without a key, or the free quota runs out,
generation falls back to template wording and the response says so instead of claiming AI output.

### Demo accounts

`server/prisma/seed.ts` creates one recruiter (`recruiter@skillgraph.test`) and three candidates
(`candidate1..3@skillgraph.test`). The seed script prints their shared demo password; accounts are
flagged `isDemo` and the UI shows it.

The same seed also publishes a demo assessment with two submissions, a shortlist and two
requirements posts, so every screen has something to show. [DEMO.md](DEMO.md) walks through the product with it.

## Assessment lifecycle

1. **Brief** — the recruiter describes the role; the parser proposes skills, level and duration. If
the brief is missing something the tasks need (the product, the market, whether the role manages
people, the scale, the tools), the wizard asks up to three short questions instead of generating a
vague task. Answers are folded into the stored brief. Every task then carries a concrete situation,
named constraints, figures and a deliverable built from the role and that brief; the old "describe
how you would handle a realistic situation" placeholder is gone, and the template provider produces
the same structure with no API key.
2. **Draft (v1)** — tasks, marks, minutes, rubric criteria and skill weights are generated, then
   edited. Marks total 100; weights total 100.
3. **Publish** — locks the wording, rubric and marks candidates will be scored against. A published
   version is read-only; changes go into a new version.
4. **Attempt** — a candidate starts, answers, and submits. Submitting is the point after which
   answers can no longer be saved.
5. **Marking** — the recruiter scores each rubric criterion. Only marked criteria count, so an
   attempt's total rises while marking is in progress and `reviewedAt` is set when every criterion
   is marked.
6. **Result** — the candidate sees their total and per-criterion marks; the recruiter sees skill
   evidence with coverage, rule-based follow-up questions, a side-by-side comparison and shortlists.

## Three separate things, on purpose

| Thing | What it is | Who sees it |
|---|---|---|
| Requirements post | A recruiter's hiring need: role, skills, experience, location | Every candidate, under **Opportunities**; closed posts disappear from the feed but are kept for the owner |
| Daily task | A short, unmarked practice drill drawn from the candidate's own skills | Only the candidate. No marks, no rubric, no attempt, nothing a recruiter can read |
| Assessment | A formal evaluation with tasks, marks and a rubric, attempted once per published version | The candidate attempts it; the owning recruiter marks it and reads the result |

Practice is how a candidate prepares; only an assessment produces evidence a recruiter can use.

## Privacy rules, enforced on the server

| Rule | Where it is enforced |
|---|---|
| A candidate never receives `privateData`, the answer key or `privateGuidance` | `server/src/assessments/candidateView.ts` builds the payload from an allowlist; its tests assert the private values never appear |
| A candidate cannot read a task's title, prompt, data or criteria before starting | `serializeCandidateVersion(version, started)` returns `null`/`{}`/`[]` until an attempt exists |
| A candidate's rubric view carries names, limits and awarded marks only | `server/src/routes/candidateAttempts.ts` selects `id, position, name, maxMarks` |
| A recruiter reads only their own assessments, attempts and shortlists | every query filters on `assessment.ownerId` / `shortlist.ownerId`; other owners get 404, not 403, so ids do not confirm existence |
| Shortlist notes belong to one recruiter | `Shortlist`/`ShortlistEntry` are owner-scoped; no candidate route reads those tables |
| Roles cannot be forged | `requireAuth` reloads the user (and role) from the database on each request; `requireRole` then gates the router |
| Practice stays private | `DailyTask` rows are only queried with `candidateId = currentUser.id`; no recruiter route reads the table |
| A candidate cannot answer follow-ups before submitting | `PUT /api/candidate/attempts/:attemptId/follow-ups/:criterionId` returns `409` unless the attempt is `SUBMITTED`, and the criterion must belong to that version |

Expected responses: `401` when signed out, `403` when the role is wrong, `404` when the resource is
not the caller's.

## API map

| Base path | Purpose |
|---|---|
| `/api/auth` | Register, log in, log out, current user |
| `/api/skills` | Skill library |
| `/api/candidate/skills` | The candidate's chosen skills |
| `/api/candidate/posts` | Open requirements posts from every recruiter |
| `/api/candidate/tasks` | Today's practice drills, and marking one done |
| `/api/candidate/profile` | Own profile, skills and assessment statistics |
| `/api/locations` | City suggestions for location fields |
| `/api/candidate/assessments` | Published versions, and one as the candidate sees it |
| `/api/candidate/attempts` | Start/resume, save an answer, submit, read the result, answer follow-up questions |
| `/api/recruiter/assessments` | Clarify a thin brief, generate, edit, publish, version, list submissions |
| `/api/recruiter/attempts` | One submitted attempt, save marks, compare two to four, saved comparison weights |
| `/api/recruiter/shortlists` | Own shortlists, entries and private notes |
| `/api/recruiter/posts` | Publish, list, close/reopen and remove own requirements posts |

## Checks

Run only what your change touches.

```bash
npx tsc --noEmit -p server          # server type-check
npm run build -w client             # client type-check + build
npm run lint -w client              # client lint
```

### Tests

Tests use `node:test` through `tsx`. The unit tests need no database, no network and no API key.

```bash
cd server
npx tsx --test src/assessments/candidateView.test.ts \
              src/auth/user.test.ts \
              src/auth/schemas.test.ts
npx tsx --test src/assessments/draft.test.ts src/assessments/dataTasks.test.ts \
              src/assessments/generationSchema.test.ts src/assessments/assembler.test.ts \
              src/assessments/blueprints/blueprints.test.ts \
              src/assessments/blueprints/dataBlueprints.test.ts src/ai/ai.test.ts
```

The privacy and auth tests cover: the candidate view's allowlist (before and after start), the
public user projection (no password hash), role whitelisting at registration, email normalisation,
password rules, and the error shape the API returns.

### End-to-end permission tests

```bash
cd server
npx tsx --test src/tests/permissions.test.ts
```

These start the real Express app (`src/app.ts`) on an ephemeral port. Before the first test they run
`prisma migrate deploy` against a throwaway SQLite file in the OS temp directory, build two
recruiters with one published assessment each plus two submitted attempts, and delete the file
afterwards. `dev.db` is never opened.

| Case | Expected |
|---|---|
| No cookie, or a forged session cookie | `401` |
| Candidate calling `/api/recruiter/attempts` or `/api/recruiter/shortlists` | `403` |
| Recruiter calling `/api/candidate/assessments` | `403` |
| Recruiter asking for another recruiter's submission, versions or shortlist | `404` |
| Owner reading their own submission | `200` |
| Candidate reading their own attempt | `200`, with no `answerKey`, `privateGuidance`, `privateData` or expected value |
| Candidate asking for another candidate's attempt | `404` |

## Known limitations

- The permission suite covers the paths it names above; other routes are not exercised end to end yet.
- Daily practice tasks are generated from the candidate's skills with the same scenario engine as
  assessments, but they are not marked and never feed a recruiter-facing score.
- Location suggestions come from a curated static city list with common aliases (Bangalore for
  Bengaluru). Free text is accepted everywhere, so a missing place is not a blocker.
- Shortlists can be renamed but not reordered; the list sorts by most recent activity.
- File-upload task answers are not implemented; those tasks accept written answers only.
- SQLite is the only configured database.
