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
  marks: number;
  timeMinutes: number;
  /** Null until the candidate starts: the question itself is not sent before then. */
  title: string | null;
  prompt: string | null;
  publicData: Record<string, unknown>;
  rubric: CandidateCriterion[];
};

export type SubmissionSummary = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  submittedAt: string;
  reviewedAt: string | null;
  answeredTaskCount: number;
  /** Marks already given; only marked criteria count, so this grows while marking is in progress. */
  awarded: number;
  scoredCriteria: number;
  possible: number;
};

/** `GET /recruiter/attempts?versionId=` — everyone who submitted a version. */
export type SubmissionList = {
  version: { id: string; title: string; taskCount: number; durationMinutes: number };
  attempts: SubmissionSummary[];
};

/** One rubric criterion as the recruiter scores it; guidance stays on the server. */
export type SubmissionCriterion = {
  id: string;
  name: string;
  description: string;
  /** Evaluator-only marking note; this response is only ever read by the owning recruiter. */
  guidance: string;
  maxMarks: number;
  score: number | null;
};

/** One answered task; the answer key and private guidance are never part of this. */
export type SubmissionTask = {
  id: string;
  position: number;
  type: string;
  title: string;
  prompt: string;
  marks: number;
  skillId: string;
  skillName: string;
  /** Expected values of a data task, for the recruiter to compare the answer against. */
  answerKey: Record<string, string | number>;
  rubric: SubmissionCriterion[];
  answer: string | null;
  savedAt: string | null;
};

/** The running total for a submission; `reviewedAt` is set once every criterion is scored. */
export type SubmissionScore = {
  awarded: number;
  possible: number;
  scoredCriteria: number;
  criterionCount: number;
  pendingCriteria: number;
  reviewedAt: string | null;
};

/** One skill's evidence in this attempt: marked criteria only, with its coverage. */
export type SubmissionSkill = {
  skillId: string;
  name: string;
  awarded: number;
  possible: number;
  scoredCriteria: number;
  criterionCount: number;
  /** Percentage of this skill's criteria that have been marked. */
  coverage: number;
};

/** A question for the live interview, taken from a weak or unmarked criterion. */
export type FollowUpQuestion = {
  criterionId: string;
  criterion: string;
  taskId: string;
  taskTitle: string;
  score: number | null;
  maxMarks: number;
  reason: string;
  question: string;
};

export type CriterionScoreInput = { criterionId: string; marks: number };

/** `GET /recruiter/attempts/:attemptId` — one candidate's submitted answers. */
export type SubmissionDetail = {
  id: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  candidate: { name: string; email: string };
  assessment: {
    assessmentId: string;
    versionId: string;
    versionNumber: number;
    title: string;
    jobTitle: string;
    companyName: string;
    durationMinutes: number;
    difficulty: string;
    targetLevel: string;
    aiPolicy: string;
    generationMethod: GenerationMethod;
    generationModel: string | null;
    publishedAt: string | null;
  };
  score: SubmissionScore;
  skills: SubmissionSkill[];
  followUpQuestions: FollowUpQuestion[];
  tasks: SubmissionTask[];
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

/** One rubric criterion's marks on the candidate's own attempt; marking notes are never sent. */
export type CandidateCriterionResult = {
  criterionId: string;
  taskId: string;
  position: number;
  name: string;
  maxMarks: number;
  /** Null until that criterion has been marked. */
  awarded: number | null;
  taskMarks: number;
};

/** The candidate's own result, present only once the attempt is submitted. */
export type CandidateResult = {
  awarded: number;
  possible: number;
  scoredCriteria: number;
  criterionCount: number;
  reviewedAt: string | null;
  criteria: CandidateCriterionResult[];
};

/** `GET /candidate/attempts/:attemptId` and the start response. */
export type CandidateAttempt = {
  id: string;
  versionId: string;
  status: CandidateAttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  responses: CandidateResponse[];
  /** Null until the attempt is submitted; from then on it carries the marks per criterion. */
  result: CandidateResult | null;
};

/** `GET /candidate/attempts?versionId=` — the candidate's attempt on a version, if any. */
export type CandidateAttemptLookup = { attempt: CandidateAttempt | null };

/** `GET /candidate/assessments/:versionId` — a published version as the candidate sees it. */
export type CandidateAssessmentDetail = {
  /** False until the candidate starts, while only task topics are described. */
  started: boolean;
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
