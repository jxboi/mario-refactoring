import type {AlertPage, TaskReminder} from "./reminders";

interface TaskRef { workspaceId:string; projectId:string; taskId:string; }
interface ReminderCacheEntry{reminders:Map<string,TaskReminder>;updatedAt:number;promise?:Promise<TaskReminder[]>}
const reminderCache=new Map<string,ReminderCacheEntry>(),CACHE_MS=30000;
const projectKey=(workspaceId:string,projectId:string)=>`${workspaceId}:${projectId}`;
export function clearReminderCache():void{reminderCache.clear()}

async function request<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{...init,headers:{Accept:"application/json",...(init?.body?{"Content-Type":"application/json"}:{}),...(init?.headers??{})}});
  if(response.status===204)return undefined as T;
  const data=await response.json().catch(()=>null) as ({error?:string}&T)|null;
  if(!response.ok)throw new Error(data?.error||`Reminder request failed (${response.status}).`);
  return data as T;
}

export function getCachedTaskReminder(ref:TaskRef):TaskReminder|null|undefined{
  const entry=reminderCache.get(projectKey(ref.workspaceId,ref.projectId));
  if(!entry||Date.now()-entry.updatedAt>CACHE_MS)return undefined;
  return entry.reminders.get(ref.taskId)??null;
}
export function setCachedTaskReminder(ref:TaskRef,reminder:TaskReminder):void{const key=projectKey(ref.workspaceId,ref.projectId),entry=reminderCache.get(key)??{reminders:new Map<string,TaskReminder>(),updatedAt:Date.now()};entry.reminders.set(ref.taskId,reminder);entry.updatedAt=Date.now();reminderCache.set(key,entry)}

export async function prefetchProjectReminders(workspaceId:string,projectId:string,force=false):Promise<TaskReminder[]>{
  const key=projectKey(workspaceId,projectId),existing=reminderCache.get(key);
  if(!force&&existing&&Date.now()-existing.updatedAt<CACHE_MS)return[...existing.reminders.values()];
  if(existing?.promise)return existing.promise;
  const params=new URLSearchParams({workspaceId,projectId});
  const promise=request<{reminders:TaskReminder[]}>(`/api/reminders?${params}`).then(result=>{reminderCache.set(key,{reminders:new Map(result.reminders.map(item=>[item.taskId,item])),updatedAt:Date.now()});return result.reminders}).catch(error=>{if(existing)reminderCache.set(key,existing);else reminderCache.delete(key);throw error});
  reminderCache.set(key,{reminders:existing?.reminders??new Map(),updatedAt:existing?.updatedAt??0,promise});
  return promise;
}

export async function fetchTaskReminder(ref:TaskRef):Promise<TaskReminder|null>{
  const cached=getCachedTaskReminder(ref);if(cached!==undefined)return cached;
  await prefetchProjectReminders(ref.workspaceId,ref.projectId);
  return getCachedTaskReminder(ref)??null;
}

export async function saveTaskReminder(ref:TaskRef,remindAt:string):Promise<TaskReminder>{
  const reminder=(await request<{reminder:TaskReminder}>("/api/reminders",{method:"PUT",body:JSON.stringify({...ref,remindAt})})).reminder;
  setCachedTaskReminder(ref,reminder);
  return reminder;
}

export async function deleteTaskReminder(ref:TaskRef):Promise<void>{
  await request("/api/reminders",{method:"DELETE",body:JSON.stringify(ref)});
  clearCachedTaskReminder(ref);
}

export function clearCachedTaskReminder(ref:TaskRef):void{const entry=reminderCache.get(projectKey(ref.workspaceId,ref.projectId));if(entry){entry.reminders.delete(ref.taskId);entry.updatedAt=Date.now()}}

export async function fetchAlerts(cursor?:string|null,limit=25):Promise<AlertPage>{
  const params=new URLSearchParams({limit:String(limit)});if(cursor)params.set("cursor",cursor);
  return request<AlertPage>(`/api/alerts?${params}`);
}

export async function markAlertRead(alertId:string):Promise<void>{
  await request("/api/alerts",{method:"PATCH",body:JSON.stringify({action:"read",alertId})});
}

export async function markAllAlertsRead():Promise<void>{
  await request("/api/alerts",{method:"PATCH",body:JSON.stringify({action:"read-all"})});
}
