-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assessment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssessmentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
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

-- CreateTable
CREATE TABLE "AssessmentVersionSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'REQUESTED',
    CONSTRAINT "AssessmentVersionSkill_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentVersionSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssessmentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "marks" INTEGER NOT NULL,
    "timeMinutes" INTEGER NOT NULL,
    "publicData" TEXT NOT NULL DEFAULT '{}',
    "privateData" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "AssessmentTask_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentTask_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssessmentRubricCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "privateGuidance" TEXT NOT NULL,
    CONSTRAINT "AssessmentRubricCriterion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AssessmentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Assessment_ownerId_idx" ON "Assessment"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVersion_assessmentId_versionNumber_key" ON "AssessmentVersion"("assessmentId", "versionNumber");

-- CreateIndex
CREATE INDEX "AssessmentVersionSkill_skillId_idx" ON "AssessmentVersionSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVersionSkill_versionId_skillId_key" ON "AssessmentVersionSkill"("versionId", "skillId");

-- CreateIndex
CREATE INDEX "AssessmentTask_skillId_idx" ON "AssessmentTask"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentTask_versionId_position_key" ON "AssessmentTask"("versionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentRubricCriterion_taskId_position_key" ON "AssessmentRubricCriterion"("taskId", "position");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
