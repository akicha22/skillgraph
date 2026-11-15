export const ROLES = ["CANDIDATE", "RECRUITER"] as const;
export type Role = (typeof ROLES)[number];