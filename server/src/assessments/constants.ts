export const LEVELS = ["INTERN", "FRESHER", "JUNIOR", "MID", "SENIOR"] as const;
export type Level = (typeof LEVELS)[number];

export const DIFFICULTIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const AI_POLICIES = ["NOT_ALLOWED", "ALLOWED_DISCLOSED"] as const;
export type AiPolicy = (typeof AI_POLICIES)[number];

export const GENERATION_METHODS = ["TEMPLATE", "AI", "MANUAL"] as const;
export type GenerationMethod = (typeof GENERATION_METHODS)[number];

export const VERSION_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const ASSESSMENT_FORMATS = ["EXAM", "WORK_PERIOD"] as const;
export type AssessmentFormat = (typeof ASSESSMENT_FORMATS)[number];

export const WORK_PERIOD_DAYS = 5;

export const MIN_DURATION = 10;
export const MAX_DURATION = 240;
export const MAX_TASKS = 8;
