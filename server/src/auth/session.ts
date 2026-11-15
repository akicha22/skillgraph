import jwt from "jsonwebtoken";
import type { CookieOptions, Response } from "express";
import { env } from "../env";

export const COOKIE_NAME = "sg_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 days

const baseCookie: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
};

export function signSessionToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: SESSION_SECONDS,
  });
}

export function verifySessionToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || !payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, userId: string): void {
  res.cookie(COOKIE_NAME, signSessionToken(userId), {
    ...baseCookie,
    maxAge: SESSION_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, baseCookie);
}