export type AssessmentType = "STRUCTURED_RESPONSE" | "DATA_ANALYTICAL" | "FILE_SUBMISSION";

export type Subskill = { id: string; slug: string; name: string };

export type Skill = {
  id: string;
  slug: string;
  name: string;
  description: string;
  assessmentTypes: AssessmentType[];
  subskills: Subskill[];
};

export type SkillDomain = {
  id: string;
  slug: string;
  name: string;
  description: string;
  skills: Skill[];
};