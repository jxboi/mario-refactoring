import type {CategoryDef, CategoryGroup, Note, Project, Task} from "../types";
import {uid} from "../types";
import type {AppState, Workspace} from "./store";
import type {Skill} from "./skills";

export type ActivityFamily = "status" | "updates" | "notes" | "organization";
export type ActivityEntity = "workspace" | "project" | "task" | "note" | "category" | "category-group" | "skill";

export interface ActivityChange { field:string; before?:string; after?:string; }
export interface ActivityEvent {
  id:string; workspaceId:string; projectId:string|null; projectTitle?:string; entityType:ActivityEntity; entityId:string;
  entityTitle:string; family:ActivityFamily; action:string; summary:string; changes:ActivityChange[];
  occurredAt:number; deleted?:boolean; coalesceKey?:string;
}
export interface ActivitySummary { today:number; thisWeek:number; itemsTouched:number; }
export interface ActivityProjectOption { id:string; title:string; deleted?:boolean; }
export interface ActivityPage { events:ActivityEvent[]; nextCursor:string|null; projects:ActivityProjectOption[]; summary:ActivitySummary; }
export interface ActivityFilters { query:string; projectId:string|null; family:ActivityFamily|null; }

const title = (value:string, fallback:string) => value.trim() || fallback;
const stringify = (value:unknown) => Array.isArray(value) ? value.join(", ") : String(value ?? "");
const event = (input:Omit<ActivityEvent,"id"|"occurredAt">, occurredAt:number):ActivityEvent => ({...input,id:`act-${uid()}`,occurredAt});
const change = (field:string,before:unknown,after:unknown):ActivityChange => ({field,before:stringify(before),after:stringify(after)});
const sameIds = <T extends{id:string}>(a:T[],b:T[]) => a.length===b.length&&a.every(x=>b.some(y=>y.id===x.id));

function baseChanges(before:Project|Task,after:Project|Task):ActivityChange[] {
  const changes:ActivityChange[]=[];
  for(const field of ["title","risk","effort","tags"] as const) if(stringify(before[field])!==stringify(after[field])) changes.push(change(field,before[field],after[field]));
  if("category" in before&&"category" in after&&before.category!==after.category)changes.push(change("category",before.category,after.category));
  if(before.description!==after.description)changes.push({field:"description"});
  return changes;
}

function noteEvents(workspaceId:string,projectId:string,projectTitle:string,entity:Project|Task,before:Note[],after:Note[],now:number):ActivityEvent[]{
  const out:ActivityEvent[]=[];const entityType="category" in entity?"task":"project";const entityTitle=title(entity.title,entityType==="task"?"Untitled task":"Untitled project");
  for(const note of after.filter(n=>!before.some(x=>x.id===n.id)))out.push(event({workspaceId,projectId,projectTitle,entityType:"note",entityId:note.id,entityTitle,family:"notes",action:"note.added",summary:`Added a note to ${entityTitle}`,changes:[]},now));
  for(const note of before.filter(n=>!after.some(x=>x.id===n.id)))out.push(event({workspaceId,projectId,projectTitle,entityType:"note",entityId:note.id,entityTitle,family:"notes",action:"note.deleted",summary:`Removed a note from ${entityTitle}`,changes:[],deleted:true},now));
  for(const old of before){const next=after.find(n=>n.id===old.id);if(!next)continue;
    if(old.text!==next.text)out.push(event({workspaceId,projectId,projectTitle,entityType:"note",entityId:old.id,entityTitle,family:"notes",action:"note.edited",summary:`Edited a note on ${entityTitle}`,changes:[{field:"note"}],coalesceKey:`${workspaceId}:${old.id}:note`},now));
    if(Boolean(old.blocked)!==Boolean(next.blocked))out.push(event({workspaceId,projectId,projectTitle,entityType:"note",entityId:old.id,entityTitle,family:"notes",action:next.blocked?"note.blocked":"note.unblocked",summary:`${next.blocked?"Marked":"Unmarked"} a note as blocking on ${entityTitle}`,changes:[]},now));
    if(Boolean(old.resolved)!==Boolean(next.resolved))out.push(event({workspaceId,projectId,projectTitle,entityType:"note",entityId:old.id,entityTitle,family:"notes",action:next.resolved?"note.resolved":"note.reopened",summary:`${next.resolved?"Resolved":"Reopened"} a note on ${entityTitle}`,changes:[]},now));
  }return out;
}

function taskEvents(workspaceId:string,project:Project,before:Task[],after:Task[],now:number):ActivityEvent[]{
  const projectTitle=title(project.title,"Untitled project");
  const out:ActivityEvent[]=[];
  for(const task of after.filter(t=>!before.some(x=>x.id===t.id)))out.push(event({workspaceId,projectId:project.id,projectTitle,entityType:"task",entityId:task.id,entityTitle:title(task.title,"Untitled task"),family:"organization",action:"task.created",summary:`Created task ${title(task.title,"Untitled task")}`,changes:[]},now));
  for(const task of before.filter(t=>!after.some(x=>x.id===t.id)))out.push(event({workspaceId,projectId:project.id,projectTitle,entityType:"task",entityId:task.id,entityTitle:title(task.title,"Untitled task"),family:"organization",action:"task.deleted",summary:`Deleted task ${title(task.title,"Untitled task")}`,changes:[],deleted:true},now));
  const canCompareOrder=sameIds(before,after);
  for(const old of before){const next=after.find(t=>t.id===old.id);if(!next)continue;const entityTitle=title(next.title,"Untitled task");
    if(old.stage!==next.stage)out.push(event({workspaceId,projectId:project.id,projectTitle,entityType:"task",entityId:next.id,entityTitle,family:"status",action:"task.stage",summary:`Moved ${entityTitle}`,changes:[change("status",old.stage,next.stage)]},now));
    const changes=baseChanges(old,next);if(changes.length)out.push(event({workspaceId,projectId:project.id,projectTitle,entityType:"task",entityId:next.id,entityTitle,family:"updates",action:"task.updated",summary:`Updated ${entityTitle}`,changes,coalesceKey:changes.every(c=>c.field==="title"||c.field==="description")?`${workspaceId}:${next.id}:content`:undefined},now));
    out.push(...noteEvents(workspaceId,project.id,projectTitle,next,old.notes,next.notes,now));
    if(canCompareOrder&&old.stage===next.stage&&before.filter(t=>t.stage===old.stage).findIndex(t=>t.id===old.id)!==after.filter(t=>t.stage===next.stage).findIndex(t=>t.id===next.id))out.push(event({workspaceId,projectId:project.id,projectTitle,entityType:"task",entityId:next.id,entityTitle,family:"organization",action:"task.reordered",summary:`Reordered ${entityTitle} in ${next.stage}`,changes:[]},now));
  }return out;
}

function projectEvents(workspaceId:string,before:Project[],after:Project[],now:number):ActivityEvent[]{
  const out:ActivityEvent[]=[];
  for(const project of after.filter(p=>!before.some(x=>x.id===p.id)))out.push(event({workspaceId,projectId:project.id,projectTitle:title(project.title,"Untitled project"),entityType:"project",entityId:project.id,entityTitle:title(project.title,"Untitled project"),family:"organization",action:"project.created",summary:`Created project ${title(project.title,"Untitled project")}`,changes:[]},now));
  for(const project of before.filter(p=>!after.some(x=>x.id===p.id)))out.push(event({workspaceId,projectId:project.id,projectTitle:title(project.title,"Untitled project"),entityType:"project",entityId:project.id,entityTitle:title(project.title,"Untitled project"),family:"organization",action:"project.deleted",summary:`Deleted project ${title(project.title,"Untitled project")} with ${project.tasks.length} task${project.tasks.length===1?"":"s"}`,changes:[],deleted:true},now));
  for(const old of before){const next=after.find(p=>p.id===old.id);if(!next)continue;const entityTitle=title(next.title,"Untitled project");
    if(old.stage!==next.stage)out.push(event({workspaceId,projectId:next.id,projectTitle:entityTitle,entityType:"project",entityId:next.id,entityTitle,family:"status",action:"project.stage",summary:`Moved ${entityTitle}`,changes:[change("status",old.stage,next.stage)]},now));
    const changes=baseChanges(old,next);if(changes.length)out.push(event({workspaceId,projectId:next.id,projectTitle:entityTitle,entityType:"project",entityId:next.id,entityTitle,family:"updates",action:"project.updated",summary:`Updated ${entityTitle}`,changes,coalesceKey:changes.every(c=>c.field==="title"||c.field==="description")?`${workspaceId}:${next.id}:content`:undefined},now));
    out.push(...noteEvents(workspaceId,next.id,entityTitle,next,old.notes,next.notes,now),...taskEvents(workspaceId,next,old.tasks,next.tasks,now));
  }return out;
}

function collectionEvents<T extends{id:string;label?:string;name?:string;groupId?:string;glyph?:string;description?:string;body?:string}>(workspaceId:string,kind:"category"|"category-group"|"skill",before:T[],after:T[],now:number):ActivityEvent[]{
  const out:ActivityEvent[]=[];const label=(x:T)=>title(x.label??x.name??"",kind==="skill"?"Untitled skill":"Untitled category");
  for(const item of after.filter(x=>!before.some(y=>y.id===x.id)))out.push(event({workspaceId,projectId:null,entityType:kind,entityId:item.id,entityTitle:label(item),family:"organization",action:`${kind}.created`,summary:`Created ${kind.replace("-"," ")} ${label(item)}`,changes:[]},now));
  for(const item of before.filter(x=>!after.some(y=>y.id===x.id)))out.push(event({workspaceId,projectId:null,entityType:kind,entityId:item.id,entityTitle:label(item),family:"organization",action:`${kind}.deleted`,summary:`Deleted ${kind.replace("-"," ")} ${label(item)}`,changes:[],deleted:true},now));
  for(const old of before){const next=after.find(x=>x.id===old.id);if(!next)continue;const changes:ActivityChange[]=[];
    for(const field of ["label","name","groupId","glyph","description"] as const)if(stringify(old[field])!==stringify(next[field]))changes.push(field==="description"?{field}:change(field,old[field],next[field]));
    if(old.body!==next.body)changes.push({field:"body"});
    if(changes.length)out.push(event({workspaceId,projectId:null,entityType:kind,entityId:next.id,entityTitle:label(next),family:"organization",action:`${kind}.updated`,summary:`Updated ${kind.replace("-"," ")} ${label(next)}`,changes,coalesceKey:kind==="skill"&&changes.every(c=>["name","description","body"].includes(c.field))?`${workspaceId}:${next.id}:skill-content`:undefined},now));
  }
  if(sameIds(before,after)&&before.map(x=>x.id).join()!==after.map(x=>x.id).join())out.push(event({workspaceId,projectId:null,entityType:kind,entityId:workspaceId,entityTitle:"Workspace",family:"organization",action:`${kind}.reordered`,summary:`Reordered ${kind.replace("-"," ")}s`,changes:[]},now));
  return out;
}

function workspaceEvents(before:Workspace,after:Workspace,now:number):ActivityEvent[]{const out:ActivityEvent[]=[];
  if(before.name!==after.name)out.push(event({workspaceId:after.id,projectId:null,entityType:"workspace",entityId:after.id,entityTitle:after.name,family:"organization",action:"workspace.renamed",summary:"Renamed the workspace",changes:[change("name",before.name,after.name)]},now));
  out.push(...projectEvents(after.id,before.projects,after.projects,now));
  out.push(...collectionEvents<CategoryDef>(after.id,"category",before.categories,after.categories,now));
  out.push(...collectionEvents<CategoryGroup>(after.id,"category-group",before.categoryGroups,after.categoryGroups,now));
  out.push(...collectionEvents<Skill>(after.id,"skill",before.skills,after.skills,now));return out;}

export function deriveActivityEvents(previous:AppState,next:AppState,now=Date.now()):ActivityEvent[]{const out:ActivityEvent[]=[];
  for(const workspace of next.workspaces.filter(w=>!previous.workspaces.some(x=>x.id===w.id)))out.push(event({workspaceId:workspace.id,projectId:null,entityType:"workspace",entityId:workspace.id,entityTitle:workspace.name,family:"organization",action:"workspace.created",summary:`Created workspace ${workspace.name}`,changes:[]},now));
  for(const before of previous.workspaces){const after=next.workspaces.find(w=>w.id===before.id);if(after)out.push(...workspaceEvents(before,after,now));}
  return out;
}

export function coalesceActivity(events:ActivityEvent[],windowMs=120000):ActivityEvent[]{const result:ActivityEvent[]=[];
  for(const current of [...events].sort((a,b)=>b.occurredAt-a.occurredAt)){const newer=result[result.length-1];
    if(current.coalesceKey&&newer?.coalesceKey===current.coalesceKey&&newer.occurredAt-current.occurredAt<=windowMs){const fields=new Map(newer.changes.map(c=>[c.field,{...c}]));for(const old of current.changes){const existing=fields.get(old.field);fields.set(old.field,{field:old.field,before:old.before,after:existing?.after??old.after});}newer.changes=[...fields.values()];continue;}result.push({...current,changes:current.changes.map(c=>({...c}))});
  }return result;
}

export function activitySearchText(item:ActivityEvent):string{return [item.summary,item.entityTitle,item.family,item.action,...item.changes.flatMap(c=>[c.field,c.before,c.after])].filter(Boolean).join(" ").toLowerCase();}
