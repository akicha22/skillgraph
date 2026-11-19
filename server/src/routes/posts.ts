import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Requirements posts: a recruiter says what they are hiring for, and candidates read the open ones.
 *
 * A post is a hiring need, not an assessment. It carries no rubric, marks or private data, and it is
 * managed in its own section of the recruiter dashboard rather than beside assessment drafts.
 */
export const recruiterPostsRouter = Router();
recruiterPostsRouter.use(requireAuth, requireRole("RECRUITER"));

export const candidatePostsRouter = Router();
candidatePostsRouter.use(requireAuth, requireRole("CANDIDATE"));

// Express 5 types route params as string | string[]; these routes only ever take one value.
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "REMOTE"] as const;

const postFields = {
  title: z.string().trim().min(3, "Give the post a title").max(100),
  companyName: z.string().trim().min(2, "Add the company name").max(80),
  location: z.string().trim().max(80).optional(),
  requirements: z
    .string()
    .trim()
    .min(20, "Describe the role in at least one sentence")
    .max(2000, "Keep the description under 2000 characters"),
  skills: z
    .array(z.string().trim().min(1).max(60))
    .max(12, "List at most 12 skills")
    .optional(),
  experience: z.string().trim().max(60).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
};

const postSchema = z.object(postFields);
const postUpdateSchema = z
  .object({ ...postFields, status: z.enum(["OPEN", "CLOSED"]).optional() })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Send at least one field" });

const postSelect = {
  id: true,
  title: true,
  companyName: true,
  location: true,
  requirements: true,
  skills: true,
  experience: true,
  employmentType: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

type PostRow = {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  requirements: string;
  skills: string | null;
  experience: string | null;
  employmentType: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Skills are stored as JSON text; the API always speaks arrays. */
function parseSkills(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((row): row is string => typeof row === "string") : [];
  } catch {
    return [];
  }
}

function serializePost(post: PostRow) {
  return {
    id: post.id,
    title: post.title,
    companyName: post.companyName,
    location: post.location,
    requirements: post.requirements,
    skills: parseSkills(post.skills),
    experience: post.experience,
    employmentType: post.employmentType,
    status: post.status,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function normalizeSkills(skills: string[] | undefined): string | null {
  if (!skills) return null;
  const cleaned = [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))];
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

/** Empty optional text becomes null so the database and the UI both read "not set". */
function optionalText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// A recruiter's own posts, newest first.
recruiterPostsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const posts = await prisma.recruiterPost.findMany({
      where: { recruiterId: currentUser(res).id },
      orderBy: { createdAt: "desc" },
      select: postSelect,
    });
    res.json({ posts: posts.map(serializePost) });
  }),
);

recruiterPostsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid post", details: formatZodIssues(parsed.error) });
      return;
    }

    const post = await prisma.recruiterPost.create({
      data: {
        recruiterId: currentUser(res).id,
        title: parsed.data.title,
        companyName: parsed.data.companyName,
        location: optionalText(parsed.data.location) ?? null,
        requirements: parsed.data.requirements,
        skills: normalizeSkills(parsed.data.skills),
        experience: optionalText(parsed.data.experience) ?? null,
        employmentType: parsed.data.employmentType ?? null,
        // Published posts start online; only the recruiter's own status change takes one down.
        status: "OPEN",
      },
      select: postSelect,
    });
    res.status(201).json({ post: serializePost(post) });
  }),
);

// Edits a post, including closing or reopening it. A closed post disappears from the candidate feed
// without being deleted, so its history and any links to it stay intact.
recruiterPostsRouter.patch(
  "/:postId",
  asyncHandler(async (req, res) => {
    const parsed = postUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid post update", details: formatZodIssues(parsed.error) });
      return;
    }

    const ownerId = currentUser(res).id;
    const postId = routeParam(req.params.postId);
    const data = parsed.data;

    const updated = await prisma.recruiterPost.updateMany({
      where: { id: postId, recruiterId: ownerId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.location !== undefined ? { location: optionalText(data.location) } : {}),
        ...(data.requirements !== undefined ? { requirements: data.requirements } : {}),
        ...(data.skills !== undefined ? { skills: normalizeSkills(data.skills) } : {}),
        ...(data.experience !== undefined ? { experience: optionalText(data.experience) } : {}),
        ...(data.employmentType !== undefined ? { employmentType: data.employmentType } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });
    if (updated.count === 0) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    const post = await prisma.recruiterPost.findFirst({
      where: { id: postId, recruiterId: ownerId },
      select: postSelect,
    });
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.json({ post: serializePost(post) });
  }),
);

recruiterPostsRouter.delete(
  "/:postId",
  asyncHandler(async (req, res) => {
    const result = await prisma.recruiterPost.deleteMany({
      where: { id: routeParam(req.params.postId), recruiterId: currentUser(res).id },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.status(204).end();
  }),
);

// Every open post from every recruiter, with who posted it. A closed post is deliberately absent:
// candidates should not be able to open a role that is no longer hiring.
candidatePostsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const posts = await prisma.recruiterPost.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { ...postSelect, recruiter: { select: { name: true } } },
    });
    res.json({
      posts: posts.map((post) => ({
        ...serializePost(post),
        recruiterName: post.recruiter.name,
      })),
    });
  }),
);
