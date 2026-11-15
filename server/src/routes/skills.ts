import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { parseAssessmentTypes } from "../skills/assessmentTypes";
import { asyncHandler } from "../utils/asyncHandler";

export const skillsRouter = Router();
skillsRouter.use(requireAuth);

skillsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const domains = await prisma.skillDomain.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        skills: {
          orderBy: { sortOrder: "asc" },
          include: { subskills: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    res.json({
      domains: domains.map((d) => ({
        id: d.id,
        slug: d.slug,
        name: d.name,
        description: d.description,
        skills: d.skills.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          description: s.description,
          assessmentTypes: parseAssessmentTypes(s.assessmentTypes),
          subskills: s.subskills.map((ss) => ({ id: ss.id, slug: ss.slug, name: ss.name })),
        })),
      })),
    });
  }),
);