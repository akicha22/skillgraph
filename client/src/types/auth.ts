export type Role = "CANDIDATE" | "RECRUITER";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isDemo: boolean;
};

export function dashboardPath(role: Role): string {
  return role === "CANDIDATE" ? "/candidate" : "/recruiter";
}