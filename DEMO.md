# SkillGraph demo walkthrough

A ten-minute path through the whole product: brief → draft → publish → attempt → marking → result,
comparison and shortlist. Everything runs locally with no API key; the seeded assessment is template
wording, and every screen says so.

## What the seed puts in place

`npm run db:seed -w server` (idempotent — running it again skips the demo assessment) creates the
rows below. Run it with the same `DATABASE_URL` your API uses, otherwise it writes to a different
file than the one being served:

| Item | Detail |
|---|---|
| Skill library | 9 domains, 72 skills, 157 subskills |
| Accounts | `recruiter@skillgraph.test`, `candidate1..3@skillgraph.test` (password printed by the seed) |
| Assessment | "Operations Analyst Assessment" for Northline Trading, **published**, 3 tasks, 100 marks, weights 40/30/30 |
| Submission A | Arjun Shetty (`candidate1`) — submitted, **fully marked**, `reviewedAt` set |
| Submission B | Meera Kulkarni (`candidate2`) — submitted, **not marked**, so marking can be demonstrated live |
| Shortlist | "Operations analyst - shortlist" holding Arjun, with a private note |
| Requirements posts | Two open roles (operations analyst in Bengaluru, remote data analyst) with skills, experience and work type, shown under **Opportunities**; close one from the recruiter posts page and it leaves the candidate feed without being deleted |
| Candidate profiles | Demo candidates have a headline, city, years of experience and a short about text, so the profile page is filled in |

The tasks, rubrics and answer keys come from the same template assembler the app uses. The marks on
Submission A are sample marks placed by the seed — the app computes totals, coverage and follow-ups,
but nothing in the product invents a mark.

If you already have a database you want to keep, run the seed against a copy:

```bash
DATABASE_URL="file:./prisma/demo.db" npx prisma migrate deploy   # from server/
DATABASE_URL="file:./prisma/demo.db" npx tsx prisma/seed.ts
```

## The walkthrough

Run `npm run dev` (API on `:4000`, client on `:5173`).

### 1. Recruiter overview — `http://localhost:5173/recruiter`

Sign in as `recruiter@skillgraph.test`. The overview lists **Operations Analyst** for Northline
Trading with one published version. Point out that this came from a brief, not from a form: the
wizard parsed the requirements into skills, level and duration.

### 2. The published version

Open the assessment, then version 1. Show:

- 3 tasks, 100 marks, weights 40/30/30, status **Published**, read-only.
- Each task expands to its prompt, the data the candidate receives, the rubric, and a
  **recruiter-only** disclosure with the answer key and marking guidance.
- The Submissions panel on the right: two candidates, sorted by marks.

### 3. Marked evidence — open Arjun Shetty

- Total **79 / 100**, `reviewedAt` set, "every criterion marked".
- **Skill evidence**: marks per skill with coverage, plus the share chart.
- **Interview follow-up questions**: three, one per task, taken from the weakest or unmarked
  criteria by a fixed rule — the page says no AI is involved.
- Each task: the candidate's answer, the expected answers in a collapsed recruiter-only block, and
  the marking notes beside each criterion.

### 4. Mark a submission live — back to the version, open Meera Kulkarni

Meera's attempt is submitted and unmarked, so the page starts at 0 / 100 with
"15 criteria pending review".

- Type marks in a few criteria; the header total updates as you type and shows "Unsaved scores".
- **Save scores** → the total persists and the pending count drops.
- Leave one criterion empty and save: the total counts only marked criteria, and the pending chip
  stays. That is the rule everywhere — missing marks are not zeros.

### 5. Compare

Back on the version page, tick Arjun and Meera, then **Compare selected (2)**.

- Arjun has a composite; Meera shows **Not enough marks** rather than 0%, because nothing on her
  attempt is marked yet.
- Edit the per-skill weights to show how the composite changes, then **Save weights**: the weighting
  is stored for this version and loaded again next time you open the comparison.
- Coverage shows how much of each skill is marked, so a low number reads as missing evidence.

### 6. Shortlists

Open any submission and use the **Shortlist** card, or go to **Shortlists** in the nav.

- Arjun is already on "Operations analyst - shortlist" with a note.
- Add Meera with a note, edit it, and remove an entry.
- The note belongs to that list only: it is not on the candidate's assessment, and the candidate
  never sees it.

### 7. Candidate view — `http://localhost:5173/candidate`

Sign in as `candidate1@skillgraph.test`.

- The published assessment is listed; opening it shows the attempt already submitted.
- The task text now reads as a concrete case with figures and constraints, not a generic prompt:
  the same brief that produced a vague task in the old build produces a specific one here.
- **Your result** shows 79 out of 100 and the marks per criterion.
- Nothing private is present in the payload: no answer key, no marking guidance, no `privateData`.
  This is enforced on the server, not hidden in the UI.

Sign in as `candidate2@skillgraph.test` to see the other side: a submitted attempt with no marks
yet, and the page says so instead of showing a zero.

Under a submitted attempt, **Interview follow-up questions** lets the candidate answer the recruiter's
questions in writing. Save one, then open that submission as the recruiter: the answer appears under
the same question in the recruiter's view.

### 8. Practice tasks, profile and opportunities

Still as `candidate1`:

- **Daily tasks** — three short drills generated from the candidate's own skills. Each has a
  situation, figures, three prompts to work through and a one-line reflection. Mark one done: the
  streak and the seven-day strip update. Nothing here is marked, and no recruiter can see it.
- **Profile** — headline, city, experience and about text, with skills grouped by domain and real
  assessment statistics (available, in progress, submitted, marked, average result). Edit and save a
  field to show it persists.
- **Opportunities** — the two seeded posts with skills, experience and work type. Search for a city
  or skill, or pick a work type. Close one post as the recruiter and it disappears from here.

As the recruiter, open **Requirements posts**: the composer includes a location field with city
suggestions (type "Banga" and pick Bengaluru), skills, experience and work type. Edit, close, reopen
and remove all happen from that page, separately from assessments.

### 9. What to say about the privacy model

- A candidate's assessment and result are built from an allowlist; the answer key and marking notes
  are never loaded for them.
- A recruiter only ever reads their own assessments, attempts and shortlists — another recruiter's
  id returns 404, so ids do not confirm existence.
- Roles come from the database on every request, never from the session token.
- Signing out and calling `/api/recruiter/attempts/...` returns 401; signing in as a candidate and
  calling it returns 403. `src/tests/permissions.test.ts` asserts exactly that over real HTTP.

## Resetting

The seed skips the demo assessment when it already exists. To start from an empty database, point
`DATABASE_URL` at a new file, run `npx prisma migrate deploy`, then the seed again. There is no
delete-demo-data command, so nothing in the repo can remove data you wanted to keep.
