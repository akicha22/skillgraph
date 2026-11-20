import { env } from "./env";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./db";
import { authRouter } from "./routes/auth";
import { candidateGuardRouter, recruiterGuardRouter } from "./routes/guardChecks";
import { errorHandler } from "./middleware/errors";
import { securityHeaders } from "./middleware/securityHeaders";
import { skillsRouter } from "./routes/skills";
import { candidateSkillsRouter } from "./routes/candidateSkills";
import { recruiterAssessmentsRouter } from "./routes/recruiterAssessments";
import { candidateAssessmentsRouter } from "./routes/candidateAssessments";
import { candidateAttemptsRouter } from "./routes/candidateAttempts";
import { recruiterAttemptsRouter } from "./routes/recruiterAttempts";
import { recruiterShortlistsRouter } from "./routes/recruiterShortlists";
import { candidatePostsRouter, recruiterPostsRouter } from "./routes/posts";
import { candidateTasksRouter } from "./routes/candidateTasks";
import { candidateProfileRouter } from "./routes/candidateProfile";
import { leaderboardRouter } from "./routes/leaderboard";
import { locationsRouter } from "./routes/locations";

/**
 * The HTTP app with no listener attached: index.ts serves it, and the permission tests mount it on
 * an ephemeral port so the real middleware and routers are exercised.
 */
export const app = express();
app.disable("x-powered-by");
if (env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(securityHeaders);

const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok", database: "connected" });
});

app.use("/api/auth", authRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/candidate/skills", candidateSkillsRouter);
app.use("/api/candidate/assessments", candidateAssessmentsRouter);
app.use("/api/candidate/attempts", candidateAttemptsRouter);
app.use("/api/candidate/posts", candidatePostsRouter);
app.use("/api/candidate/tasks", candidateTasksRouter);
app.use("/api/candidate/profile", candidateProfileRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/candidate", candidateGuardRouter);
app.use("/api/recruiter/assessments", recruiterAssessmentsRouter);
app.use("/api/recruiter/attempts", recruiterAttemptsRouter);
app.use("/api/recruiter/shortlists", recruiterShortlistsRouter);
app.use("/api/recruiter/posts", recruiterPostsRouter);
app.use("/api/recruiter", recruiterGuardRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use(errorHandler);
