-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "family" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "estimateMinutes" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'BEGINNER',
    "question" TEXT NOT NULL DEFAULT '',
    "answerKey" TEXT NOT NULL DEFAULT '{}',
    "answer" TEXT NOT NULL DEFAULT '',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL DEFAULT 0,
    "earnedPoints" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reflection" TEXT NOT NULL DEFAULT '',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyTask_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyTask" ("candidateId", "completedAt", "createdAt", "day", "estimateMinutes", "family", "id", "position", "reflection", "scenario", "skillId", "status", "steps", "title", "updatedAt") SELECT "candidateId", "completedAt", "createdAt", "day", "estimateMinutes", "family", "id", "position", "reflection", "scenario", "skillId", "status", "steps", "title", "updatedAt" FROM "DailyTask";
DROP TABLE "DailyTask";
ALTER TABLE "new_DailyTask" RENAME TO "DailyTask";
CREATE INDEX "DailyTask_candidateId_day_idx" ON "DailyTask"("candidateId", "day");
CREATE INDEX "DailyTask_candidateId_earnedPoints_idx" ON "DailyTask"("candidateId", "earnedPoints");
CREATE INDEX "DailyTask_skillId_idx" ON "DailyTask"("skillId");
CREATE UNIQUE INDEX "DailyTask_candidateId_day_position_key" ON "DailyTask"("candidateId", "day", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
