import { api } from "./api";
import type {
  AssessmentList,
  CandidateAssessmentDetail,
  CriterionScoreInput,
  CandidateAssessmentList,
  ComparisonDetail,
  CandidateAttempt,
  CandidateAttemptLookup,
  CandidateResponse,
  DraftUpdateRequest,
  DraftVersion,
  GenerateRequest,
  GenerateResponse,
  ParsedRequirements,
  ShortlistDetail,
  ShortlistSummary,
  SubmissionDetail,
  SubmissionList,
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

/** Everyone who has submitted a version of the recruiter's own assessment. */
export function listSubmissions(versionId: string) {
  return api.get<SubmissionList>(`/recruiter/attempts?versionId=${encodeURIComponent(versionId)}`);
}

/** One candidate's submitted answers, with the criteria they are scored against. */
export function getSubmission(attemptId: string) {
  return api.get<SubmissionDetail>(`/recruiter/attempts/${attemptId}`);
}

/** Two to four submitted attempts of one version, aggregated per skill. */
export function compareSubmissions(attemptIds: string[]) {
  return api.get<ComparisonDetail>(
    `/recruiter/attempts/compare?attemptIds=${encodeURIComponent(attemptIds.join(","))}`,
  );
}

/** Saves marks per criterion and returns the submission with its new total. */
export function saveSubmissionScores(attemptId: string, scores: CriterionScoreInput[]) {
  return api.put<SubmissionDetail>(`/recruiter/attempts/${attemptId}/scores`, { scores });
}

/** The recruiter's shortlists; passing an attemptId marks the lists that already hold it. */
export function listShortlists(attemptId?: string) {
  const query = attemptId ? `?attemptId=${encodeURIComponent(attemptId)}` : "";
  return api.get<{ shortlists: ShortlistSummary[] }>(`/recruiter/shortlists${query}`);
}

/** One shortlist with its shortlisted candidates and private notes. */
export function getShortlist(shortlistId: string) {
  return api.get<ShortlistDetail>(`/recruiter/shortlists/${shortlistId}`);
}

export function createShortlist(name: string) {
  return api.post<{ shortlist: ShortlistSummary }>("/recruiter/shortlists", { name });
}

/** Adds a submitted attempt of the recruiter's own assessment, with an optional note. */
export function addShortlistEntry(shortlistId: string, attemptId: string, note: string) {
  return api.post<ShortlistDetail>(`/recruiter/shortlists/${shortlistId}/entries`, {
    attemptId,
    note,
  });
}

/** Replaces the private note on one entry and returns the whole list. */
export function saveShortlistNote(shortlistId: string, entryId: string, note: string) {
  return api.patch<ShortlistDetail>(`/recruiter/shortlists/${shortlistId}/entries/${entryId}`, {
    note,
  });
}

export function removeShortlistEntry(shortlistId: string, entryId: string) {
  return api.del<void>(`/recruiter/shortlists/${shortlistId}/entries/${entryId}`);
}

export function deleteShortlist(shortlistId: string) {
  return api.del<void>(`/recruiter/shortlists/${shortlistId}`);
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

/** The candidate's attempt on a version, so the page opens in its real state. */
export function getCandidateAttempt(versionId: string) {
  return api.get<CandidateAttemptLookup>(
    `/candidate/attempts?versionId=${encodeURIComponent(versionId)}`,
  );
}

/** Submits and locks the attempt; answers cannot be saved afterwards. */
export function submitCandidateAttempt(attemptId: string) {
  return api.post<CandidateAttempt>(`/candidate/attempts/${attemptId}/submit`);
}

/** Saves one task's answer, replacing any earlier draft of it. */
export function saveCandidateAnswer(attemptId: string, taskId: string, answer: string) {
  return api.put<CandidateResponse>(`/candidate/attempts/${attemptId}/responses/${taskId}`, { answer });
}
