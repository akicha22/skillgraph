import "./env";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./db";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth";
import { candidateGuardRouter, recruiterGuardRouter } from "./routes/guardChecks";
import { errorHandler } from "./middleware/errors";

const app = express();
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

const port = Number(process.env.PORT ?? 4000);

app.use("/api/auth", authRouter);
app.use("/api/candidate", candidateGuardRouter);
app.use("/api/recruiter", recruiterGuardRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use(errorHandler);

app.listen(port, () => console.log(`API running on http://localhost:${port}`));