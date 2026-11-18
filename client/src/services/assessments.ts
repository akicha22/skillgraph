import { api } from "./api";
import type {
  DraftVersion,
  GenerateRequest,
  GenerateResponse,
  ParsedRequirements,
  VersionList,
} from "../types/assessments";

const BASE = "/recruiter/assessments";

/** Reads the skills, level, duration and task count implied by the recruiter's brief. */
export function parseRequirements(text: string) {
  return api.post<ParsedRequirements>(`${BASE}/parse-requirements`, { text });
}

/** Generates and stores a new assessment draft (version 1). */
export function generateAssessment(body: GenerateRequest) {
  return api.post<GenerateResponse>(`${BASE}/generate`, body);
}

export function getDraft(assessmentId: string, versionId: string) {
  return api.get<DraftVersion>(`${BASE}/${assessmentId}/versions/${versionId}`);
}

export function listVersions(assessmentId: string) {
  return api.get<VersionList>(`${BASE}/${assessmentId}/versions`);
}
