-- AlterTable
ALTER TABLE "AssessmentAttempt" ADD COLUMN "reviewedAt" DATETIME;

-- CreateTable
CREATE TABLE "AssessmentCriterionScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "marks" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentCriterionScore_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentCriterionScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "AssessmentRubricCriterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentResponse_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AssessmentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentResponse" ("answer", "attemptId", "id", "savedAt", "taskId") SELECT "answer", "attemptId", "id", "savedAt", "taskId" FROM "AssessmentResponse";
DROP TABLE "AssessmentResponse";
ALTER TABLE "new_AssessmentResponse" RENAME TO "AssessmentResponse";
CREATE UNIQUE INDEX "AssessmentResponse_attemptId_taskId_key" ON "AssessmentResponse"("attemptId", "taskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AssessmentCriterionScore_criterionId_idx" ON "AssessmentCriterionScore"("criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentCriterionScore_attemptId_criterionId_key" ON "AssessmentCriterionScore"("attemptId", "criterionId");

