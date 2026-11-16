import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { parseRequirements, warnOnUnknownSlugs } from "../assessments/requirementParser";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const recruiterAssessmentsRouter = Router();
recruiterAssessmentsRouter.use(requireAuth, requireRole("RECRUITER"));

const parseSchema = z.object({
  text: z
    .string()
    .trim()
    .min(10, "Describe the candidate you're looking for in a sentence or two")
    .max(3000, "Please keep the description under 3000 characters"),
});

recruiterAssessmentsRouter.post(
  "/parse-requirements",
  asyncHandler(async (req, res) => {
    const parsed = parseSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: formatZodIssues(parsed.error) });
      return;
    }

    const library = await prisma.skill.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { sortOrder: "asc" },
    });
    warnOnUnknownSlugs(library.map((s) => s.slug));

    res.json(parseRequirements(parsed.data.text, library));
  }),
);