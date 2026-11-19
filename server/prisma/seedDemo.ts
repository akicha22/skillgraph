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
 * Idempotent: the demo assessment is found by owner, job title and company, and the second run
 * skips everything instead of duplicating it.
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

export async function seedDemoAssessment(): Promise<DemoSeedSummary> {
  const recruiter = await prisma.user.findUnique({
    where: { email: RECRUITER_EMAIL },
    select: { id: true },
  });
  if (!recruiter) throw new Error(`Demo recruiter ${RECRUITER_EMAIL} is missing; run the seed again.`);

  const candidates = await prisma.user.findMany({
    where: { email: { in: [MARKED_CANDIDATE_EMAIL, PENDING_CANDIDATE_EMAIL] } },
    select: { id: true, email: true },
  });
  const markedCandidate = candidates.find((user) => user.email === MARKED_CANDIDATE_EMAIL);
  const pendingCandidate = candidates.find((user) => user.email === PENDING_CANDIDATE_EMAIL);
  if (!markedCandidate || !pendingCandidate) {
    throw new Error("The demo candidates are missing; run the seed again.");
  }

  const existing = await prisma.assessment.findFirst({
    where: { ownerId: recruiter.id, jobTitle: JOB_TITLE, companyName: COMPANY },
    select: { id: true },
  });
  if (existing) {
    return { created: false, assessmentId: existing.id };
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

  const now = new Date();
  const publishedAt = new Date(now.getTime() - 1000 * 60 * 60 * 24);

  const created = await prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.create({
      data: { ownerId: recruiter.id, jobTitle: JOB_TITLE, companyName: COMPANY },
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

    return { assessment, version, tasks };
  });

  const submittedAt = new Date(now.getTime() - 1000 * 60 * 60 * 6);

  const pendingAttempt = await prisma.assessmentAttempt.create({
    data: {
      versionId: created.version.id,
      candidateId: pendingCandidate.id,
      status: "SUBMITTED",
      submittedAt: new Date(submittedAt.getTime() + 1000 * 60 * 30),
      responses: {
        create: created.tasks.map((task) => ({
          taskId: task.id,
          answer: answerFor(task.privateData, false),
        })),
      },
    },
    select: { id: true },
  });

  const markedAttempt = await prisma.assessmentAttempt.create({
    data: {
      versionId: created.version.id,
      candidateId: markedCandidate.id,
      status: "SUBMITTED",
      submittedAt,
      reviewedAt: submittedAt,
      responses: {
        create: created.tasks.map((task) => ({
          taskId: task.id,
          answer: answerFor(task.privateData, true),
        })),
      },
    },
    select: { id: true },
  });

  for (const [taskIndex, task] of created.tasks.entries()) {
    for (const criterion of task.rubric) {
      const share = MARK_SHARES[(taskIndex + criterion.position) % MARK_SHARES.length];
      await prisma.assessmentCriterionScore.create({
        data: {
          attemptId: markedAttempt.id,
          criterionId: criterion.id,
          marks: Math.round(criterion.maxMarks * share),
        },
      });
    }
  }

  const shortlist =
    (await prisma.shortlist.findFirst({
      where: { ownerId: recruiter.id, name: SHORTLIST_NAME },
      select: { id: true },
    })) ??
    (await prisma.shortlist.create({
      data: { ownerId: recruiter.id, name: SHORTLIST_NAME },
      select: { id: true },
    }));

  const existingEntry = await prisma.shortlistEntry.findFirst({
    where: { shortlistId: shortlist.id, attemptId: markedAttempt.id },
    select: { id: true },
  });
  if (!existingEntry) {
    await prisma.shortlistEntry.create({
      data: { shortlistId: shortlist.id, attemptId: markedAttempt.id, note: SHORTLIST_NOTE },
    });
  }

  return {
    created: true,
    assessmentId: created.assessment.id,
    versionId: created.version.id,
    markedAttemptId: markedAttempt.id,
    pendingAttemptId: pendingAttempt.id,
    shortlistId: shortlist.id,
  };
}
