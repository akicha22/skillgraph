import type { Request, RequestHandler, Response } from "express";

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  /** Bucket key for this request. */
  key: (req: Request, res: Response) => string;
  /** Injectable clock, used by the unit tests instead of sleeping. */
  now?: () => number;
  /** Tests are bypassed by default; only the limiter's own test sets this. */
  enforceInTest?: boolean;
};

export type RateLimitMiddleware = RequestHandler & { readonly size: number };

type Entry = { count: number; resetAt: number };

/**
 * In-memory fixed-window limiter. State is per-process, which is enough for this single-node app.
 * Expired buckets are pruned on every request so the map cannot grow without bound.
 */
export function rateLimit(options: RateLimitOptions): RateLimitMiddleware {
  const { windowMs, max, key } = options;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();

  const middleware: RequestHandler = (req, res, next) => {
    if (process.env.NODE_ENV === "test" && !options.enforceInTest) {
      next();
      return;
    }

    const current = now();
    for (const [bucket, entry] of entries) {
      if (entry.resetAt <= current) entries.delete(bucket);
    }

    const bucket = key(req, res);
    const entry = entries.get(bucket);

    if (!entry) {
      entries.set(bucket, { count: 1, resetAt: current + windowMs });
      next();
      return;
    }

    if (entry.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - current) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }

    entry.count += 1;
    next();
  };

  Object.defineProperty(middleware, "size", { get: () => entries.size });
  return middleware as RateLimitMiddleware;
}
