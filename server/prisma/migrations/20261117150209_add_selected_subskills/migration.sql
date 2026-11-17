-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentVersionSkill" (
    "selectedSubskills" TEXT NOT NULL DEFAULT '[]',
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'REQUESTED',
    CONSTRAINT "AssessmentVersionSkill_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentVersionSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentVersionSkill" ("id", "skillId", "source", "versionId", "weight") SELECT "id", "skillId", "source", "versionId", "weight" FROM "AssessmentVersionSkill";
DROP TABLE "AssessmentVersionSkill";
ALTER TABLE "new_AssessmentVersionSkill" RENAME TO "AssessmentVersionSkill";
CREATE INDEX "AssessmentVersionSkill_skillId_idx" ON "AssessmentVersionSkill"("skillId");
CREATE UNIQUE INDEX "AssessmentVersionSkill_versionId_skillId_key" ON "AssessmentVersionSkill"("versionId", "skillId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
