import type { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../db";
import { COOKIE_NAME, verifySessionToken } from "../auth/session";
import { publicUserSelect, toPublicUser, type PublicUser } from "../auth/user";
import type { Role } from "../auth/roles";

export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    const session = token ? verifySessionToken(token) : null;
    if (!session) {
      res.status(401).json({ error: "Please sign in to continue" });
      return;
    }

    // Role always comes from the database, never from the token.
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: publicUserSelect,
    });
    if (!user) {
      res.status(401).json({ error: "Please sign in to continue" });
      return;
    }

    res.locals.user = toPublicUser(user);
    next();
  } catch (err) {
    next(err);
  }
};

export function requireRole(...allowed: Role[]): RequestHandler {
  return (_req, res, next) => {
    const user = res.locals.user as PublicUser | undefined;
    if (!user) {
      res.status(401).json({ error: "Please sign in to continue" });
      return;
    }
    if (!allowed.includes(user.role)) {
      res.status(403).json({ error: "You don't have permission to do that" });
      return;
    }
    next();
  };
}

export function currentUser(res: Response): PublicUser {
  return res.locals.user as PublicUser;
}