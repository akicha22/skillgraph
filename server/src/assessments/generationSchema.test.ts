import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generationSchemaWithRefinements } from "./generationSchema.js";

const base = {
  requirementsText: "Looking for a junior operations associate with Excel and negotiation skills.",
  companyName: "Northline Trading",
  aiPolicy: "NOT_ALLOWED" as const,
};

const skill = (skillSlug: string, weight: number) => ({
  skillSlug,
  weight,
  subskills: [] as string[],
  source: "REQUESTED" as const,
});

function issuesFor(input: unknown): string[] {
  const parsed = generationSchemaWithRefinements.safeParse(input);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => issue.message);
}

describe("generationSchemaWithRefinements", () => {
  it("accepts a valid generate request", () => {
    const parsed = generationSchemaWithRefinements.safeParse({
      ...base,
      targetSkills: [skill("excel", 50), skill("negotiation", 50)],
    });
    assert.equal(parsed.success, true);
  });

  it("rejects the same skill twice", () => {
    const issues = issuesFor({ ...base, targetSkills: [skill("excel", 50), skill("excel", 50)] });
    assert.ok(issues.some((message) => /only once/i.test(message)));
  });

  it("rejects weights that do not add up to 100", () => {
    const issues = issuesFor({ ...base, targetSkills: [skill("excel", 40), skill("negotiation", 40)] });
    assert.ok(issues.some((message) => /add up to exactly 100/i.test(message)));
  });

  it("rejects a task count below the number of selected skills", () => {
    const issues = issuesFor({
      ...base,
      targetSkills: [skill("excel", 50), skill("negotiation", 50)],
      taskCount: 1,
    });
    assert.ok(issues.some((message) => /cannot be lower/i.test(message)));
  });
});
