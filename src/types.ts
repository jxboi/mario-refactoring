export const STAGES = ["to-do", "in-progress", "review", "done", "on-hold"] as const;
export type Stage = typeof STAGES[number];
const LEGACY_STAGE_IDS:Record<string,Stage>={queued:"to-do",todo:"to-do","to_do":"to-do",active:"in-progress","in_progress":"in-progress",reviewing:"review",deployed:"done",deferred:"on-hold","on_hold":"on-hold"};
export function stageFrom(value:unknown):Stage|undefined{return typeof value!=="string"?undefined:(STAGES as readonly string[]).includes(value)?value as Stage:LEGACY_STAGE_IDS[value]}
export type TaskLayout = "board" | "list";
export type Risk = "low" | "medium" | "high";
export type Effort = "low" | "medium" | "high";
export type Category = string;
export type NoteColor = "neutral" | "red" | "orange" | "green" | "blue" | "purple";

export interface Note { id: string; text: string; createdAt: number; color?: NoteColor; }
export interface BaseItem {
  id: string; title: string; description: string; risk: Risk; effort: Effort;
  tags: string[]; stage: Stage; notes: Note[];
  createdAt: number; updatedAt: number;
}
export interface TaskAssignee { userId:string; login:string; name:string|null; avatarUrl:string; }
export interface Task extends BaseItem { category: Category; assignee?:TaskAssignee|null; favourite?:boolean; }
export interface ProjectCollaboration {
  shareId: string;
  ownerId: string;
  ownerLogin: string;
  role: "owner" | "editor";
  version: number;
}
export interface Project extends BaseItem { tasks: Task[]; collaboration?: ProjectCollaboration; }

export type StageGroup = "backlog" | "active" | "done" | "deferred";
export interface StageDef { id: Stage; label: string; hint: string; group: StageGroup; recentDays?: number; hiddenByDefault?: boolean; }
export const DEPLOYED_WINDOW_DAYS = 7;
export const PROJECT_STAGES: StageDef[] = [
  {id:"to-do",label:"Idea",hint:"An opportunity worth considering",group:"backlog"},
  {id:"in-progress",label:"Planning",hint:"Defining the outcome and approach",group:"active"},
  {id:"review",label:"Ready",hint:"Ready to assign",group:"active"},
  {id:"done",label:"Done",hint:"The outcome is complete",group:"done"},
  {id:"on-hold",label:"On hold",hint:"Parked for now",group:"deferred",hiddenByDefault:true},
];
export const TASK_STAGES: StageDef[] = [
  {id:"to-do",label:"To do",hint:"Waiting to be picked up",group:"backlog"},
  {id:"in-progress",label:"In progress",hint:"Being worked on",group:"active"},
  {id:"review",label:"Review",hint:"Checks and sign-off",group:"active"},
  {id:"done",label:"Done",hint:"Completed recently",group:"done",recentDays:DEPLOYED_WINDOW_DAYS},
  {id:"on-hold",label:"On hold",hint:"Parked for now",group:"deferred",hiddenByDefault:true},
];
export const RISKS: Risk[] = ["low","medium","high"];
export const RISK_LABELS: Record<Risk,string> = {low:"low",medium:"med",high:"high"};
export const EFFORTS: Effort[] = ["low","medium","high"];
export const EFFORT_LABELS: Record<Effort,string> = {low:"Low",medium:"Med",high:"High"};
export interface CategoryDef { id:string; label:string; glyph:string; groupId:string; }
export interface CategoryGroup { id:string; label:string; }
export const FALLBACK_CATEGORY_ID = "other";
export const CATEGORY_GROUPS: CategoryGroup[] = [
  {id:"planning",label:"Planning"},{id:"work",label:"Work"},{id:"general",label:"General"},
];
export const TASK_CATEGORIES: CategoryDef[] = [
  {id:"goal",label:"Goal",glyph:"◎",groupId:"planning"},{id:"initiative",label:"Initiative",glyph:"◆",groupId:"planning"},{id:"feature",label:"Feature",glyph:"✦",groupId:"planning"},
  {id:"improvement",label:"Improvement",glyph:"↗",groupId:"work"},{id:"request",label:"Request",glyph:"✉",groupId:"work"},{id:"incident",label:"Incident",glyph:"⚠",groupId:"work"},{id:"bug",label:"Bug",glyph:"❢",groupId:"work"},
  {id:"follow-up",label:"Follow up",glyph:"↻",groupId:"work"},{id:"documentation",label:"Documentation",glyph:"❏",groupId:"work"},{id:"design",label:"Design",glyph:"✐",groupId:"work"},{id:"question",label:"Question",glyph:"?",groupId:"work"},
  {id:"research",label:"Research",glyph:"⌕",groupId:"general"},{id:"other",label:"Other",glyph:"·",groupId:"general"},
];
export type ItemKind = "project" | "task";
export interface ItemConfig { kind:ItemKind; label:string; itemNoun:string; itemNounPlural:string; stages:StageDef[]; categories:CategoryDef[]; metricLabel:string; descriptionLabel:string; descriptionPlaceholder:string; schema:string; }
export const PROJECT_CONFIG: ItemConfig = {kind:"project",label:"Project",itemNoun:"project",itemNounPlural:"projects",stages:PROJECT_STAGES,categories:[],metricLabel:"Priority",descriptionLabel:"Outcome & context",descriptionPlaceholder:"What outcome are we aiming for, and why does it matter?",schema:'[{"title":"Improve onboarding","priority":"high","status":"in-progress"}]'};
export const TASK_CONFIG: ItemConfig = {kind:"task",label:"Task",itemNoun:"task",itemNounPlural:"tasks",stages:TASK_STAGES,categories:TASK_CATEGORIES,metricLabel:"Priority",descriptionLabel:"Details",descriptionPlaceholder:"What needs to happen, and any context?",schema:'[{"title":"Confirm rollout date","priority":"high","status":"to-do"}]'};
export function categoryMeta(id:string,categories:CategoryDef[]):CategoryDef { return categories.find(c=>c.id===id) ?? categories.find(c=>c.id===FALLBACK_CATEGORY_ID) ?? {id:"other",label:"Other",glyph:"·",groupId:"general"}; }
export function slugifyCategory(label:string):string { return label.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "category"; }
export function uid():string { return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4); }
