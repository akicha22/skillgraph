import { api } from "./api";
import type {
  AssessmentList,
  CandidateAssessmentDetail,
  CandidateAssessmentList,
  CandidateAttempt,
  CandidateResponse,
  DraftUpdateRequest,
  DraftVersion,
  GenerateRequest,
  GenerateResponse,
  ParsedRequirements,
  VersionList,
} from "../types/assessments";

const BASE = "/recruiter/assessments";

/** The recruiter's own assessments, each with its latest version. */
export function listAssessments() {
  return api.get<AssessmentList>(BASE);
}

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

/** The published version a candidate opens; private data is stripped on the server. */
export function getCandidateAssessment(versionId: string) {
  return api.get<CandidateAssessmentDetail>(`/candidate/assessments/${versionId}`);
}

/** Every published assessment a candidate can open. */
export function listCandidateAssessments() {
  return api.get<CandidateAssessmentList>("/candidate/assessments");
}

/** Starts the candidate's attempt on a published version, or resumes the one they already have. */
export function startCandidateAttempt(versionId: string) {
  return api.post<CandidateAttempt>("/candidate/attempts", { versionId });
}

/** Saves one task's answer, replacing any earlier draft of it. */
export function saveCandidateAnswer(attemptId: string, taskId: string, answer: string) {
  return api.put<CandidateResponse>(`/candidate/attempts/${attemptId}/responses/${taskId}`, { answer });
}
