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
      select: { id: true, name: true, leaderboardOptIn: true },
    });
    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    const rows = grouped.flatMap((row) => {
      const candidate = candidateById.get(row.candidateId);
      if (!candidate) return [];
      return [
        {
          candidateId: row.candidateId,
          name: candidate.name,
          points: row._sum.earnedPoints ?? 0,
          tasksSolved: row._count._all,
          optedIn: candidate.leaderboardOptIn === true,
        },
      ];
    });

    // Rank only opted-in candidates, so hidden candidates leave no gaps in the public ranks.
    const ranked = rankLeaderboard(
      rows
        .filter((row) => row.optedIn)
        .map(({ candidateId, name, points, tasksSolved }) => ({
          candidateId,
          name,
          points,
          tasksSolved,
        })),
    );

    const user = currentUser(res);
    const mine = rows.find((row) => row.candidateId === user.id);
    const myRanked = ranked.find((row) => row.candidateId === user.id);

    res.json({
      entries: ranked.map((row) => ({
        rank: row.rank,
        name: row.name,
        points: row.points,
        tasksSolved: row.tasksSolved,
        isMe: row.candidateId === user.id,
      })),
      me: myRanked
        ? {
            name: myRanked.name,
            points: myRanked.points,
            tasksSolved: myRanked.tasksSolved,
            rank: myRanked.rank,
          }
        : {
            name: mine?.name ?? user.name,
            points: mine?.points ?? 0,
            tasksSolved: mine?.tasksSolved ?? 0,
            rank: null,
          },
    });
  }),
);
