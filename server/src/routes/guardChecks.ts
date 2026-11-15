import { Router } from "express";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";

export const candidateGuardRouter = Router();
candidateGuardRouter.use(requireAuth, requireRole("CANDIDATE"));
candidateGuardRouter.get("/ping", (_req, res) => {
  res.json({ message: `Candidate-only endpoint: welcome, ${currentUser(res).name}` });
});

export const recruiterGuardRouter = Router();
recruiterGuardRouter.use(requireAuth, requireRole("RECRUITER"));
recruiterGuardRouter.get("/ping", (_req, res) => {
  res.json({ message: `Recruiter-only endpoint: welcome, ${currentUser(res).name}` });
});