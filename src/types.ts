export type Stage = "queued" | "active" | "reviewing" | "deployed" | "deferred";

export type Risk = "low" | "medium" | "high";

export type Effort = "low" | "medium" | "high";

/** Category ids are user-configurable, so this is an open string type. */
export type Category = string;

export interface Note {
  id: string;
  text: string;
  createdAt: number;
  blocked?: boolean;
  resolved?: boolean;
}

export interface RefactorItem {
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

export const RISKS: Risk[] = ["low", "medium", "high"];

export const EFFORTS: Effort[] = ["low", "medium", "high"];

export interface CategoryDef {
  id: string;
  label: string;
  glyph: string;
}

/** The category items fall back to when none is set or their category was removed. */
export const FALLBACK_CATEGORY_ID = "other";

/** Categories a fresh board starts with; users can add, rename, or remove them. */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  {id: "extract", label: "Extract", glyph: "⤴"},
  {id: "rename", label: "Rename", glyph: "✎"},
  {id: "dead-code", label: "Dead code", glyph: "✂"},
  {id: "dependency", label: "Dependency", glyph: "⬡"},
  {id: "performance", label: "Performance", glyph: "⚡"},
  {id: "test", label: "Tests", glyph: "✓"},
  {id: "architecture", label: "Architecture", glyph: "▦"},
  {id: "style", label: "Style", glyph: "❖"},
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

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

/** Derive an item's blocked state from its notes: blocked if any note is tagged blocked. */
export function blockedFrom(notes: Note[]): {blocked: boolean; blockReason: string} {
  const blocked = notes.filter((n) => n.blocked);
  return {blocked: blocked.length > 0, blockReason: blocked.map((n) => n.text).join(" · ")};
}
