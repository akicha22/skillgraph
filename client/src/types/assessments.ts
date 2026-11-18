/** Types for the recruiter assessment API (generation, draft preview, versions). */

export type AssessmentLevel = "INTERN" | "FRESHER" | "JUNIOR" | "MID" | "SENIOR";
export type AssessmentDifficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type AiPolicy = "NOT_ALLOWED" | "ALLOWED_DISCLOSED";
export type GenerationMethod = "TEMPLATE" | "AI" | "MANUAL";
export type VersionStatus = "DRAFT" | "PUBLISHED";

export const METHOD_LABELS: Record<GenerationMethod, string> = {
  TEMPLATE: "Template wording — no AI used",
  AI: "AI-assisted wording",
  MANUAL: "Edited by hand",
};

export const LEVEL_LABELS: Record<AssessmentLevel, string> = {
  INTERN: "Intern",
  FRESHER: "Fresher / new graduate",
  JUNIOR: "Junior",
  MID: "Mid-level",
  SENIOR: "Senior",
};

export const DIFFICULTY_LABELS: Record<AssessmentDifficulty, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

/** What `POST /parse-requirements` extracts from the recruiter's free text. */
export type ParsedRequirements = {
  jobTitle: string | null;
  targetLevel: AssessmentLevel | null;
  difficulty: AssessmentDifficulty | null;
  durationMinutes: number | null;
  taskCount: number | null;
  skills: { skillId: string; slug: string; name: string; matchedOn: string }[];
  suggestedSkills: { skillId: string; slug: string; name: string; reason: string; becauseOf: string }[];
  notes: string[];
};

export type TargetSkillInput = {
  skillSlug: string;
  weight: number;
  subskills: string[];
  source: "REQUESTED" | "SUGGESTED_APPROVED";
};

export type GenerateRequest = {
  requirementsText: string;
  companyName: string;
  jobTitle?: string;
  description?: string;
  targetLevel?: AssessmentLevel;
  difficulty?: AssessmentDifficulty;
  durationMinutes?: number;
  taskCount?: number;
  aiPolicy: AiPolicy;
  targetSkills: TargetSkillInput[];
};

export type AiFallback = { code: string; message: string };

export type GenerateResponse = {
  id: string;
  versionId: string;
  versionNumber: number;
  status: VersionStatus;
  generationMethod: GenerationMethod;
  generationModel: string | null;
  aiFallback: AiFallback | null;
  /** Full generated content; the preview page re-reads the stored draft instead. */
  assembled: unknown;
};

export type DraftCriterion = {
  position: number;
  name: string;
  description: string;
  maxMarks: number;
  privateGuidance: string;
};

export type DraftTask = {
  id: string;
  position: number;
  type: string;
  skillSlug: string;
  skillName: string;
  title: string;
  prompt: string;
  marks: number;
  timeMinutes: number;
  publicData: Record<string, unknown>;
  privateData: Record<string, unknown>;
  rubric: DraftCriterion[];
};

export type DraftSkill = {
  skillSlug: string;
  name: string;
  weight: number;
  source: string;
  subskills: { slug: string; name: string }[];
};

/** `GET /:assessmentId/versions/:versionId` — the recruiter's own draft. */
export type DraftVersion = {
  id: string;
  assessmentId: string;
  versionNumber: number;
  status: VersionStatus;
  editable: boolean;
  requirementsText: string;
  title: string;
  description: string;
  jobContext: string;
  candidateInstructions: string;
  targetLevel: AssessmentLevel;
  difficulty: AssessmentDifficulty;
  aiPolicy: AiPolicy;
  durationMinutes: number;
  generationMethod: GenerationMethod;
  generationModel: string | null;
  generatedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assessment: { id: string; jobTitle: string; companyName: string };
  skills: DraftSkill[];
  tasks: DraftTask[];
  totals: { marks: number; weights: number; durationMinutes: number; taskCount: number };
};

export type VersionSummary = {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  title: string;
  difficulty: string;
  durationMinutes: number;
  generationMethod: GenerationMethod;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
};

/** `GET /:assessmentId/versions` */
export type VersionList = {
  assessment: { id: string; jobTitle: string; companyName: string };
  versions: VersionSummary[];
};
