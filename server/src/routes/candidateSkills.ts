import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const candidateSkillsRouter = Router();
candidateSkillsRouter.use(requireAuth, requireRole("CANDIDATE"));

const MAX_SKILLS = 60;
const putSchema = z.object({
  skillIds: z.array(z.string().min(1)).max(MAX_SKILLS, `Choose at most ${MAX_SKILLS} skills`),
});

async function currentSkillIds(userId: string): Promise<string[]> {
  const rows = await prisma.candidateSkill.findMany({
    where: { userId },
    select: { skillId: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.skillId);
}

candidateSkillsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ skillIds: await currentSkillIds(currentUser(res).id) });
  }),
);

// Replaces the candidate's whole self-declared skill set with the submitted list.
candidateSkillsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid skill list", details: formatZodIssues(parsed.error) });
      return;
    }

    const userId = currentUser(res).id;
    const skillIds = [...new Set(parsed.data.skillIds)];

    const found = await prisma.skill.count({ where: { id: { in: skillIds } } });
    if (found !== skillIds.length) {
      res.status(400).json({ error: "One or more selected skills do not exist" });
      return;
    }

    await prisma.$transaction([
      prisma.candidateSkill.deleteMany({ where: { userId } }),
      prisma.candidateSkill.createMany({ data: skillIds.map((skillId) => ({ userId, skillId })) }),
    ]);

    res.json({ skillIds: await currentSkillIds(userId) });
  }),
);