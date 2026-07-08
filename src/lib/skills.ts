import {useEffect, useState} from "react";
import type {CategoryDef, ProjectType, TypeConfig} from "../types";
import {slugifyCategory, uid} from "../types";

/**
 * A "skill" is a reusable, user-authored prompt template for code refactoring.
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

const STORAGE_KEY = "chisel.skills.v1";

function storageKey(scope?: string): string {
  return scope ? `${STORAGE_KEY}.${scope}` : STORAGE_KEY;
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
function defaultSkills(): Skill[] {
  const now = Date.now();
  return [
    {id: uid(), name: "Refactoring audit", description: "Scan a module for concrete, shippable refactors.", body: AUDIT_BODY, createdAt: now, updatedAt: now},
    {id: uid(), name: "Dead code sweep", description: "Find code that can be safely deleted.", body: DEAD_CODE_BODY, createdAt: now, updatedAt: now},
    {id: uid(), name: "Test coverage gaps", description: "Surface untested behavior worth covering.", body: TESTS_BODY, createdAt: now, updatedAt: now},
  ];
}

/** The starting body for a brand-new, hand-created skill. */
export const NEW_SKILL_BODY = `Describe what this skill should look for in the code, and what to capture for each finding.

For each refactoring opportunity, include a short title, what's wrong today, the files/paths involved, and a sense of risk and effort.`;

function load(scope?: string): Skill[] {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    // A missing key means first run → seed defaults. A present (even empty)
    // value means the user has curated their list, so respect it as-is.
    if (raw === null) return defaultSkills();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s) => s && typeof s.id === "string" && typeof s.body === "string");
  } catch {
    /* corrupted storage — fall through to defaults */
  }
  return defaultSkills();
}

export function useSkills(scope?: string) {
  const [skills, setSkills] = useState<Skill[]>(() => load(scope));

  useEffect(() => {
    localStorage.setItem(storageKey(scope), JSON.stringify(skills));
  }, [skills, scope]);

  const createSkill = (): Skill => {
    const now = Date.now();
    const skill: Skill = {id: uid(), name: "Untitled skill", description: "", body: NEW_SKILL_BODY, createdAt: now, updatedAt: now};
    setSkills((prev) => [...prev, skill]);
    return skill;
  };

  const updateSkill = (id: string, patch: Partial<Omit<Skill, "id" | "createdAt">>) => {
    setSkills((prev) => prev.map((s) => (s.id === id ? {...s, ...patch, updatedAt: Date.now()} : s)));
  };

  const deleteSkill = (id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  return {skills, createSkill, updateSkill, deleteSkill};
}

/** A url-safe filename stem for a skill (without extension). */
export function skillFileStem(skill: Skill): string {
  return slugifyCategory(skill.name || "skill");
}

/**
 * Compose the full Markdown prompt for a skill. The user's instructions are
 * followed by an auto-generated "Output format" section describing Chisel's
 * import schema, so whatever agent runs the prompt returns importable JSON.
 */
export function composeSkillMarkdown(skill: Skill, config: TypeConfig, categories: CategoryDef[]): string {
  const catIds = categories.map((c) => c.id).join(", ");
  const metric = config.metricLabel.toLowerCase();
  const name = skill.name.trim() || "Untitled skill";
  const parts = [`# ${name}`];
  if (skill.description.trim()) parts.push(skill.description.trim());
  parts.push(skill.body.trim());
  parts.push(["## Output format", "", `Return a single JSON file that can be imported into Chisel: a top-level array of ${config.itemNounPlural}, or an object with an \`items\` array. Each item supports:`, "", "- `title` (required) — a short, action-oriented summary.", "- `description` — what's wrong today and what better looks like.", config.showFiles ? "- `files` — array of affected paths." : null, `- \`${config.id === "task" ? "priority" : "risk"}\` — low | medium | high (${metric}).`, "- `effort` — low | medium | high | xhigh.", `- \`category\` — one of: ${catIds}.`, "- `tags` — array of short labels.", "- `status` — queued | active | reviewing | deployed | deferred.", "", "Only `title` is required; everything else falls back to sensible defaults. Field names are matched flexibly on import.", "", "Example:", "", "```json", config.schema, "```"].filter(Boolean).join("\n"));
  return parts.join("\n\n") + "\n";
}

/** A clean, valid example JSON payload the user can download and import as-is. */
export function exampleImportJson(type: ProjectType): string {
  const items =
    type === "task"
      ? [
          {title: "Follow up with vendor on SSO rollout", description: "Confirm go-live date and access scope.", priority: "high", effort: "m", category: "follow-up", tags: ["vendors"], status: "todo"},
          {title: "Document the incident runbook", description: "Capture the on-call steps we used last week.", priority: "medium", effort: "s", category: "documentation", tags: ["oncall"], status: "in-progress"},
        ]
      : [
          {title: "Extract auth token validation into middleware", description: "Token validation is copy-pasted across route handlers with drift between them.", files: ["src/routes/users.ts", "src/routes/orders.ts"], risk: "high", effort: "m", category: "extract", tags: ["auth", "security"], status: "todo"},
          {title: "Remove unused GraphQL resolvers", description: "Several resolvers with zero traffic in the last 6 months.", files: ["src/graphql/resolvers/legacy/"], risk: "low", effort: "small", category: "dead-code", tags: ["graphql"], status: "ready"},
        ];
  return JSON.stringify(items, null, 2) + "\n";
}
