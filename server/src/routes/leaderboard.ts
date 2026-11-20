import { Router } from "express";
import { prisma } from "../db";
import { currentUser, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { rankLeaderboard } from "../tasks/scoring";

/**
 * Daily-practice points leaderboard.
 *
 * Only aggregate practice data crosses the role boundary: a name, total points and how many
 * drills were solved. Answers, notes and answers keys stay private to the candidate, and this
 * is separate from formal assessment marks.
 */
export const leaderboardRouter = Router();
leaderboardRouter.use(requireAuth);

leaderboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.dailyTask.groupBy({
      by: ["candidateId"],
      where: { solved: true, earnedPoints: { gt: 0 } },
      _sum: { earnedPoints: true },
      _count: { _all: true },
    });

    const candidates = await prisma.user.findMany({
      where: {
        id: { in: grouped.map((row) => row.candidateId) },
        role: "CANDIDATE",
      },
      select: { id: true, name: true },
    });
    const nameById = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));

    const ranked = rankLeaderboard(
      grouped
        .filter((row) => nameById.has(row.candidateId))
        .map((row) => ({
          candidateId: row.candidateId,
          name: nameById.get(row.candidateId) ?? "Candidate",
          points: row._sum.earnedPoints ?? 0,
          tasksSolved: row._count._all,
        })),
    );

    const user = currentUser(res);
    const mine = ranked.find((row) => row.candidateId === user.id);

    res.json({
      entries: ranked.map((row) => ({
        rank: row.rank,
        name: row.name,
        points: row.points,
        tasksSolved: row.tasksSolved,
        isMe: row.candidateId === user.id,
      })),
      me: mine
        ? {
            name: mine.name,
            points: mine.points,
            tasksSolved: mine.tasksSolved,
            rank: mine.rank,
          }
        : { name: user.name, points: 0, tasksSolved: 0, rank: null },
    });
  }),
);
