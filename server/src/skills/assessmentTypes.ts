export const ASSESSMENT_TYPES = ["STRUCTURED_RESPONSE", "DATA_ANALYTICAL", "FILE_SUBMISSION"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export function parseAssessmentTypes(csv: string): AssessmentType[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AssessmentType => (ASSESSMENT_TYPES as readonly string[]).includes(s));
}