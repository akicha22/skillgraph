-- AlterTable
ALTER TABLE "RecruiterPost" ADD COLUMN "employmentType" TEXT;
ALTER TABLE "RecruiterPost" ADD COLUMN "experience" TEXT;
ALTER TABLE "RecruiterPost" ADD COLUMN "skills" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "about" TEXT;
ALTER TABLE "User" ADD COLUMN "headline" TEXT;
ALTER TABLE "User" ADD COLUMN "location" TEXT;
ALTER TABLE "User" ADD COLUMN "yearsExperience" INTEGER;

-- CreateTable
CREATE TABLE "AttemptFollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttemptFollowUp_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyTask" (
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
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reflection" TEXT NOT NULL DEFAULT '',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyTask_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AttemptFollowUp_attemptId_idx" ON "AttemptFollowUp"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptFollowUp_attemptId_criterionId_key" ON "AttemptFollowUp"("attemptId", "criterionId");

-- CreateIndex
CREATE INDEX "DailyTask_candidateId_day_idx" ON "DailyTask"("candidateId", "day");

-- CreateIndex
CREATE INDEX "DailyTask_skillId_idx" ON "DailyTask"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_candidateId_day_position_key" ON "DailyTask"("candidateId", "day", "position");
