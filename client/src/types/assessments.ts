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

export const TASK_TYPE_LABELS: Record<string, string> = {
  STRUCTURED_RESPONSE: "Written response",
  DATA_TASK: "Data task",
  DATA_ANALYTICAL: "Data task",
  FILE_SUBMISSION: "File upload",
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

/** One rubric criterion as the recruiter may rewrite it (no position: the server re-indexes). */
export type DraftCriterionUpdate = {
  name: string;
  description: string;
  maxMarks: number;
  privateGuidance: string;
};

/**
 * `PATCH /:assessmentId/versions/:versionId`. Only changed fields are sent. If `tasks` is sent it
 * must contain every task and its marks must total 100; omitting a task's `rubric` lets the server
 * rescale the existing criteria to the new marks.
 */
export type DraftUpdateRequest = {
  title?: string;
  description?: string;
  jobContext?: string;
  candidateInstructions?: string;
  difficulty?: AssessmentDifficulty;
  targetLevel?: AssessmentLevel;
  aiPolicy?: AiPolicy;
  skills?: { skillSlug: string; weight: number }[];
  tasks?: {
    id: string;
    title: string;
    prompt: string;
    marks: number;
    timeMinutes: number;
    rubric?: DraftCriterionUpdate[];
  }[];
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

export type AssessmentVersionSummary = {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  title: string;
  durationMinutes: number;
  taskCount: number;
  updatedAt: string;
};

export type AssessmentSummary = {
  id: string;
  jobTitle: string;
  companyName: string;
  versionCount: number;
  latestVersion: AssessmentVersionSummary;
};

/** `GET /recruiter/assessments` — the recruiter's own assessments. */
export type AssessmentList = { assessments: AssessmentSummary[] };

/** What a candidate receives for a published version: no private data, guidance or answer key. */
export type CandidateCriterion = {
  position: number;
  name: string;
  description: string;
  maxMarks: number;
};

export type CandidateTask = {
  id: string;
  position: number;
  type: string;
  skillName: string;
  title: string;
  prompt: string;
  marks: number;
  timeMinutes: number;
  publicData: Record<string, unknown>;
  rubric: CandidateCriterion[];
};

export type CandidateAssessmentSummary = {
  id: string;
  title: string;
  companyName: string;
  jobTitle: string;
  durationMinutes: number;
  taskCount: number;
};

/** `GET /candidate/assessments` — every published version a candidate can open. */
export type CandidateAssessmentList = { assessments: CandidateAssessmentSummary[] };

export type CandidateAttemptStatus = "IN_PROGRESS" | "SUBMITTED";

export type CandidateResponse = {
  taskId: string;
  answer: string;
  savedAt: string;
};

/** `GET /candidate/attempts/:attemptId` and the start response. */
export type CandidateAttempt = {
  id: string;
  versionId: string;
  status: CandidateAttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  responses: CandidateResponse[];
};

/** `GET /candidate/attempts?versionId=` — the candidate's attempt on a version, if any. */
export type CandidateAttemptLookup = { attempt: CandidateAttempt | null };

/** `GET /candidate/assessments/:versionId` — a published version as the candidate sees it. */
export type CandidateAssessmentDetail = {
  title: string;
  description: string;
  jobContext: string;
  candidateInstructions: string;
  targetLevel: AssessmentLevel;
  difficulty: AssessmentDifficulty;
  aiPolicy: AiPolicy;
  durationMinutes: number;
  assessment: { jobTitle: string; companyName: string };
  tasks: CandidateTask[];
};
