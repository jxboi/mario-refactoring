export type Stage = 'triage' | 'scoped' | 'refactor' | 'verify' | 'landed';

export type Risk = 'low' | 'medium' | 'high';

export type Effort = 'xs' | 's' | 'm' | 'l' | 'xl';

export type Category =
  | 'extract'
  | 'rename'
  | 'dead-code'
  | 'dependency'
  | 'performance'
  | 'test'
  | 'architecture'
  | 'style'
  | 'other';

export interface Note {
  id: string;
  text: string;
  createdAt: number;
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

export type StageGroup = 'backlog' | 'active' | 'done';

export const STAGES: { id: Stage; label: string; hint: string; group: StageGroup }[] = [
  { id: 'triage', label: 'Triage', hint: 'Imported, not yet assessed', group: 'backlog' },
  { id: 'scoped', label: 'Scoped', hint: 'Risk assessed, ready to start', group: 'backlog' },
  { id: 'refactor', label: 'Refactoring', hint: 'Actively being reworked', group: 'active' },
  { id: 'verify', label: 'Verifying', hint: 'Tests, review, canary', group: 'active' },
  { id: 'landed', label: 'Landed', hint: 'Merged and done', group: 'done' },
];

export const RISKS: Risk[] = ['low', 'medium', 'high'];

export const EFFORTS: Effort[] = ['xs', 's', 'm', 'l', 'xl'];

export const CATEGORIES: { id: Category; label: string; glyph: string }[] = [
  { id: 'extract', label: 'Extract', glyph: '⤴' },
  { id: 'rename', label: 'Rename', glyph: '✎' },
  { id: 'dead-code', label: 'Dead code', glyph: '✂' },
  { id: 'dependency', label: 'Dependency', glyph: '⬡' },
  { id: 'performance', label: 'Performance', glyph: '⚡' },
  { id: 'test', label: 'Tests', glyph: '✓' },
  { id: 'architecture', label: 'Architecture', glyph: '▦' },
  { id: 'style', label: 'Style', glyph: '❖' },
  { id: 'other', label: 'Other', glyph: '·' },
];

export function categoryMeta(id: Category) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
