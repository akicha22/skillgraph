-- AlterTable
ALTER TABLE "AssessmentTask" ADD COLUMN "dayNumber" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "format" TEXT NOT NULL DEFAULT 'EXAM',
    "requirementsText" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "jobContext" TEXT NOT NULL,
    "candidateInstructions" TEXT NOT NULL,
    "targetLevel" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "aiPolicy" TEXT NOT NULL DEFAULT 'NOT_ALLOWED',
    "generationMethod" TEXT NOT NULL,
    "generationModel" TEXT,
    "generatedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssessmentVersion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentVersion" ("aiPolicy", "assessmentId", "candidateInstructions", "createdAt", "description", "difficulty", "durationMinutes", "generatedAt", "generationMethod", "generationModel", "id", "jobContext", "publishedAt", "requirementsText", "status", "targetLevel", "title", "updatedAt", "versionNumber") SELECT "aiPolicy", "assessmentId", "candidateInstructions", "createdAt", "description", "difficulty", "durationMinutes", "generatedAt", "generationMethod", "generationModel", "id", "jobContext", "publishedAt", "requirementsText", "status", "targetLevel", "title", "updatedAt", "versionNumber" FROM "AssessmentVersion";
DROP TABLE "AssessmentVersion";
ALTER TABLE "new_AssessmentVersion" RENAME TO "AssessmentVersion";
CREATE UNIQUE INDEX "AssessmentVersion_assessmentId_versionNumber_key" ON "AssessmentVersion"("assessmentId", "versionNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
