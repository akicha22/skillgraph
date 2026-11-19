-- CreateTable
CREATE TABLE "Shortlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shortlist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShortlistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shortlistId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShortlistEntry_shortlistId_fkey" FOREIGN KEY ("shortlistId") REFERENCES "Shortlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShortlistEntry_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Shortlist_ownerId_idx" ON "Shortlist"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Shortlist_ownerId_name_key" ON "Shortlist"("ownerId", "name");

-- CreateIndex
CREATE INDEX "ShortlistEntry_attemptId_idx" ON "ShortlistEntry"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortlistEntry_shortlistId_attemptId_key" ON "ShortlistEntry"("shortlistId", "attemptId");
