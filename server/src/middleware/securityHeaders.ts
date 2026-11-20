import type { RequestHandler } from "express";

/** Small, dependency-free baseline headers that do not interfere with the SPA or the API. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
};
