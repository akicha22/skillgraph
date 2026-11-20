/**
 * Point allocation and ranking for daily practice.
 *
 * The rules are deliberately small and easy to state in the UI:
 * - a first-attempt correct answer earns the task's full points;
 * - a correct answer after one or more wrong attempts earns half (rounded down), never zero;
 * - a wrong answer earns nothing, and re-submitting a solved task never pays again.
 */

export type LeaderboardEntry = {
  candidateId: string;
  name: string;
  points: number;
  tasksSolved: number;
};

export type RankedLeaderboardEntry = LeaderboardEntry & { rank: number };

/** Points for a correct submission, given how many attempts preceded it. */
export function awardPoints(potential: number, attemptsBefore: number): number {
  if (potential <= 0) return 0;
  if (attemptsBefore <= 0) return potential;
  return Math.max(1, Math.floor(potential / 2));
}

/**
 * Ranks by total points. Equal points share a rank (1, 2, 2, 4); tasks solved and then name
 * only keep the display order stable.
 */
export function rankLeaderboard(entries: LeaderboardEntry[]): RankedLeaderboardEntry[] {
  const sorted = [...entries].sort(
    (a, b) =>
      b.points - a.points ||
      b.tasksSolved - a.tasksSolved ||
      a.name.localeCompare(b.name),
  );

  let previousPoints: number | null = null;
  let currentRank = 0;

  return sorted.map((entry, index) => {
    if (entry.points !== previousPoints) {
      currentRank = index + 1;
      previousPoints = entry.points;
    }
    return { ...entry, rank: currentRank };
  });
}
