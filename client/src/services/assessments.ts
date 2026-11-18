import { api } from "./api";
import type {
  DraftUpdateRequest,
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

/** Saves wording, marks, minutes, rubric criteria and weights of a draft; returns the stored draft. */
export function updateDraft(assessmentId: string, versionId: string, body: DraftUpdateRequest) {
  return api.patch<DraftVersion>(`${BASE}/${assessmentId}/versions/${versionId}`, body);
}

/** Locks a draft's criteria by publishing it. Fails with per-field issues if it is not ready. */
export function publishVersion(assessmentId: string, versionId: string) {
  return api.post<DraftVersion>(`${BASE}/${assessmentId}/versions/${versionId}/publish`);
}

/** Copies a published version into the next draft version. */
export function createNewVersion(assessmentId: string, versionId: string) {
  return api.post<DraftVersion>(`${BASE}/${assessmentId}/versions/${versionId}/new-version`);
}
