import type {Category, CategoryDef, Effort, Note, ProjectType, Risk, Stage, WorkItem} from "../types";
import {blockedFrom, CODING_CATEGORIES, FALLBACK_CATEGORY_ID, slugifyCategory, uid} from "../types";

export interface ParsedRow {
  ok: boolean;
  index: number;
  item?: WorkItem;
  errors: string[];
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  fileError?: string;
  sourceCount: number;
  /** Category definitions found in the file (e.g. from a Chisel export). */
  categories?: CategoryDef[];
  /** Board type declared by the file (e.g. from a Chisel export), if recognized. */
  projectType?: ProjectType;
}

const CONTAINER_KEYS = ["items", "tasks", "refactorings", "refactors", "entries", "issues", "backlog", "data"];

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  if (typeof v === "string" && v.trim())
    return v
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

/** Read an exported `notes` array back into Note objects, tolerating partial data. */
function parseNotes(v: unknown, now: number): Note[] {
  if (!Array.isArray(v)) return [];
  const notes: Note[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const n = raw as Record<string, unknown>;
    const text = firstString(n, ["text", "note", "body", "message"]);
    if (!text) continue;
    const createdAt = typeof n.createdAt === "number" ? n.createdAt : now;
    notes.push({
      id: typeof n.id === "string" && n.id ? n.id : uid(),
      text,
      createdAt,
      ...(n.blocked === true ? {blocked: true} : {}),
      ...(n.resolved === true ? {resolved: true} : {}),
    });
  }
  return notes;
}

/** Read an exported `categories` array back into CategoryDef objects, tolerating partial data. */
function parseCategoryDefs(v: unknown): CategoryDef[] {
  if (!Array.isArray(v)) return [];
  const defs: CategoryDef[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const c = raw as Record<string, unknown>;
    const label = firstString(c, ["label", "name", "title"]);
    const idStr = typeof c.id === "string" && c.id.trim() ? c.id.trim() : undefined;
    if (!label && !idStr) continue;
    const id = idStr ?? slugifyCategory(label!);
    if (seen.has(id)) continue;
    seen.add(id);
    const glyph = typeof c.glyph === "string" && c.glyph.trim() ? c.glyph : "\u00B7";
    defs.push({id, label: label ?? id, glyph});
  }
  return defs;
}

/** Combine a base category list with extras, ignoring any whose id already exists. */
function mergeCategories(base: CategoryDef[], extra: CategoryDef[]): CategoryDef[] {
  const ids = new Set(base.map((c) => c.id));
  const merged = [...base];
  for (const c of extra) {
    if (ids.has(c.id)) continue;
    ids.add(c.id);
    merged.push(c);
  }
  return merged;
}

function normalizeProjectType(v: unknown): ProjectType | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.toLowerCase().trim();
  if (["plan", "planning", "product", "strategy"].includes(s)) return "plan";
  if (["refactoring", "refactor", "refactors", "code", "coding", "codebase"].includes(s)) return "coding";
  if (["task", "tasks", "todo", "todos", "general"].includes(s)) return "task";
  return undefined;
}

/** Peek at a file's declared board type without fully parsing its items. */
export function readProjectType(text: string): ProjectType | undefined {
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      return normalizeProjectType(obj.type ?? obj.projectType ?? obj.board);
    }
  } catch {
    /* ignore — parseRefactorJson will surface the error */
  }
  return undefined;
}

function normalizeRisk(v: unknown): Risk | undefined {
  if (typeof v === "number") return v <= 1 ? "low" : v === 2 ? "medium" : "high";
  if (typeof v !== "string") return undefined;
  const s = v.toLowerCase().trim();
  if (["low", "l", "minor", "safe", "green", "1"].includes(s)) return "low";
  if (["medium", "med", "m", "moderate", "yellow", "amber", "2"].includes(s)) return "medium";
  if (["high", "h", "critical", "severe", "major", "urgent", "red", "risky", "dangerous", "3", "4", "5"].includes(s)) return "high";
  return undefined;
}

function normalizeEffort(v: unknown): Effort | undefined {
  if (typeof v === "number") return v <= 1 ? "low" : v === 2 ? "medium" : v === 3 ? "high" : "xhigh";
  if (typeof v !== "string") return undefined;
  const s = v.toLowerCase().trim();
  if (["low", "l", "xs", "s", "small", "trivial", "tiny", "easy", "minor", "hours", "hour", "day", "1"].includes(s)) return "low";
  if (["medium", "med", "m", "moderate", "days", "2"].includes(s)) return "medium";
  if (["high", "h", "large", "hard", "week", "weeks", "3"].includes(s)) return "high";
  if (["xhigh", "x-high", "xl", "xxl", "huge", "epic", "month", "months", "4", "5"].includes(s)) return "xhigh";
  return undefined;
}

function normalizeCategory(v: unknown, categories: CategoryDef[]): Category | undefined {
  if (typeof v !== "string") return undefined;
  const raw = v.toLowerCase().trim();
  const s = raw.replace(/[\s_]+/g, "-");
  const direct = categories.find((c) => c.id === s || c.label.toLowerCase() === raw);
  if (direct) return direct.id;
  // Fuzzy-match common wordings onto the built-in ids, but only accept the
  // guess when that category still exists in the configured list.
  let guess: string | undefined;
  if (/extract|split|decompos|modulariz/.test(s)) guess = "extract";
  else if (/renam|naming/.test(s)) guess = "rename";
  else if (/dead|unused|remove|delete|cleanup|clean-up/.test(s)) guess = "dead-code";
  else if (/dep|upgrade|version|librar|package|vendor/.test(s)) guess = "dependency";
  else if (/perf|speed|optimi|memory|latency/.test(s)) guess = "performance";
  else if (/test|coverage|spec/.test(s)) guess = "test";
  else if (/arch|structur|pattern|design|migrat|api/.test(s)) guess = "architecture";
  else if (/style|format|lint|convention|consisten/.test(s)) guess = "style";
  return guess && categories.some((c) => c.id === guess) ? guess : undefined;
}

function normalizeStage(v: unknown, projectType?: ProjectType): Stage | undefined {
  if (typeof v !== "string") return undefined;
  const s = v
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");
  if (projectType === "plan") {
    if (["idea", "ideas", "backlog", "queued"].includes(s)) return "queued";
    if (["planning", "shaping", "active", "in-progress"].includes(s)) return "active";
    if (["ready", "committed", "reviewing", "review"].includes(s)) return "reviewing";
    if (["done", "delivered", "complete", "completed", "deployed"].includes(s)) return "deployed";
    if (["on-hold", "deferred", "parked"].includes(s)) return "deferred";
  }
  if (["queued", "triage", "new", "inbox", "backlog", "todo", "open", "pending", "scoped", "ready", "planned", "analyzed", "groomed", "assessed"].includes(s)) return "queued";
  if (["active", "refactor", "refactoring", "in-progress", "inprogress", "doing", "started", "wip"].includes(s)) return "active";
  if (["reviewing", "review", "in-review", "verify", "verifying", "testing", "qa", "validation"].includes(s)) return "reviewing";
  if (["deployed", "landed", "done", "complete", "completed", "merged", "closed", "shipped", "finished", "released"].includes(s)) return "deployed";
  if (["deferred", "parked", "on-hold", "hold", "wontfix", "icebox", "later", "someday", "shelved"].includes(s)) return "deferred";
  return undefined;
}

/** Find the array of candidate task objects inside arbitrary parsed JSON. */
export function extractCandidates(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of CONTAINER_KEYS) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    // fall back to the first array-of-objects value found
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object")) return v;
    }
    // single object that looks like an item
    if (typeof obj.title === "string" || typeof obj.name === "string" || typeof obj.summary === "string") {
      return [obj];
    }
  }
  return undefined;
}

export function parseRefactorJson(text: string, categories: CategoryDef[] = CODING_CATEGORIES, fallbackType?: ProjectType): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return {rows: [], sourceCount: 0, fileError: `Not valid JSON — ${(e as Error).message}`};
  }

  const candidates = extractCandidates(data);
  if (!candidates) {
    return {
      rows: [],
      sourceCount: 0,
      fileError: 'No work items found. Expected a JSON array of items, or an object with an "items" / "tasks" array.',
    };
  }
  if (candidates.length === 0) {
    return {rows: [], sourceCount: 0, fileError: "The file parsed correctly but contains zero items."};
  }

  // A Chisel export carries its own `categories` list; merge those in so items
  // referencing custom categories resolve instead of falling back to "Other".
  const container = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined;
  const importedCategories = container ? parseCategoryDefs(container.categories) : [];
  const knownCategories = mergeCategories(categories, importedCategories);
  const projectType = (container ? normalizeProjectType(container.type ?? container.projectType ?? container.board) : undefined) ?? fallbackType;

  const now = Date.now();
  const rows: ParsedRow[] = candidates.map((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {ok: false, index, errors: ["Item is not a JSON object"], warnings};
    }
    const obj = raw as Record<string, unknown>;

    const title = firstString(obj, ["title", "name", "summary", "task", "label"]);
    if (!title) errors.push('Missing a title (looked for "title", "name", "summary")');

    const description = firstString(obj, ["description", "details", "body", "rationale", "why", "notes_text"]) ?? "";

    const files = [...toStringArray(obj.files), ...toStringArray(obj.file), ...toStringArray(obj.paths), ...toStringArray(obj.path), ...toStringArray(obj.locations), ...toStringArray(obj.modules)];

    let risk = normalizeRisk(obj.risk ?? obj.severity ?? obj.danger ?? obj.impact ?? obj.priority);
    if (!risk) {
      risk = "medium";
      if (obj.risk !== undefined || obj.severity !== undefined || obj.priority !== undefined) {
        warnings.push(`Unrecognized risk/priority value ${JSON.stringify(obj.risk ?? obj.severity ?? obj.priority)} — defaulted to medium`);
      }
    }

    let effort = normalizeEffort(obj.effort ?? obj.size ?? obj.estimate ?? obj.points ?? obj.complexity);
    if (!effort) effort = "medium";

    let category = normalizeCategory(obj.category ?? obj.type ?? obj.kind ?? obj.refactor_type, knownCategories);
    if (!category) {
      const rawCat = obj.category ?? obj.type ?? obj.kind;
      if (typeof rawCat === "string" && rawCat.trim()) {
        warnings.push(`Unrecognized category "${rawCat}" — filed under Other`);
      }
      category = FALLBACK_CATEGORY_ID;
    }

    const stage = normalizeStage(obj.status ?? obj.stage ?? obj.state, projectType) ?? "queued";

    const tags = [...toStringArray(obj.tags), ...toStringArray(obj.labels)].map((t) => t.toLowerCase().replace(/\s+/g, "-"));

    const importedReason = firstString(obj, ["blocked_reason", "blockReason", "blocker"]) ?? "";
    const importedBlocked = obj.blocked === true || importedReason !== "";
    const notes: Note[] = parseNotes(obj.notes, now);
    if (importedBlocked && !notes.some((n) => n.blocked && !n.resolved)) {
      notes.push({id: uid(), text: importedReason || "Blocked", createdAt: now, blocked: true});
    }

    if (errors.length > 0) return {ok: false, index, errors, warnings};

    const parentIds = toStringArray(obj.parentIds ?? obj.parent_ids ?? obj.parents);
    const item: WorkItem = {
      id: uid(),
      title: title!,
      description,
      files: [...new Set(files)],
      risk,
      effort,
      category,
      tags: [...new Set(tags)],
      stage,
      ...blockedFrom(notes),
      notes,
      parentIds: [...new Set(parentIds)],
      createdAt: now,
      updatedAt: now,
    };
    return {ok: true, index, item, errors, warnings};
  });

  return {rows, sourceCount: candidates.length, categories: importedCategories, projectType};
}
