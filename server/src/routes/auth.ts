import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../auth/password";
import { clearSessionCookie, setSessionCookie } from "../auth/session";
import { formatZodIssues, loginSchema, registerSchema } from "../auth/schemas";
import { publicUserSelect, toPublicUser } from "../auth/user";
import { currentUser, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Please check the highlighted fields",
        details: formatZodIssues(parsed.error),
      });
      return;
    }
    const { name, email, password, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    try {
      const user = await prisma.user.create({
        data: { name, email, role, passwordHash: await hashPassword(password) },
        select: publicUserSelect,
      });
      setSessionCookie(res, user.id);
      res.status(201).json({ user: toPublicUser(user) });
    } catch (err) {
      // Two sign-ups with the same email at the same moment
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: "An account with this email already exists" });
        return;
      }
      throw err;
    }
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a valid email and password" });
      return;
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    setSessionCookie(res, user.id);
    res.json({ user: toPublicUser(user) });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (_req, res) => {
  res.json({ user: currentUser(res) });
});