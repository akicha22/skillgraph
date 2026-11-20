import dotenv from "dotenv";
import { z } from "zod";

// Local runs must use this project's .env. A shell or machine environment can carry stale
// values — an empty DATABASE_URL target or PORT=0 — that otherwise shadow the project config and
// make every existing account look missing. Tests set their own throwaway database before the app
// loads, so they are excluded from the override.
const injectedEnvironment = process.env.NODE_ENV;
dotenv.config({ override: injectedEnvironment !== "test" && injectedEnvironment !== "production" });

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().trim().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  NODE_ENV: z.string().default("development"),
  // AI is optional. "template" (the default) needs no key and is never labelled AI.
  AI_PROVIDER: z.string().trim().toLowerCase().default("template"),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z.string().trim().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;