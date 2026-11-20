import { publishIssues } from "../src/assessments/draft";
import { gradeDailyAnswer } from "../src/tasks/dailyQuestions";
import { buildDailyTasks, dayKey, shiftDayKey } from "../src/tasks/practice";
import { awardPoints } from "../src/tasks/scoring";
import { prisma } from "../src/db";
import { generateAssessmentDraft } from "../src/ai";

/**
 * Demo data for a walkthrough of the whole flow: one published assessment, two submitted attempts
 * (one already marked, one waiting to be marked live) and a shortlist entry with a private note.
 *
 * The assessment content comes from the template assembler, so the tasks, rubrics and answer keys
 * are the same structures the app produces when AI is off. The seeded criterion marks are sample
 * marks a recruiter would give, not computed results — nothing in the app generates them.
 *
 * Idempotent: the existing demo assessment, attempts and shortlist entries are reused.
 */

const RECRUITER_EMAIL = "recruiter@skillgraph.test";
const MARKED_CANDIDATE_EMAIL = "candidate1@skillgraph.test";
const PENDING_CANDIDATE_EMAIL = "candidate2@skillgraph.test";

const COMPANY = "Northline Trading";
const JOB_TITLE = "Operations Analyst";
const REQUIREMENTS =
  "We need a junior operations analyst in Bengaluru who can read a sales table and report on it, " +
  "write clearly to a client when something goes wrong, and handle a supplier asking for a price " +
  "increase. Office-based, about 45 minutes, no AI assistants during the assessment.";
const SHORTLIST_NAME = "Operations analyst - shortlist";
const SHORTLIST_NOTE =
  "Strong written answer to the client email. Probe the table totals at interview: one figure looked rounded.";

// Marks are a share of each criterion, varied per criterion so the totals look like real marking.
const MARK_SHARES = [0.9, 0.75, 0.8, 0.6];

/** A couple of open roles, so the candidate dashboard's posts section is never empty. */
const DEMO_POSTS = [
  {
    title: "Operations analyst - Bengaluru",
    companyName: COMPANY,
    location: "On-site, Bengaluru",
    requirements:
      "Two years of operations or data experience, comfortable with spreadsheets and client email. " +
      "You will report on sales, keep delivery dates honest and own the weekly ops review. Start in January.",
    skills: ["Excel", "Client communication", "Reporting"],
    experience: "2–4 years",
    employmentType: "FULL_TIME",
  },
  {
    title: "Data analyst - remote",
    companyName: COMPANY,
    location: "Remote — India",
    requirements:
      "SQL and spreadsheets, with the judgement to say when a number looks wrong. " +
      "You will build the monthly sales view, answer questions from the ops team and write short, clear findings.",
    skills: ["SQL", "Data analysis", "Written communication"],
    experience: "1–3 years",
    employmentType: "REMOTE",
  },
];

export type DemoSeedSummary = {
  created: boolean;
  assessmentId?: string;
  versionId?: string;
  markedAttemptId?: string;
  pendingAttemptId?: string;
  shortlistId?: string;
};

/** Three skills the assembler has task templates for, topped up from the library if any is absent. */
async function pickSkills() {
  const preferred = ["excel", "client-communication", "negotiation"];
  const found = await prisma.skill.findMany({
    where: { slug: { in: preferred } },
    select: { id: true, slug: true, name: true },
  });
  const ordered = preferred.flatMap((slug) => found.filter((skill) => skill.slug === slug));

  const filler =
    ordered.length < 3
      ? await prisma.skill.findMany({
          where: { slug: { notIn: ordered.map((skill) => skill.slug) } },
          orderBy: { sortOrder: "asc" },
          take: 3 - ordered.length,
          select: { id: true, slug: true, name: true },
        })
      : [];

  const chosen = [...ordered, ...filler];
  if (chosen.length < 3) {
    throw new Error("The skill library is empty; seed the skills before the demo data.");
  }
  return chosen;
}

function answerKeyOf(privateData: Record<string, unknown>): [string, string | number][] {
  const key = privateData.answerKey;
  if (typeof key !== "object" || key === null) return [];
  return Object.entries(key as Record<string, unknown>).filter(
    (entry): entry is [string, string | number] =>
      typeof entry[1] === "string" || typeof entry[1] === "number",
  );
}

/** A fuller answer for the marked attempt, a thinner one for the attempt left to mark live. */
function answerFor(privateData: Record<string, unknown>, strong: boolean): string {
  const pairs = answerKeyOf(privateData);
  if (pairs.length > 0) {
    const figures = pairs
      .map(([name, value]) => `${name.replace(/_/g, " ")}: ${value}`)
      .join(", ");
    return strong
      ? `From the table, ${figures}. I checked the totals twice and the pattern is consistent across the months.`
      : `The main figure is ${pairs[0][0].replace(/_/g, " ")}: ${pairs[0][1]}.`;
  }
  return strong
    ? "I would name the problem in the first line, give the client the new date and the reason, then close with one concrete next step and who owns it."
    : "I would reply to the client and explain what happened as soon as I could.";
}

/** Creates the demo posts once; a post with the same title and owner is left alone. */
export async function seedDemoPosts(): Promise<{ created: number }> {
  const recruiter = await prisma.user.findFirst({
    where: { email: RECRUITER_EMAIL, isDemo: true, role: "RECRUITER" },
    select: { id: true },
  });
  if (!recruiter) throw new Error(`Demo recruiter ${RECRUITER_EMAIL} is missing; run the seed again.`);

  let created = 0;
  for (const post of DEMO_POSTS) {
    const existing = await prisma.recruiterPost.findFirst({
      where: { recruiterId: recruiter.id, title: post.title },
      select: { id: true },
    });
    if (existing) {
      // Backfill the descriptive fields on posts created before they existed. Status and the
      // recruiter's own edits are left untouched, so a closed post never reopens.
      await prisma.recruiterPost.updateMany({
        where: { id: existing.id, skills: null },
        data: {
          skills: JSON.stringify(post.skills),
          experience: post.experience,
          employmentType: post.employmentType,
        },
      });
      continue;
    }
    // Demo posts are seeded online; a recruiter can close one from the dashboard afterwards.
    await prisma.recruiterPost.create({
      data: {
        recruiterId: recruiter.id,
        ...post,
        skills: JSON.stringify(post.skills),
        status: "OPEN",
      },
    });
    created += 1;
  }
  return { created };
}

async function ensureDemoVersion(recruiterId: string, now: Date) {
  const existing = await prisma.assessment.findFirst({
    where: { ownerId: recruiterId, jobTitle: JOB_TITLE, companyName: COMPANY },
    select: { id: true },
  });
  if (existing) {
    const version = await prisma.assessmentVersion.findFirst({
      where: { assessmentId: existing.id, status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: [{ status: "desc" }, { versionNumber: "desc" }],
      include: {
        assessment: true,
        skills: { include: { skill: { include: { subskills: true } } } },
        tasks: { orderBy: { position: "asc" }, include: { skill: true, rubric: true } },
      },
    });
    if (!version) return null;
    if (version.status === "DRAFT") {
      const issues = publishIssues(version);
      if (issues.length > 0) {
        console.warn("Demo draft was not published:", issues.map((issue) => issue.message).join(" "));
        return null;
      }
      await prisma.assessmentVersion.updateMany({
        where: { id: version.id, status: "DRAFT" },
        data: { status: "PUBLISHED", publishedAt: now },
      });
    }
    return {
      created: false, assessment: existing, version,
      tasks: version.tasks.map((task) => ({ ...task, privateData: JSON.parse(task.privateData) as Record<string, unknown> })),
    };
  }

  const skills = await pickSkills();
  const weights = [40, 30, 30];

  const draft = await generateAssessmentDraft(
    {
      requirementsText: REQUIREMENTS,
      jobTitle: JOB_TITLE,
      companyName: COMPANY,
      description:
        "A practical assessment covering sales data analysis, a client email and a supplier price negotiation.",
      targetLevel: "JUNIOR",
      difficulty: "INTERMEDIATE",
      durationMinutes: 45,
      taskCount: 3,
      aiPolicy: "NOT_ALLOWED",
      targetSkills: skills.map((skill, index) => ({
        skillSlug: skill.slug,
        weight: weights[index] ?? 0,
        subskills: [],
        source: "REQUESTED" as const,
      })),
    },
    // Template mode: no provider and no key, so the demo works offline.
    { prisma, provider: null },
  );

  const assembled = draft.assembled;
  const totalMarks = assembled.tasks.reduce((sum, task) => sum + task.marks, 0);
  if (totalMarks !== 100) {
    throw new Error(`Template generated ${totalMarks} marks; the demo expects 100.`);
  }
  for (const task of assembled.tasks) {
    const rubricMarks = task.rubric.reduce((sum, criterion) => sum + criterion.maxMarks, 0);
    if (rubricMarks !== task.marks) {
      throw new Error(`Template rubric for "${task.title}" totals ${rubricMarks}, not ${task.marks}.`);
    }
  }

  const publishedAt = new Date(now.getTime() - 1000 * 60 * 60 * 24);

  return prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.create({
      data: { ownerId: recruiterId, jobTitle: JOB_TITLE, companyName: COMPANY },
    });

    const version = await tx.assessmentVersion.create({
      data: {
        assessmentId: assessment.id,
        versionNumber: 1,
        status: "PUBLISHED",
        requirementsText: REQUIREMENTS,
        title: assembled.title,
        description: assembled.description,
        jobContext: assembled.jobContext,
        candidateInstructions: assembled.candidateInstructions,
        targetLevel: "JUNIOR",
        difficulty: "INTERMEDIATE",
        durationMinutes: 45,
        aiPolicy: "NOT_ALLOWED",
        generationMethod: draft.generationMethod,
        generationModel: draft.generationModel,
        generatedAt: publishedAt,
        publishedAt,
      },
    });

    for (const [index, skill] of skills.entries()) {
      await tx.assessmentVersionSkill.create({
        data: {
          versionId: version.id,
          skillId: skill.id,
          weight: weights[index] ?? 0,
          source: "REQUESTED",
          selectedSubskills: "[]",
        },
      });
    }

    const tasks: { id: string; privateData: Record<string, unknown>; rubric: { id: string; maxMarks: number; position: number }[] }[] = [];
    for (const [index, task] of assembled.tasks.entries()) {
      const skill = skills.find((candidate) => candidate.slug === task.skillSlug) ?? skills[0];
      const saved = await tx.assessmentTask.create({
        data: {
          versionId: version.id,
          position: index,
          type: task.type,
          skillId: skill.id,
          title: task.title,
          prompt: task.prompt,
          marks: task.marks,
          timeMinutes: task.timeMinutes,
          publicData: JSON.stringify(task.publicData),
          privateData: JSON.stringify(task.privateData),
          rubric: {
            create: task.rubric.map((criterion, position) => ({
              position,
              name: criterion.name,
              description: criterion.description,
              maxMarks: criterion.maxMarks,
              privateGuidance: criterion.privateGuidance,
            })),
          },
        },
        select: {
          id: true,
          privateData: true,
          rubric: { select: { id: true, maxMarks: true, position: true } },
        },
      });
      tasks.push({
        id: saved.id,
        privateData: task.privateData,
        rubric: saved.rubric,
      });
    }

    return { created: true, assessment, version, tasks };
  });

}

export async function seedDemoAssessment(): Promise<DemoSeedSummary> {
  const recruiter = await prisma.user.findFirstOrThrow({ where: { email: RECRUITER_EMAIL, isDemo: true, role: "RECRUITER" } });
  const now = new Date();
  const demo = await ensureDemoVersion(recruiter.id, now);
  if (!demo) return { created: false };

  const specs = [
    { email: MARKED_CANDIDATE_EMAIL, submitted: true, marked: true },
    { email: PENDING_CANDIDATE_EMAIL, submitted: true, marked: false },
    { email: "candidate3@skillgraph.test", submitted: false, marked: false },
  ];
  const [markedAttempt, pendingAttempt] = await prisma.$transaction(async (tx) => {
    const attempts = [];
    for (const spec of specs) {
      const candidate = await tx.user.findFirstOrThrow({ where: { email: spec.email, isDemo: true, role: "CANDIDATE" } });
      const submittedAt = spec.submitted ? new Date(now.getTime() - 60 * 60 * 1000) : null;
      const savedAt = new Date(now.getTime() - 90 * 60 * 1000);
      const tasks = spec.submitted ? demo.tasks : demo.tasks.slice(0, 1);
      const attempt = await tx.assessmentAttempt.upsert({
        where: { versionId_candidateId: { versionId: demo.version.id, candidateId: candidate.id } },
        update: {},
        create: {
          versionId: demo.version.id, candidateId: candidate.id,
          status: spec.submitted ? "SUBMITTED" : "IN_PROGRESS",
          startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          submittedAt, reviewedAt: spec.marked ? submittedAt : null,
          responses: { create: tasks.map((task) => ({ taskId: task.id, answer: answerFor(task.privateData, spec.marked), savedAt })) },
          criterionScores: { create: spec.marked ? tasks.flatMap((task, index) => task.rubric.map((criterion) => ({
            criterionId: criterion.id,
            marks: Math.round(criterion.maxMarks * MARK_SHARES[(index + criterion.position) % MARK_SHARES.length]),
          }))) : [] },
          events: { create: tasks.flatMap((task) => [
            { taskId: task.id, type: "TASK_OPENED", occurredAt: new Date(savedAt.getTime() - 5 * 60 * 1000) },
            { taskId: task.id, type: "ANSWER_SAVED", occurredAt: savedAt },
          ]) },
        },
        select: { id: true, status: true },
      });
      attempts.push(attempt);
    }
    return attempts;
  });

  const shortlist =
    (await prisma.shortlist.findFirst({ where: { ownerId: recruiter.id, name: SHORTLIST_NAME } })) ??
    (await prisma.shortlist.create({ data: { ownerId: recruiter.id, name: SHORTLIST_NAME } }));
  for (const [attempt, note] of [
    [markedAttempt, SHORTLIST_NOTE],
    [pendingAttempt, "Review the response before the interview and ask how the candidate checked their figures."],
  ] as const) {
    if (attempt.status !== "SUBMITTED") continue;
    await prisma.shortlistEntry.upsert({
      where: { shortlistId_attemptId: { shortlistId: shortlist.id, attemptId: attempt.id } },
      update: {}, create: { shortlistId: shortlist.id, attemptId: attempt.id, note },
    });
  }
  return { created: demo.created, assessmentId: demo.assessment.id, versionId: demo.version.id,
    markedAttemptId: markedAttempt.id, pendingAttemptId: pendingAttempt.id, shortlistId: shortlist.id };
}

const PRACTICE_NOTE = "Demo practice: checked my answer against the explanation.";

export async function seedDemoPractice() {
  const samples = [
    { email: MARKED_CANDIDATE_EMAIL, slugs: ["excel", "client-communication"], days: 3 },
    { email: PENDING_CANDIDATE_EMAIL, slugs: ["sql", "excel"], days: 2 },
    { email: "candidate3@skillgraph.test", slugs: ["excel", "client-communication"], days: 1 },
  ];
  const now = new Date();
  const today = dayKey(now);
  for (const sample of samples) {
    await prisma.$transaction(async (tx) => {
      const candidate = await tx.user.findFirstOrThrow({ where: { email: sample.email, role: "CANDIDATE", isDemo: true } });
      const defaults = await tx.skill.findMany({ where: { slug: { in: sample.slugs } }, orderBy: { slug: "asc" } });
      const selected = await tx.candidateSkill.findMany({ where: { userId: candidate.id }, include: { skill: true } });
      if (selected.length === 0 && defaults.length > 0) {
        await tx.candidateSkill.createMany({ data: defaults.map((skill) => ({ userId: candidate.id, skillId: skill.id })) });
      }
      if (candidate.leaderboardOptIn === null) {
        await tx.user.updateMany({ where: { id: candidate.id, isDemo: true, leaderboardOptIn: null }, data: { leaderboardOptIn: true } });
      }
      if (await tx.dailyTask.count({ where: { candidateId: candidate.id, reflection: PRACTICE_NOTE } })) return;
      for (let offset = 1; offset <= sample.days; offset++) {
        const day = shiftDayKey(today, -offset);
        const plans = buildDailyTasks({ candidateId: candidate.id, dateKey: day, skills: selected.length ? selected.map(({ skill }) => skill) : defaults });
        const plan = plans.find((task) => task.points > 0 && task.acceptedAnswers.length > 0);
        if (!plan) continue;
        const answer = plan.acceptedAnswers[0];
        if (!gradeDailyAnswer(plan.questionType, plan.acceptedAnswers, answer)) continue;
        const completedAt = new Date(`${day}T12:00:00`);
        await tx.dailyTask.upsert({
          where: { candidateId_day_position: { candidateId: candidate.id, day, position: plan.position } },
          update: {},
          create: {
            candidateId: candidate.id, skillId: plan.skillId, day, position: plan.position,
            family: plan.family, title: plan.title, scenario: plan.scenario, steps: JSON.stringify(plan.steps),
            estimateMinutes: plan.minutes, difficulty: plan.difficulty, question: plan.question,
            answerKey: JSON.stringify({ type: plan.questionType, accepted: plan.acceptedAnswers, explanation: plan.explanation }),
            points: plan.points, answer, attempts: 1, result: "CORRECT", solved: true,
            earnedPoints: awardPoints(plan.points, 0), status: "DONE", completedAt, reflection: PRACTICE_NOTE,
          },
        });
      }
    });
  }
}
