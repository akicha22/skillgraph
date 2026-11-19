import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Shortlists: a recruiter's own list of submitted candidates, each with a private note.
 *
 * Ownership is checked on every query, and an attempt can only be added when it was submitted to
 * an assessment the same recruiter owns. Notes live only here: no candidate route reads them.
 */
export const recruiterShortlistsRouter = Router();
recruiterShortlistsRouter.use(requireAuth, requireRole("RECRUITER"));

// Express 5 types route params as string | string[]; these routes only ever take one value.
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// The owner's shortlist with its entries and just enough of each attempt to show a score.
const shortlistQuery = (shortlistId: string, ownerId: string) =>
  prisma.shortlist.findFirst({
    where: { id: shortlistId, ownerId },
    select: {
      id: true,
      name: true,
      entries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          attemptId: true,
          note: true,
          createdAt: true,
          attempt: {
            select: {
              submittedAt: true,
              reviewedAt: true,
              candidate: { select: { name: true, email: true } },
              criterionScores: { select: { marks: true } },
              version: {
                select: {
                  id: true,
                  title: true,
                  versionNumber: true,
                  assessment: { select: { jobTitle: true, companyName: true } },
                  tasks: { select: { marks: true, rubric: { select: { id: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

type ShortlistRecord = NonNullable<Awaited<ReturnType<typeof shortlistQuery>>>;
type EntryRecord = ShortlistRecord["entries"][number];

/** Marks, coverage and dates for one entry; nothing of the answer or the rubric notes is sent. */
function serializeEntry(entry: EntryRecord) {
  const tasks = entry.attempt.version.tasks;
  return {
    id: entry.id,
    attemptId: entry.attemptId,
    note: entry.note,
    createdAt: entry.createdAt,
    candidate: entry.attempt.candidate,
    assessment: {
      versionId: entry.attempt.version.id,
      title: entry.attempt.version.title,
      versionNumber: entry.attempt.version.versionNumber,
      jobTitle: entry.attempt.version.assessment.jobTitle,
      companyName: entry.attempt.version.assessment.companyName,
    },
    submittedAt: entry.attempt.submittedAt,
    reviewedAt: entry.attempt.reviewedAt,
    awarded: entry.attempt.criterionScores.reduce((sum, score) => sum + score.marks, 0),
    possible: tasks.reduce((sum, task) => sum + task.marks, 0),
    scoredCriteria: entry.attempt.criterionScores.length,
    criterionCount: tasks.reduce((sum, task) => sum + task.rubric.length, 0),
  };
}

function serializeShortlist(shortlist: ShortlistRecord) {
  return {
    id: shortlist.id,
    name: shortlist.name,
    entries: shortlist.entries.map(serializeEntry),
  };
}

// The recruiter's shortlists. `attemptId` is optional and only marks which lists already hold it.
recruiterShortlistsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const attemptId = typeof req.query.attemptId === "string" ? req.query.attemptId : "";
    const shortlists = await prisma.shortlist.findMany({
      where: { ownerId: currentUser(res).id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        _count: { select: { entries: true } },
        // An empty filter value cannot match a real id, so it acts as "none".
        entries: {
          where: { attemptId: attemptId || "__none__" },
          select: { id: true },
        },
      },
    });

    res.json({
      shortlists: shortlists.map((shortlist) => ({
        id: shortlist.id,
        name: shortlist.name,
        entryCount: shortlist._count.entries,
        containsAttempt: shortlist.entries.length > 0,
        updatedAt: shortlist.updatedAt,
      })),
    });
  }),
);

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the shortlist a name")
    .max(80, "Keep the name under 80 characters"),
});

recruiterShortlistsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid shortlist", details: formatZodIssues(parsed.error) });
      return;
    }

    const ownerId = currentUser(res).id;
    const existing = await prisma.shortlist.findFirst({
      where: { ownerId, name: parsed.data.name },
      select: { id: true },
    });
    if (existing) {
      res.status(409).json({ error: "You already have a shortlist with that name" });
      return;
    }

    const created = await prisma.shortlist.create({
      data: { ownerId, name: parsed.data.name },
      select: { id: true, name: true, updatedAt: true },
    });
    res.status(201).json({
      shortlist: { ...created, entryCount: 0, containsAttempt: false },
    });
  }),
);

// One shortlist with its entries: the owning recruiter only.
recruiterShortlistsRouter.get(
  "/:shortlistId",
  asyncHandler(async (req, res) => {
    const shortlist = await shortlistQuery(routeParam(req.params.shortlistId), currentUser(res).id);
    if (!shortlist) {
      res.status(404).json({ error: "Shortlist not found" });
      return;
    }
    res.json(serializeShortlist(shortlist));
  }),
);

const entrySchema = z.object({
  attemptId: z.string().min(1, "Choose a submission"),
  note: z.string().max(2000, "Keep the note under 2000 characters").optional(),
});

recruiterShortlistsRouter.post(
  "/:shortlistId/entries",
  asyncHandler(async (req, res) => {
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid entry", details: formatZodIssues(parsed.error) });
      return;
    }

    const ownerId = currentUser(res).id;
    const shortlistId = routeParam(req.params.shortlistId);
    const shortlist = await prisma.shortlist.findFirst({
      where: { id: shortlistId, ownerId },
      select: { id: true },
    });
    if (!shortlist) {
      res.status(404).json({ error: "Shortlist not found" });
      return;
    }

    // Only a submitted attempt of this recruiter's own assessment may be shortlisted.
    const attempt = await prisma.assessmentAttempt.findFirst({
      where: {
        id: parsed.data.attemptId,
        status: "SUBMITTED",
        version: { assessment: { ownerId } },
      },
      select: { id: true },
    });
    if (!attempt) {
      res.status(404).json({ error: "That submitted attempt was not found" });
      return;
    }

    const alreadyListed = await prisma.shortlistEntry.findFirst({
      where: { shortlistId, attemptId: attempt.id },
      select: { id: true },
    });
    if (alreadyListed) {
      res.status(409).json({ error: "This candidate is already on that shortlist" });
      return;
    }

    await prisma.shortlistEntry.create({
      data: { shortlistId, attemptId: attempt.id, note: parsed.data.note?.trim() ?? "" },
    });
    await prisma.shortlist.update({ where: { id: shortlistId }, data: { updatedAt: new Date() } });

    const updated = await shortlistQuery(shortlistId, ownerId);
    res.status(201).json(serializeShortlist(updated!));
  }),
);

const noteSchema = z.object({
  note: z.string().max(2000, "Keep the note under 2000 characters"),
});

recruiterShortlistsRouter.patch(
  "/:shortlistId/entries/:entryId",
  asyncHandler(async (req, res) => {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid note", details: formatZodIssues(parsed.error) });
      return;
    }

    const ownerId = currentUser(res).id;
    const shortlistId = routeParam(req.params.shortlistId);
    const result = await prisma.shortlistEntry.updateMany({
      where: {
        id: routeParam(req.params.entryId),
        shortlistId,
        shortlist: { ownerId },
      },
      data: { note: parsed.data.note.trim() },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Shortlist entry not found" });
      return;
    }

    const updated = await shortlistQuery(shortlistId, ownerId);
    res.json(serializeShortlist(updated!));
  }),
);

recruiterShortlistsRouter.delete(
  "/:shortlistId/entries/:entryId",
  asyncHandler(async (req, res) => {
    const result = await prisma.shortlistEntry.deleteMany({
      where: {
        id: routeParam(req.params.entryId),
        shortlistId: routeParam(req.params.shortlistId),
        shortlist: { ownerId: currentUser(res).id },
      },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Shortlist entry not found" });
      return;
    }
    res.status(204).end();
  }),
);

recruiterShortlistsRouter.delete(
  "/:shortlistId",
  asyncHandler(async (req, res) => {
    const result = await prisma.shortlist.deleteMany({
      where: { id: routeParam(req.params.shortlistId), ownerId: currentUser(res).id },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Shortlist not found" });
      return;
    }
    res.status(204).end();
  }),
);
