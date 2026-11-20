import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { verifyPassword } from "../auth/password";
import { clearSessionCookie } from "../auth/session";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * The candidate's own profile: who they are, what they say they can do, and what their assessment
 * history actually shows. Practice tasks are read from /api/candidate/tasks and never appear here
 * as a score, because practice is not marked.
 */
export const candidateProfileRouter = Router();
candidateProfileRouter.use(requireAuth, requireRole("CANDIDATE"));

// Absent stays absent so a partial edit never clears the fields it does not mention;
// an explicitly empty string clears the field.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined ? undefined : value.length > 0 ? value : null));

const profileSchema = z
  .object({
    headline: optionalText(100),
    location: optionalText(80),
    about: optionalText(600),
    yearsExperience: z
      .number()
      .int("Experience must be a whole number of years")
      .min(0)
      .max(50)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Send at least one field" });

const consentSchema = z.object({ version: z.literal("v1") });
const leaderboardSchema = z.object({ optIn: z.boolean() });
const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password").max(72),
});

candidateProfileRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const candidateId = currentUser(res).id;

    const [user, skillRows, versions, attempts] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: candidateId },
        select: {
          name: true,
          email: true,
          headline: true,
          location: true,
          about: true,
          yearsExperience: true,
          consentVersion: true,
          consentAt: true,
          leaderboardOptIn: true,
          isDemo: true,
          createdAt: true,
        },
      }),
      prisma.candidateSkill.findMany({
        where: { userId: candidateId },
        orderBy: { createdAt: "asc" },
        select: { skill: { select: { id: true, name: true, domain: { select: { name: true } } } } },
      }),
      prisma.assessmentVersion.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, tasks: { select: { marks: true } } },
      }),
      prisma.assessmentAttempt.findMany({
        where: { candidateId },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          criterionScores: { select: { marks: true } },
          version: {
            select: {
              id: true,
              title: true,
              assessment: { select: { companyName: true, jobTitle: true } },
              tasks: { select: { marks: true } },
            },
          },
        },
      }),
    ]);

    const attemptByVersion = new Map(attempts.map((attempt) => [attempt.version.id, attempt]));
    const inProgress = attempts.filter((attempt) => attempt.status === "IN_PROGRESS").length;
    const submitted = attempts.filter((attempt) => attempt.status === "SUBMITTED");
    const marked = submitted.filter((attempt) => attempt.reviewedAt !== null).length;

    const scored = submitted.filter((attempt) => attempt.criterionScores.length > 0);
    const averagePercent =
      scored.length === 0
        ? null
        : Math.round(
            (scored.reduce((sum, attempt) => {
              const possible = attempt.version.tasks.reduce((total, task) => total + task.marks, 0);
              const awarded = attempt.criterionScores.reduce((total, score) => total + score.marks, 0);
              return sum + (possible > 0 ? (awarded / possible) * 100 : 0);
            }, 0) /
              scored.length) *
              10,
          ) / 10;

    res.json({
      profile: {
        name: user.name,
        email: user.email,
        headline: user.headline,
        location: user.location,
        about: user.about,
        yearsExperience: user.yearsExperience,
        consentVersion: user.consentVersion,
        consentAt: user.consentAt,
        leaderboardOptIn: user.leaderboardOptIn,
        isDemo: user.isDemo,
        memberSince: user.createdAt,
      },
      skills: skillRows.map((row) => ({
        id: row.skill.id,
        name: row.skill.name,
        domain: row.skill.domain.name,
      })),
      stats: {
        available: versions.filter((version) => !attemptByVersion.has(version.id)).length,
        inProgress,
        submitted: submitted.length,
        marked,
        awaitingMarks: submitted.length - marked,
        averagePercent,
      },
      results: submitted.slice(0, 6).map((attempt) => {
        const possible = attempt.version.tasks.reduce((total, task) => total + task.marks, 0);
        const awarded = attempt.criterionScores.reduce((total, score) => total + score.marks, 0);
        return {
          attemptId: attempt.id,
          versionId: attempt.version.id,
          title: attempt.version.title,
          companyName: attempt.version.assessment.companyName,
          jobTitle: attempt.version.assessment.jobTitle,
          submittedAt: attempt.submittedAt,
          reviewedAt: attempt.reviewedAt,
          awarded,
          possible,
          scoredCriteria: attempt.criterionScores.length,
        };
      }),
    });
  }),
);

// Records the candidate's acceptance of the current consent text.
candidateProfileRouter.post(
  "/consent",
  asyncHandler(async (req, res) => {
    const parsed = consentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid consent", details: formatZodIssues(parsed.error) });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: currentUser(res).id },
      data: { consentVersion: parsed.data.version, consentAt: new Date() },
      select: { consentVersion: true, consentAt: true },
    });

    res.json({ consentVersion: updated.consentVersion, consentAt: updated.consentAt });
  }),
);

// Controls whether the candidate appears in the public practice leaderboard.
candidateProfileRouter.put(
  "/leaderboard",
  asyncHandler(async (req, res) => {
    const parsed = leaderboardSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid leaderboard setting", details: formatZodIssues(parsed.error) });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: currentUser(res).id },
      data: { leaderboardOptIn: parsed.data.optIn },
      select: { leaderboardOptIn: true },
    });

    res.json({ leaderboardOptIn: updated.leaderboardOptIn });
  }),
);

// Only the caller's own profile; the role is never editable, so it cannot be escalated.
candidateProfileRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid profile", details: formatZodIssues(parsed.error) });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: currentUser(res).id },
      data: parsed.data,
      select: {
        name: true,
        email: true,
        headline: true,
        location: true,
        about: true,
        yearsExperience: true,
        isDemo: true,
        createdAt: true,
      },
    });

    res.json({
      profile: {
        name: updated.name,
        email: updated.email,
        headline: updated.headline,
        location: updated.location,
        about: updated.about,
        yearsExperience: updated.yearsExperience,
        isDemo: updated.isDemo,
        memberSince: updated.createdAt,
      },
    });
  }),
);

// Deletes the candidate's own account after re-checking their password. Every candidate-owned
// relation cascades; audit rows keep their history with the actor set to null.
candidateProfileRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: formatZodIssues(parsed.error) });
      return;
    }

    const userId = currentUser(res).id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) {
      res.status(401).json({ error: "Please sign in to continue" });
      return;
    }
    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }

    await prisma.user.delete({ where: { id: userId } });
    clearSessionCookie(res);
    res.status(204).end();
  }),
);
