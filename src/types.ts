export type Stage = "queued" | "active" | "reviewing" | "deployed" | "deferred";

export type Risk = "low" | "medium" | "high";

export type Effort = "low" | "medium" | "high" | "xhigh";

/** Which level of the product-to-delivery hierarchy a project represents. */
export type ProjectType = "plan" | "task" | "coding";

/** Category ids are user-configurable, so this is an open string type. */
export type Category = string;

export interface Note {
  id: string;
  text: string;
  createdAt: number;
  blocked?: boolean;
  resolved?: boolean;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  files: string[];
  risk: Risk;
  effort: Effort;
  category: Category;
  tags: string[];
  stage: Stage;
  blocked: boolean;
  blockReason: string;
  notes: Note[];
  /** The single adjacent-level owner in the same workspace; Plan items use null. */
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type StageGroup = "backlog" | "active" | "done" | "deferred";

/** How many days a deployed item stays on the board before it drops off. */
export const DEPLOYED_WINDOW_DAYS = 14;

export interface StageDef {
  id: Stage;
  label: string;
  hint: string;
  group: StageGroup;
  /** Only surface items updated within this many days (older ones are hidden). */
  recentDays?: number;
  /** Collapse this column until the user opts to reveal it. */
  hiddenByDefault?: boolean;
}

export const STAGES: StageDef[] = [
  {id: "queued", label: "Queued", hint: "Waiting to be picked up", group: "backlog"},
  {id: "active", label: "Active", hint: "Actively being reworked", group: "active"},
  {id: "reviewing", label: "Reviewing", hint: "Tests, review, canary", group: "active"},
  {
    id: "deployed",
    label: "Deployed",
    hint: "Shipped in the last 2 weeks",
    group: "done",
    recentDays: DEPLOYED_WINDOW_DAYS,
  },
  {
    id: "deferred",
    label: "Deferred",
    hint: "Parked for now — hidden by default",
    group: "deferred",
    hiddenByDefault: true,
  },
];

/** Task boards reuse the same stage ids/groups but relabel them for task work. */
export const TASK_STAGES: StageDef[] = [
  {id: "queued", label: "To do", hint: "Waiting to be picked up", group: "backlog"},
  {id: "active", label: "In progress", hint: "Being worked on right now", group: "active"},
  {id: "reviewing", label: "Review", hint: "Checks, review, sign-off", group: "active"},
  {
    id: "deployed",
    label: "Done",
    hint: "Completed in the last 2 weeks",
    group: "done",
    recentDays: DEPLOYED_WINDOW_DAYS,
  },
  {
    id: "deferred",
    label: "On hold",
    hint: "Parked for now — hidden by default",
    group: "deferred",
    hiddenByDefault: true,
  },
];

export const PLAN_STAGES: StageDef[] = [
  {id: "queued", label: "Idea", hint: "An opportunity worth considering", group: "backlog"},
  {id: "active", label: "Planning", hint: "Defining the outcome and approach", group: "active"},
  {id: "reviewing", label: "Ready", hint: "Planned and ready to assign", group: "active"},
  {id: "deployed", label: "Done", hint: "The planned outcome is complete", group: "done"},
  {id: "deferred", label: "On hold", hint: "Parked for now — hidden by default", group: "deferred", hiddenByDefault: true},
];

export const RISKS: Risk[] = ["low", "medium", "high"];

export const RISK_LABELS: Record<Risk, string> = {
  low: "low",
  medium: "med",
  high: "high",
};

export const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh"];

export const EFFORT_LABELS: Record<Effort, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "X-High",
};

export interface CategoryDef {
  id: string;
  label: string;
  glyph: string;
}

/** The category items fall back to when none is set or their category was removed. */
export const FALLBACK_CATEGORY_ID = "other";

/** Categories a fresh board starts with; users can add, rename, or remove them. */
/** Legacy Coding categories retained for migration and parser defaults. */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  {id: "extract", label: "Extract", glyph: "⤴"},
  {id: "rename", label: "Rename", glyph: "✎"},
  {id: "dead-code", label: "Dead code", glyph: "✂"},
  {id: "dependency", label: "Dependency", glyph: "⬡"},
  {id: "performance", label: "Performance", glyph: "⚡"},
  {id: "test", label: "Tests", glyph: "✓"},
  {id: "architecture", label: "Architecture", glyph: "▦"},
  {id: "style", label: "Style", glyph: "❖"},
  {id: "question", label: "Question", glyph: "?"},
  {id: FALLBACK_CATEGORY_ID, label: "Other", glyph: "·"},
];

/** Categories a fresh task board starts with; users can add, rename, or remove them. */
export const TASK_CATEGORIES: CategoryDef[] = [
  {id: "request", label: "Request", glyph: "✉"},
  {id: "incident", label: "Incident", glyph: "⚠"},
  {id: "bug", label: "Bug", glyph: "❢"},
  {id: "follow-up", label: "Follow up", glyph: "↻"},
  {id: "documentation", label: "Documentation", glyph: "❏"},
  {id: "research", label: "Research", glyph: "⌕"},
  {id: "design", label: "Design", glyph: "✐"},
  {id: "question", label: "Question", glyph: "?"},
  {id: FALLBACK_CATEGORY_ID, label: "Other", glyph: "·"},
];

export const PLAN_CATEGORIES: CategoryDef[] = [
  {id: "goal", label: "Goal", glyph: "◎"},
  {id: "initiative", label: "Initiative", glyph: "◆"},
  {id: "feature", label: "Feature", glyph: "✦"},
  {id: "research", label: "Research", glyph: "⌕"},
  {id: "improvement", label: "Improvement", glyph: "↗"},
  {id: FALLBACK_CATEGORY_ID, label: "Other", glyph: "·"},
];

export const CODING_CATEGORIES: CategoryDef[] = [
  {id: "feature", label: "Feature", glyph: "✦"},
  {id: "bug", label: "Bug", glyph: "❢"},
  {id: "refactor", label: "Refactor", glyph: "⤴"},
  {id: "infrastructure", label: "Infrastructure", glyph: "⬡"},
  {id: "test", label: "Tests", glyph: "✓"},
  {id: "security", label: "Security", glyph: "◆"},
  {id: "performance", label: "Performance", glyph: "⚡"},
  {id: "documentation", label: "Documentation", glyph: "❏"},
  {id: FALLBACK_CATEGORY_ID, label: "Other", glyph: "·"},
];

export function categoryMeta(id: string, categories: CategoryDef[] = DEFAULT_CATEGORIES): CategoryDef {
  return categories.find((c) => c.id === id) ?? categories.find((c) => c.id === FALLBACK_CATEGORY_ID) ?? {id: FALLBACK_CATEGORY_ID, label: "Other", glyph: "·"};
}

/** Turn a human label into a stable, url-safe category id. */
export function slugifyCategory(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "category"
  );
}

/** Everything that differs between Plan, Task, and Coding boards. */
export interface TypeConfig {
  id: ProjectType;
  /** Human label for the type, shown in the project switcher. */
  label: string;
  /** Noun for a single item / many items on this board. */
  itemNoun: string;
  itemNounPlural: string;
  /** Columns for this board — same ids/groups, type-specific labels. */
  stages: StageDef[];
  /** Categories a fresh board of this type starts with. */
  categories: CategoryDef[];
  /** Label for the low/medium/high field (Risk for refactors, Priority for tasks). */
  metricLabel: string;
  /** Whether the "files & paths" field applies to this type. */
  showFiles: boolean;
  /** Label + placeholder for the free-text description field. */
  descriptionLabel: string;
  descriptionPlaceholder: string;
  /** Empty-board headline, blurb, and example JSON. */
  tagline: string;
  blurb: string;
  schema: string;
}

export const TYPE_CONFIGS: Record<ProjectType, TypeConfig> = {
  plan: {
    id: "plan",
    label: "Plan",
    itemNoun: "plan item",
    itemNounPlural: "plan items",
    stages: PLAN_STAGES,
    categories: PLAN_CATEGORIES,
    metricLabel: "Priority",
    showFiles: false,
    descriptionLabel: "Outcome & context",
    descriptionPlaceholder: "What outcome are we aiming for, and why does it matter?",
    tagline: "Turn product intent into a clear delivery plan",
    blurb: "Create high-level plan items, shape the outcome, then create owned work in Task projects.",
    schema: `[
  {
    "title": "Improve the onboarding experience",
    "description": "Reduce time-to-value for new teams",
    "priority": "high",
    "effort": "high",
    "category": "initiative",
    "tags": ["activation"],
    "status": "planning"
  }
]`,
  },
  coding: {
    id: "coding",
    label: "Coding",
    itemNoun: "coding item",
    itemNounPlural: "coding items",
    stages: STAGES,
    categories: CODING_CATEGORIES,
    metricLabel: "Priority",
    showFiles: true,
    descriptionLabel: "Implementation details",
    descriptionPlaceholder: "What should be built or changed, and any technical context…",
    tagline: "A calm place to deliver technical work",
    blurb: "Coding work is created from its owning task, keeping implementation context clear from the start.",
    schema: `[
  {
    "title": "Extract retry logic into a service",
    "description": "Duplicated across three handlers",
    "files": ["src/checkout/card_handler.py"],
    "priority": "high",     // low | medium | high
    "effort": "l",          // low | medium | high
    "category": "refactor", // feature, bug, refactor, …
    "tags": ["payments"],
    "status": "in-progress"
  }
]`,
  },
  task: {
    id: "task",
    label: "Task",
    itemNoun: "task",
    itemNounPlural: "tasks",
    stages: TASK_STAGES,
    categories: TASK_CATEGORIES,
    metricLabel: "Priority",
    showFiles: false,
    descriptionLabel: "Details",
    descriptionPlaceholder: "What needs to happen, and any context…",
    tagline: "A calm place to run your tasks",
    blurb: "Tasks are created from their owning plan item, keeping delivery work connected without manual linking.",
    schema: `[
  {
    "title": "Follow up with vendor on SSO rollout",
    "description": "Confirm go-live date and access scope",
    "priority": "high",       // low | medium | high
    "effort": "m",            // low | medium | high
    "category": "follow-up",  // request, incident, bug, …
    "tags": ["vendors"],
    "status": "todo"
  }
]`,
  },
};

export const PROJECT_TYPES: ProjectType[] = ["plan", "task", "coding"];

export function typeConfig(type: ProjectType | undefined): TypeConfig {
  return TYPE_CONFIGS[type ?? "coding"] ?? TYPE_CONFIGS.coding;
}

export function parentTypeFor(type: ProjectType): ProjectType | null {
  return type === "coding" ? "task" : type === "task" ? "plan" : null;
}

export function childTypeFor(type: ProjectType): ProjectType | null {
  return type === "plan" ? "task" : type === "task" ? "coding" : null;
}

/** A fresh, mutable copy of the default categories for a project type. */
export function defaultCategoriesFor(type: ProjectType): CategoryDef[] {
  return typeConfig(type).categories.map((c) => ({...c}));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

/** Derive an item's blocked state from its notes: blocked if any note is tagged blocked. */
export function blockedFrom(notes: Note[]): {blocked: boolean; blockReason: string} {
  const blocked = notes.filter((n) => n.blocked);
  return {blocked: blocked.length > 0, blockReason: blocked.map((n) => n.text).join(" · ")};
}
