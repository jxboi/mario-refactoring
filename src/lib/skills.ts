import type {CategoryDef, ItemConfig, ItemKind} from "../types";
import {slugifyCategory, uid} from "../types";

/**
 * A "skill" is a reusable, user-authored prompt template for structured work discovery.
 * The user exports it as a Markdown file to hand to an AI/Copilot agent; the
 * agent then produces a JSON file in Chisel's import schema, which the user
 * uploads through the normal Import JSON flow.
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  /** Markdown instructions the user authors — the meat of the prompt. */
  body: string;
  createdAt: number;
  updatedAt: number;
}

const AUDIT_BODY = `You are auditing a codebase for refactoring opportunities.

Review the code I provide and identify concrete, independently shippable refactors. For each one, capture:

- A short, action-oriented title (e.g. "Extract auth token validation into middleware").
- What is wrong today and what "better" looks like.
- The specific files or paths involved.
- Its risk and effort.

Prefer changes that are safe, incremental, and reduce duplication or complexity. Skip cosmetic nitpicks and anything that would require a rewrite.`;

const DEAD_CODE_BODY = `Scan the code I provide for dead and unreachable code that can be safely removed.

Look for:

- Unused exports, functions, variables, and imports.
- Feature-flagged branches that are permanently off.
- Endpoints, resolvers, or handlers with no callers.
- Commented-out blocks and stale TODOs.

For each finding, give a title, the files/paths, and note any evidence that it is truly unused (e.g. no references, zero traffic). Flag anything you are unsure about as higher risk.`;

const TESTS_BODY = `Identify gaps in test coverage for the code I provide and propose targeted tests to add.

For each gap:

- Name the behavior or edge case that is untested.
- Point to the files/paths that need coverage.
- Note the risk of it breaking silently today.

Favor small, high-value tests around bug-prone or high-traffic logic over broad, low-signal coverage.`;

/** Seeded when a scope has no saved skills yet. */
export function defaultSkills(): Skill[] {
  const now = Date.now();
  return [
    {id: uid(), name: "Refactoring audit", description: "Scan a module for concrete, shippable refactors.", body: AUDIT_BODY, createdAt: now, updatedAt: now},
    {id: uid(), name: "Dead code sweep", description: "Find code that can be safely deleted.", body: DEAD_CODE_BODY, createdAt: now, updatedAt: now},
    {id: uid(), name: "Test coverage gaps", description: "Surface untested behavior worth covering.", body: TESTS_BODY, createdAt: now, updatedAt: now},
  ];
}

export function normalizeSkills(value: unknown): Skill[] {
  if (!Array.isArray(value)) return defaultSkills();
  return value
    .filter((skill): skill is Skill => Boolean(skill && typeof skill === "object" && typeof (skill as Skill).id === "string" && typeof (skill as Skill).body === "string"))
    .map((skill) => ({...skill}));
}

/** The starting body for a brand-new, hand-created skill. */
export const NEW_SKILL_BODY = `Describe what this skill should look for in the code, and what to capture for each finding.

For each refactoring opportunity, include a short title, what's wrong today, the files/paths involved, and a sense of risk and effort.`;

/** A url-safe filename stem for a skill (without extension). */
export function skillFileStem(skill: Skill): string {
  return slugifyCategory(skill.name || "skill");
}

/**
 * Compose the full Markdown prompt for a skill. The user's instructions are
 * followed by an auto-generated "Output format" section describing Chisel's
 * import schema, so whatever agent runs the prompt returns importable JSON.
 */
export function composeSkillMarkdown(skill: Skill, config: ItemConfig, categories: CategoryDef[]): string {
  const catIds = categories.map((c) => c.id).join(", ");
  const metric = config.metricLabel.toLowerCase();
  const name = skill.name.trim() || "Untitled skill";
  const parts = [`# ${name}`];
  if (skill.description.trim()) parts.push(skill.description.trim());
  parts.push(skill.body.trim());
  parts.push(["## Output format", "", `Return a single JSON file containing a top-level array of ${config.itemNounPlural}. Each item supports:`, "", "- `title` (required) — a short, action-oriented summary.", "- `description` — the outcome or context.", `- \`priority\` — low | medium | high (${metric}).`, "- `effort` — low | medium | high | xhigh.", `- \`category\` — one of: ${catIds}.`, "- `tags` — array of short labels.", "- `status` — queued | active | reviewing | deployed | deferred.", "", "Example:", "", "```json", config.schema, "```"].filter(Boolean).join("\n"));
  return parts.join("\n\n") + "\n";
}

/** A clean, valid example JSON payload the user can download and import as-is. */
export function exampleImportJson(type: ItemKind): string {
  const items =
    type === "project"
      ? [
          {title: "Improve new-team onboarding", description: "Reduce time-to-value for new teams.", priority: "high", effort: "high", category: "initiative", tags: ["activation"], status: "planning"},
          {title: "Research reporting needs", description: "Identify the smallest valuable reporting surface.", priority: "medium", effort: "small", category: "research", tags: ["discovery"], status: "idea"},
        ]
      : [
          {title: "Follow up with vendor on SSO rollout", description: "Confirm go-live date and access scope.", priority: "high", effort: "m", category: "follow-up", tags: ["vendors"], status: "todo"},
          {title: "Document the incident runbook", description: "Capture the on-call steps we used last week.", priority: "medium", effort: "s", category: "documentation", tags: ["oncall"], status: "in-progress"},
        ];
  return JSON.stringify(items, null, 2) + "\n";
}
