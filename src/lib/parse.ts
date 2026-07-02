import type { Category, Effort, RefactorItem, Risk, Stage } from '../types';
import { CATEGORIES, uid } from '../types';

export interface ParsedRow {
  ok: boolean;
  index: number;
  item?: RefactorItem;
  errors: string[];
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  fileError?: string;
  sourceCount: number;
}

const CONTAINER_KEYS = ['items', 'tasks', 'refactorings', 'refactors', 'entries', 'issues', 'backlog', 'data'];

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
  if (typeof v === 'string' && v.trim()) return v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function normalizeRisk(v: unknown): Risk | undefined {
  if (typeof v === 'number') return v <= 1 ? 'low' : v === 2 ? 'medium' : 'high';
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase().trim();
  if (['low', 'l', 'minor', 'safe', 'green', '1'].includes(s)) return 'low';
  if (['medium', 'med', 'm', 'moderate', 'yellow', 'amber', '2'].includes(s)) return 'medium';
  if (['high', 'h', 'critical', 'severe', 'major', 'red', 'risky', 'dangerous', '3', '4', '5'].includes(s)) return 'high';
  return undefined;
}

function normalizeEffort(v: unknown): Effort | undefined {
  if (typeof v === 'number') {
    if (v <= 1) return 'xs';
    if (v <= 2) return 's';
    if (v <= 3) return 'm';
    if (v <= 5) return 'l';
    return 'xl';
  }
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase().trim();
  if (['xs', 'trivial', 'tiny', 'hours', 'hour'].includes(s)) return 'xs';
  if (['s', 'small', 'day', 'easy'].includes(s)) return 's';
  if (['m', 'medium', 'med', 'days', 'moderate'].includes(s)) return 'm';
  if (['l', 'large', 'week', 'hard'].includes(s)) return 'l';
  if (['xl', 'xxl', 'huge', 'weeks', 'epic', 'month'].includes(s)) return 'xl';
  return undefined;
}

function normalizeCategory(v: unknown): Category | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase().trim().replace(/[\s_]+/g, '-');
  const direct = CATEGORIES.find((c) => c.id === s);
  if (direct) return direct.id;
  if (/extract|split|decompos|modulariz/.test(s)) return 'extract';
  if (/renam|naming/.test(s)) return 'rename';
  if (/dead|unused|remove|delete|cleanup|clean-up/.test(s)) return 'dead-code';
  if (/dep|upgrade|version|librar|package|vendor/.test(s)) return 'dependency';
  if (/perf|speed|optimi|memory|latency/.test(s)) return 'performance';
  if (/test|coverage|spec/.test(s)) return 'test';
  if (/arch|structur|pattern|design|migrat|api/.test(s)) return 'architecture';
  if (/style|format|lint|convention|consisten/.test(s)) return 'style';
  return undefined;
}

function normalizeStage(v: unknown): Stage | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (['triage', 'new', 'inbox', 'backlog', 'todo', 'open', 'pending'].includes(s)) return 'triage';
  if (['scoped', 'ready', 'planned', 'analyzed', 'groomed', 'assessed'].includes(s)) return 'scoped';
  if (['refactor', 'refactoring', 'in-progress', 'inprogress', 'doing', 'active', 'started', 'wip'].includes(s)) return 'refactor';
  if (['verify', 'verifying', 'review', 'in-review', 'testing', 'qa', 'validation'].includes(s)) return 'verify';
  if (['landed', 'done', 'complete', 'completed', 'merged', 'closed', 'shipped', 'finished'].includes(s)) return 'landed';
  return undefined;
}

/** Find the array of candidate task objects inside arbitrary parsed JSON. */
export function extractCandidates(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of CONTAINER_KEYS) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    // fall back to the first array-of-objects value found
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object')) return v;
    }
    // single object that looks like an item
    if (typeof obj.title === 'string' || typeof obj.name === 'string' || typeof obj.summary === 'string') {
      return [obj];
    }
  }
  return undefined;
}

export function parseRefactorJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { rows: [], sourceCount: 0, fileError: `Not valid JSON — ${(e as Error).message}` };
  }

  const candidates = extractCandidates(data);
  if (!candidates) {
    return {
      rows: [],
      sourceCount: 0,
      fileError:
        'No refactoring items found. Expected a JSON array of items, or an object with an "items" / "tasks" / "refactorings" array.',
    };
  }
  if (candidates.length === 0) {
    return { rows: [], sourceCount: 0, fileError: 'The file parsed correctly but contains zero items.' };
  }

  const now = Date.now();
  const rows: ParsedRow[] = candidates.map((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, index, errors: ['Item is not a JSON object'], warnings };
    }
    const obj = raw as Record<string, unknown>;

    const title = firstString(obj, ['title', 'name', 'summary', 'task', 'label']);
    if (!title) errors.push('Missing a title (looked for "title", "name", "summary")');

    const description =
      firstString(obj, ['description', 'details', 'body', 'rationale', 'why', 'notes_text']) ?? '';

    const files = [
      ...toStringArray(obj.files),
      ...toStringArray(obj.file),
      ...toStringArray(obj.paths),
      ...toStringArray(obj.path),
      ...toStringArray(obj.locations),
      ...toStringArray(obj.modules),
    ];

    let risk = normalizeRisk(obj.risk ?? obj.severity ?? obj.danger ?? obj.impact);
    if (!risk) {
      risk = 'medium';
      if (obj.risk !== undefined || obj.severity !== undefined) {
        warnings.push(`Unrecognized risk value ${JSON.stringify(obj.risk ?? obj.severity)} — defaulted to medium`);
      }
    }

    let effort = normalizeEffort(obj.effort ?? obj.size ?? obj.estimate ?? obj.points ?? obj.complexity);
    if (!effort) effort = 'm';

    let category = normalizeCategory(obj.category ?? obj.type ?? obj.kind ?? obj.refactor_type);
    if (!category) {
      const rawCat = obj.category ?? obj.type ?? obj.kind;
      if (typeof rawCat === 'string' && rawCat.trim()) {
        warnings.push(`Unrecognized category "${rawCat}" — filed under Other`);
      }
      category = 'other';
    }

    const stage = normalizeStage(obj.status ?? obj.stage ?? obj.state) ?? 'triage';

    const tags = [...toStringArray(obj.tags), ...toStringArray(obj.labels)].map((t) =>
      t.toLowerCase().replace(/\s+/g, '-'),
    );

    const blockReason = firstString(obj, ['blocked_reason', 'blockReason', 'blocker']) ?? '';
    const blocked = obj.blocked === true || blockReason !== '';

    if (errors.length > 0) return { ok: false, index, errors, warnings };

    const item: RefactorItem = {
      id: uid(),
      title: title!,
      description,
      files: [...new Set(files)],
      risk,
      effort,
      category,
      tags: [...new Set(tags)],
      stage,
      blocked,
      blockReason,
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    return { ok: true, index, item, errors, warnings };
  });

  return { rows, sourceCount: candidates.length };
}
