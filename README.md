# SkillGraph

**Show what you can do, not just what’s on your résumé.**

SkillGraph is a proof-of-work hiring app. Recruiters turn a role brief into a practical assessment, and candidates complete it in the browser. Recruiters mark the work against a rubric; the app adds up the marks and shows the evidence behind them.

## What you can do

| Candidates | Recruiters |
| --- | --- |
| Build a profile, choose skills, and browse open roles. | Post role requirements and draft, edit, and publish versioned assessments. |
| Practise with short, skill-matched challenges, from writing SQL to making an editing decision. | Review submissions, mark individual criteria, and ask follow-up questions. |
| Save assessment answers as you go, submit when ready, and see your results after marking. | Compare skill evidence and keep shortlists with private notes. |

Daily practice is separate from hiring assessments. Checkable practice answers can earn points, while open-ended challenges reveal self-review criteria. Recruiters don’t see your practice answers.

## Run it locally

You’ll need **Node.js 22.12+** and npm. No external database or AI key is required.

1. Clone the repo and run `npm ci` from the root.
2. Copy `server/.env.example` to `server/.env`. Set `JWT_SECRET` to your own random secret (at least 16 characters). For local use, keep `DATABASE_URL=file:./dev.db` and `AI_PROVIDER=template`.
3. From the repo root, run:

   ```sh
   npm exec -w server -- prisma migrate deploy
   npm run db:seed -w server
   npm run dev
   ```

4. Open **[localhost:5173](http://localhost:5173)**. Choose **Sign in using a demo account**, pick a role, then sign in. The API runs on port `4000`.

The seed includes a published assessment, sample submissions, role posts, and a shortlist. Follow the [demo walkthrough](DEMO.md) to try both sides. For a deployed demo, use seeded demo data and build the client with `VITE_ENABLE_DEMO_LOGIN=true`.

## Built with

React, TypeScript, Vite, and Tailwind CSS on the client; Express, Prisma, and SQLite on the server. Draft generation works with templates by default. Template output is labelled as such, and assessment marks are always assigned by a recruiter.

For contributors: [repo conventions](CLAUDE.md) · [design brief](client/DESIGN.md)
