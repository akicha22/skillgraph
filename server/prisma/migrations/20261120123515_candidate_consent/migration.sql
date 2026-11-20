-- AlterTable
ALTER TABLE "User" ADD COLUMN "consentAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "consentVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "leaderboardOptIn" BOOLEAN;
