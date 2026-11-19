-- CreateTable
CREATE TABLE "ComparisonWeights" (
    "versionId" TEXT NOT NULL PRIMARY KEY,
    "weights" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComparisonWeights_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
