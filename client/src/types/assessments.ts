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

export type ClarificationQuestion = {
  id: "product" | "market" | "team" | "scale" | "tools";
  question: string;
  why: string;
  placeholder: string;
};

export type ClarificationAnswer = { question: string; answer: string };

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | "REMOTE";

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  REMOTE: "Remote",
};

export type GenerateRequest = {
  requirementsText: string;
  /** Answers to the clarification questions; folded into the brief by the server. */
  clarifications?: ClarificationAnswer[];
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
  /** What the candidate wrote after submitting, or null when they have not answered. */
  candidateAnswer: string | null;
  answerSavedAt: string | null;
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

/** One candidate's per-skill marks inside a side-by-side comparison. */
export type ComparisonSkill = {
  skillId: string;
  awarded: number;
  possible: number;
  scoredCriteria: number;
  criterionCount: number;
};

export type ComparisonCandidate = {
  attemptId: string;
  candidate: { name: string; email: string };
  submittedAt: string;
  reviewedAt: string | null;
  awarded: number;
  possible: number;
  scoredCriteria: number;
  criterionCount: number;
  skills: ComparisonSkill[];
};

/** `GET /recruiter/attempts/compare/weights?versionId=` — the recruiter's saved weighting. */
export type ComparisonWeights = {
  /** Null when nothing has been saved for this version. */
  weights: { skillId: string; weight: number }[] | null;
  updatedAt: string | null;
};

/** `GET /recruiter/attempts/compare?attemptIds=` — two to four attempts of one version. */
export type ComparisonDetail = {
  version: { id: string; title: string; versionNumber: number };
  skills: { skillId: string; name: string }[];
  candidates: ComparisonCandidate[];
};

export type CandidateAssessmentSummary = {
  id: string;
  title: string;
  companyName: string;
  jobTitle: string;
  durationMinutes: number;
  taskCount: number;
  /** The candidate's own attempt, or null when they have not started this version. */
  attempt: {
    id: string;
    status: CandidateAttemptStatus;
    submittedAt: string | null;
    reviewedAt: string | null;
    /** Marks saved so far; only marked criteria count. */
    awarded: number;
    possible: number;
  } | null;
};

/** A requirements post as its own recruiter sees it. */
export type RecruiterPost = {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  requirements: string;
  skills: string[];
  experience: string | null;
  employmentType: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/** `GET /candidate/posts` — every open requirements post, with who posted it. */
export type CandidatePost = {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  requirements: string;
  skills: string[];
  experience: string | null;
  employmentType: string | null;
  recruiterName: string;
  createdAt: string;
};

export type RecruiterPostInput = {
  title: string;
  companyName: string;
  location?: string;
  requirements: string;
  skills?: string[];
  experience?: string;
  employmentType?: EmploymentType;
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

/** `GET /recruiter/shortlists` — the recruiter's own lists, never another recruiter's. */
export type ShortlistSummary = {
  id: string;
  name: string;
  entryCount: number;
  /** True when the attempt the list was requested for is already on this list. */
  containsAttempt: boolean;
  updatedAt: string;
};

/** One shortlisted candidate: the attempt's score and the recruiter's private note. */
export type ShortlistEntry = {
  id: string;
  attemptId: string;
  note: string;
  createdAt: string;
  candidate: { name: string; email: string };
  assessment: {
    versionId: string;
    title: string;
    versionNumber: number;
    jobTitle: string;
    companyName: string;
  };
  submittedAt: string | null;
  reviewedAt: string | null;
  awarded: number;
  possible: number;
  scoredCriteria: number;
  criterionCount: number;
};

/** `GET /recruiter/shortlists/:shortlistId` — one list with its entries. */
export type ShortlistDetail = {
  id: string;
  name: string;
  entries: ShortlistEntry[];
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

/**
 * `GET /candidate/tasks` — one daily practice drill. Practice is a habit: no marks, no rubric,
 * no attempt and nothing a recruiter can see.
 */
export type DailyTask = {
  id: string;
  position: number;
  title: string;
  skillName: string;
  scenario: string;
  steps: string[];
  estimateMinutes: number;
  points: number;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  status: "PENDING" | "DONE";
  reflection: string;
  completedAt: string | null;
};

export type DailyTaskDay = { day: string; total: number; done: number };

export type CandidateTasksResponse = {
  day: string;
  /** True when the candidate has not chosen skills, so there is nothing honest to practise. */
  needsSkills: boolean;
  tasks: DailyTask[];
  summary: { todayTotal: number; todayDone: number; streakDays: number; last7: DailyTaskDay[] };
};

/** `GET /candidate/profile` — the candidate's own profile and what their assessments show. */
export type CandidateProfile = {
  name: string;
  email: string;
  headline: string | null;
  location: string | null;
  about: string | null;
  yearsExperience: number | null;
  isDemo: boolean;
  memberSince: string;
};

export type CandidateSkillSummary = { id: string; name: string; domain: string };

export type CandidateResultRow = {
  attemptId: string;
  versionId: string;
  title: string;
  companyName: string;
  jobTitle: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  awarded: number;
  possible: number;
  scoredCriteria: number;
};

export type CandidateProfileResponse = {
  profile: CandidateProfile;
  skills: CandidateSkillSummary[];
  stats: {
    available: number;
    inProgress: number;
    submitted: number;
    marked: number;
    awaitingMarks: number;
    averagePercent: number | null;
  };
  results: CandidateResultRow[];
};

export type CandidateProfileUpdate = {
  headline?: string;
  location?: string;
  about?: string;
  yearsExperience?: number | null;
};

/** One post-submission follow-up question, with the candidate's own answer. */
export type CandidateFollowUp = {
  criterionId: string;
  criterion: string;
  taskTitle: string;
  reason: string;
  question: string;
  answer: string;
  savedAt: string | null;
};

export type CandidateFollowUps = {
  submittedAt: string | null;
  questions: CandidateFollowUp[];
  answeredCount: number;
  total: number;
};

export type LocationSuggestion = { name: string; region: string; country: string; label: string };
