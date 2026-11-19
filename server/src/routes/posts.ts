import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Requirements posts: a recruiter says what they are hiring for, and candidates read the open ones
 * on their dashboard. Posts are not assessments — they carry no rubric, marks or private data.
 */
export const recruiterPostsRouter = Router();
recruiterPostsRouter.use(requireAuth, requireRole("RECRUITER"));

export const candidatePostsRouter = Router();
candidatePostsRouter.use(requireAuth, requireRole("CANDIDATE"));

// Express 5 types route params as string | string[]; these routes only ever take one value.
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const postSchema = z.object({
  title: z.string().trim().min(3, "Give the post a title").max(100),
  companyName: z.string().trim().min(2, "Add the company name").max(80),
  location: z.string().trim().max(80).optional(),
  requirements: z
    .string()
    .trim()
    .min(20, "Describe the role in at least one sentence")
    .max(2000, "Keep the description under 2000 characters"),
});

// A recruiter's own posts, newest first.
recruiterPostsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const posts = await prisma.recruiterPost.findMany({
      where: { recruiterId: currentUser(res).id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        companyName: true,
        location: true,
        requirements: true,
        status: true,
        createdAt: true,
      },
    });
    res.json({ posts });
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
        location: parsed.data.location?.trim() ? parsed.data.location.trim() : null,
        requirements: parsed.data.requirements,
      },
      select: {
        id: true,
        title: true,
        companyName: true,
        location: true,
        requirements: true,
        status: true,
        createdAt: true,
      },
    });
    res.status(201).json({ post });
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

// Every open post from every recruiter, with who posted it.
candidatePostsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const posts = await prisma.recruiterPost.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        companyName: true,
        location: true,
        requirements: true,
        createdAt: true,
        recruiter: { select: { name: true } },
      },
    });
    res.json({
      posts: posts.map((post) => ({
        id: post.id,
        title: post.title,
        companyName: post.companyName,
        location: post.location,
        requirements: post.requirements,
        recruiterName: post.recruiter.name,
        createdAt: post.createdAt,
      })),
    });
  }),
);
