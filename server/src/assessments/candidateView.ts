/**
 * The candidate's view of a published assessment, built from an allowlist.
 *
 * Nothing here reads or copies private material: privateData, the answer key, privateGuidance and
 * the recruiter's brief are not part of CandidateVersionRecord, so they cannot be spread into the
 * view by accident. Until the candidate starts, each task is described by its topic alone — title,
 * prompt, data and criteria stay on the server so a question cannot be read before it is taken.
 */

export type CandidateVersionRecord = {
  title: string;
  description: string;
  jobContext: string;
  candidateInstructions: string;
  targetLevel: string;
  difficulty: string;
  aiPolicy: string;
  durationMinutes: number;
  assessment: { jobTitle: string; companyName: string };
  tasks: {
    id: string;
    position: number;
    type: string;
    title: string;
    prompt: string;
    marks: number;
    timeMinutes: number;
    publicData: string;
    skill: { name: string };
    rubric: { position: number; name: string; description: string; maxMarks: number }[];
  }[];
};

function parseData(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function serializeCandidateVersion(version: CandidateVersionRecord, started: boolean) {
  return {
    title: version.title,
    description: version.description,
    jobContext: version.jobContext,
    candidateInstructions: version.candidateInstructions,
    targetLevel: version.targetLevel,
    difficulty: version.difficulty,
    aiPolicy: version.aiPolicy,
    durationMinutes: version.durationMinutes,
    assessment: {
      jobTitle: version.assessment.jobTitle,
      companyName: version.assessment.companyName,
    },
    started,
    tasks: version.tasks.map((task) => ({
      id: task.id,
      position: task.position,
      type: task.type,
      skillName: task.skill.name,
      marks: task.marks,
      timeMinutes: task.timeMinutes,
      title: started ? task.title : null,
      prompt: started ? task.prompt : null,
      publicData: started ? parseData(task.publicData) : {},
      rubric: started
        ? task.rubric.map((criterion) => ({
            position: criterion.position,
            name: criterion.name,
            description: criterion.description,
            maxMarks: criterion.maxMarks,
          }))
        : [],
    })),
  };
}
