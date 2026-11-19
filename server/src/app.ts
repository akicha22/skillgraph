import "./env";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./db";
import { authRouter } from "./routes/auth";
import { candidateGuardRouter, recruiterGuardRouter } from "./routes/guardChecks";
import { errorHandler } from "./middleware/errors";
import { skillsRouter } from "./routes/skills";
import { candidateSkillsRouter } from "./routes/candidateSkills";
import { recruiterAssessmentsRouter } from "./routes/recruiterAssessments";
import { candidateAssessmentsRouter } from "./routes/candidateAssessments";
import { candidateAttemptsRouter } from "./routes/candidateAttempts";
import { recruiterAttemptsRouter } from "./routes/recruiterAttempts";
import { recruiterShortlistsRouter } from "./routes/recruiterShortlists";

/**
 * The HTTP app with no listener attached: index.ts serves it, and the permission tests mount it on
 * an ephemeral port so the real middleware and routers are exercised.
 */
export const app = express();
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  const users = await prisma.user.count();
  res.json({
    status: "ok",
    database: "connected",
    users,
    aiProvider: process.env.AI_PROVIDER ?? "template",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/candidate/skills", candidateSkillsRouter);
app.use("/api/candidate/assessments", candidateAssessmentsRouter);
app.use("/api/candidate/attempts", candidateAttemptsRouter);
app.use("/api/candidate", candidateGuardRouter);
app.use("/api/recruiter/assessments", recruiterAssessmentsRouter);
app.use("/api/recruiter/attempts", recruiterAttemptsRouter);
app.use("/api/recruiter/shortlists", recruiterShortlistsRouter);
app.use("/api/recruiter", recruiterGuardRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use(errorHandler);
