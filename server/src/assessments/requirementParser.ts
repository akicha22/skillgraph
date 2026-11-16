import { ALIASES, NOT_A_TITLE_START, ROLE_NOUNS, SUGGESTION_RULES } from "./skillAliases";
import { MAX_DURATION, MAX_TASKS, MIN_DURATION, type Difficulty, type Level } from "./constants";

export type LibrarySkill = { id: string; slug: string; name: string };

export type ParsedRequirements = {
  jobTitle: string | null;
  targetLevel: Level | null;
  difficulty: Difficulty | null;
  durationMinutes: number | null;
  taskCount: number | null;
  skills: { skillId: string; slug: string; name: string; matchedOn: string }[];
  suggestedSkills: { skillId: string; slug: string; name: string; reason: string; becauseOf: string }[];
  notes: string[];
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Word boundaries that also work around symbols such as "c++".
const word = (pattern: string) => new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- job title ----------

const TITLE_PATTERNS: RegExp[] = [
  /(?<![a-z])(?:looking for|need|needs|seeking|hiring(?: for)?|want|wants|require|requires|searching for|recruiting(?: for)?)\s+(?:an?\s+|the\s+|some\s+)?([a-z][a-z0-9 /&-]{2,70}?)(?=\s+(?:who|that|with|to|capable|able|and|for|having|skilled|proficient)(?![a-z])|\s*[,.;:])/g,
  /(?<![a-z])for\s+(?:an?\s+|the\s+)?([a-z][a-z0-9 /&-]{2,70}?)\s+(?:role|position|job|vacancy|post|opening)(?![a-z])/g,
];

function extractTitle(lower: string): { title: string; raw: string } | null {
  for (const pattern of TITLE_PATTERNS) {
    for (const m of lower.matchAll(pattern)) {
      const raw = (m[1] ?? "").trim();
      const words = raw.split(" ");
      const first = words[0] ?? "";
      const last = words[words.length - 1] ?? "";
      if (!raw || NOT_A_TITLE_START.has(first) || !ROLE_NOUNS.has(last)) continue;
      const title = words.map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
      return { title, raw };
    }
  }
  return null;
}

// ---------- level, difficulty, duration, task count ----------

const LEVEL_PATTERNS: [Level, RegExp][] = [
  ["INTERN", word("intern|interns|internship|apprentice")],
  ["SENIOR", word("senior|principal")],
  ["MID", word("mid[- ]?level|mid[- ]career")],
  ["JUNIOR", word("junior|jr")],
  ["FRESHER", word("fresher|freshers|fresh graduate|new graduate|recent graduate|entry[- ]level|graduate|trainee")],
];

const DIFFICULTY_PATTERNS: [Difficulty, RegExp][] = [
  ["BEGINNER", word("beginner|novice|foundational|elementary|basic[- ]level")],
  ["INTERMEDIATE", word("intermediate|moderate|medium[- ]level|moderately difficult")],
  ["ADVANCED", word("advanced|expert|expert[- ]level|highly skilled|challenging")],
];

function detectLevel(lower: string): Level | null {
  for (const [level, re] of LEVEL_PATTERNS) if (re.test(lower)) return level;
  return null;
}

function detectDifficulty(lower: string): Difficulty | null {
  let best: { difficulty: Difficulty; at: number } | null = null;
  for (const [difficulty, re] of DIFFICULTY_PATTERNS) {
    const at = lower.search(re);
    if (at >= 0 && (best === null || at < best.at)) best = { difficulty, at };
  }
  return best === null ? null : best.difficulty;
}

function parseDuration(lower: string, notes: string[]): number | null {
  const candidates: number[] = [];

  for (const m of lower.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)(?![a-z])/g)) {
    const value = parseFloat(m[1] ?? "");
    const unit = m[2] ?? "";
    if (!Number.isNaN(value)) candidates.push(Math.round(unit.startsWith("h") ? value * 60 : value));
  }

  const words: Record<string, number> = { "half an": 0.5, an: 1, one: 1, two: 2, three: 3, four: 4 };
  for (const m of lower.matchAll(/(?<![a-z])(half an|an|one|two|three|four) hours?(?![a-z])/g)) {
    const n = words[m[1] ?? ""];
    if (n !== undefined) candidates.push(Math.round(n * 60));
  }

  const ok = candidates.find((d) => d >= MIN_DURATION && d <= MAX_DURATION);
  if (ok === undefined && candidates.length > 0) {
    notes.push(`A duration was mentioned, but assessments must last between ${MIN_DURATION} and ${MAX_DURATION} minutes.`);
  }
  return ok ?? null;
}

function parseTaskCount(lower: string): number | null {
  const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const m = lower.match(/(?<![a-z0-9])(\d+|one|two|three|four|five|six)\s+(?:practical\s+|short\s+)?tasks?(?![a-z])/);
  if (!m) return null;
  const raw = m[1] ?? "";
  const n = numbers[raw] ?? parseInt(raw, 10);
  return n >= 1 && n <= MAX_TASKS ? n : null;
}

// ---------- skills ----------

function phrasesFor(skill: LibrarySkill): string[] {
  const name = skill.name.toLowerCase();
  const phrases = new Set<string>([name, name.replace(/-/g, " "), name.replace(/\s*\/\s*/g, " ")]);
  for (const alias of ALIASES[skill.slug] ?? []) phrases.add(alias);
  return [...phrases];
}

function matchSkills(lower: string, working: string, library: LibrarySkill[]) {
  const candidates = library
    .flatMap((skill) => phrasesFor(skill).map((phrase) => ({ phrase, skill })))
    .sort((a, b) => b.phrase.length - a.phrase.length);

  const found = new Map<string, { skill: LibrarySkill; matchedOn: string }>();
  let text = working;

  for (const { phrase, skill } of candidates) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(phrase)}(?![a-z0-9])`, "g");
    const replaced = text.replace(re, " ");
    if (replaced === text) continue;
    // Consume the match so a shorter phrase can't match inside it
    // (e.g. "client communication" must not also match plain "communication").
    text = replaced;
    if (!found.has(skill.slug)) found.set(skill.slug, { skill, matchedOn: phrase });
  }

  return [...found.values()]
    .map(({ skill, matchedOn }) => ({
      skillId: skill.id,
      slug: skill.slug,
      name: skill.name,
      matchedOn,
      at: lower.indexOf(matchedOn),
    }))
    .sort((a, b) => (a.at === -1 ? Infinity : a.at) - (b.at === -1 ? Infinity : b.at))
    .map(({ at: _at, ...rest }) => rest);
}

// ---------- main entry ----------

export function parseRequirements(text: string, library: LibrarySkill[]): ParsedRequirements {
  const lower = normalise(text);
  const notes: string[] = [];

  const title = extractTitle(lower);
  // Don't let words inside the job title ("operations associate") count as requested skills.
  const working = title ? lower.replace(title.raw, " ") : lower;

  const skills = matchSkills(lower, working, library);

  const matched = new Set(skills.map((s) => s.slug));
  const bySlug = new Map(library.map((s) => [s.slug, s]));
  const seen = new Set<string>();
  const suggestedSkills: ParsedRequirements["suggestedSkills"] = [];
  for (const m of skills) {
    for (const rule of SUGGESTION_RULES[m.slug] ?? []) {
      const target = bySlug.get(rule.slug);
      if (!target || matched.has(rule.slug) || seen.has(rule.slug)) continue;
      seen.add(rule.slug);
      suggestedSkills.push({
        skillId: target.id,
        slug: target.slug,
        name: target.name,
        reason: rule.reason,
        becauseOf: m.name,
      });
    }
  }

  if (skills.length === 0) notes.push("No skills from the library were recognised. Select skills manually.");

  return {
    jobTitle: title ? title.title : null,
    targetLevel: detectLevel(lower),
    difficulty: detectDifficulty(lower),
    durationMinutes: parseDuration(lower, notes),
    taskCount: parseTaskCount(lower),
    skills,
    suggestedSkills: suggestedSkills.slice(0, 5),
    notes,
  };
}

// Logs once if the alias/suggestion tables mention a skill slug that isn't in the library.
let warned = false;
export function warnOnUnknownSlugs(librarySlugs: string[]): void {
  if (warned) return;
  warned = true;
  const known = new Set(librarySlugs);
  const referenced = new Set<string>([
    ...Object.keys(ALIASES),
    ...Object.keys(SUGGESTION_RULES),
    ...Object.values(SUGGESTION_RULES).flatMap((rules) => rules.map((r) => r.slug)),
  ]);
  const unknown = [...referenced].filter((s) => !known.has(s));
  if (unknown.length > 0) {
    console.warn(`[requirement parser] unknown skill slugs in alias/suggestion tables: ${unknown.join(", ")}`);
  }
}