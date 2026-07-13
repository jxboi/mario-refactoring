import type {ActivityEvent,ActivityFamily,ActivityPage,ActivityProjectOption,ActivitySummary} from "./activity";
import {activitySearchText,coalesceActivity,deriveActivityEvents} from "./activity";
import {normalizeAppState,type AppState} from "./store";

const DB_NAME="chisel.activity.v1",STORE="events",CHANGE_EVENT="chisel:activity-changed";
const workspaceCache=new Map<string,ActivityEvent[]>();
const workspaceLoads=new Map<string,Promise<ActivityEvent[]>>();
let databasePromise:Promise<IDBDatabase>|null=null;

function openDb():Promise<IDBDatabase>{
  if(databasePromise)return databasePromise;
  databasePromise=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;const store=db.createObjectStore(STORE,{keyPath:"id"});store.createIndex("workspace","workspaceId");};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();databasePromise=null;};resolve(db);};request.onerror=()=>{databasePromise=null;reject(request.error);};});
  return databasePromise;
}
function requestResult<T>(request:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}

async function loadWorkspaceEvents(workspaceId:string):Promise<ActivityEvent[]>{
  const cached=workspaceCache.get(workspaceId);if(cached)return cached;
  const pending=workspaceLoads.get(workspaceId);if(pending)return pending;
  const load=(async()=>{const db=await openDb();const events=await requestResult(db.transaction(STORE).objectStore(STORE).index("workspace").getAll(workspaceId)) as ActivityEvent[];workspaceCache.set(workspaceId,events);return events;})();
  workspaceLoads.set(workspaceId,load);
  try{return await load;}finally{workspaceLoads.delete(workspaceId);}
}

export async function appendGuestActivity(events:ActivityEvent[]):Promise<void>{if(!events.length)return;const db=await openDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE);events.forEach(item=>store.put(item));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});for(const workspaceId of new Set(events.map(e=>e.workspaceId))){const cached=workspaceCache.get(workspaceId);if(cached){const merged=new Map(cached.map(item=>[item.id,item]));events.filter(item=>item.workspaceId===workspaceId).forEach(item=>merged.set(item.id,item));workspaceCache.set(workspaceId,[...merged.values()]);}window.dispatchEvent(new CustomEvent(CHANGE_EVENT,{detail:workspaceId}));}}
export async function deleteGuestActivity(workspaceId:string):Promise<void>{const db=await openDb(),items=await requestResult(db.transaction(STORE).objectStore(STORE).index("workspace").getAll(workspaceId));await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE);items.forEach(item=>store.delete((item as ActivityEvent).id));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});workspaceCache.delete(workspaceId);workspaceLoads.delete(workspaceId);window.dispatchEvent(new CustomEvent(CHANGE_EVENT,{detail:workspaceId}));}

function summary(events:ActivityEvent[]):ActivitySummary{const start=new Date();start.setHours(0,0,0,0);const week=Date.now()-7*86400000;return{today:events.filter(e=>e.occurredAt>=start.getTime()).length,thisWeek:events.filter(e=>e.occurredAt>=week).length,itemsTouched:new Set(events.map(e=>`${e.entityType}:${e.entityId}`)).size};}

export function buildGuestActivityPage(raw:ActivityEvent[],options:{projectId?:string|null;family?:ActivityFamily|null;query?:string;cursor?:string|null;limit?:number}={}):ActivityPage{const all=coalesceActivity(raw);const scoped=all.filter(e=>(!options.projectId||e.projectId===options.projectId));const q=options.query?.trim().toLowerCase()??"";const filtered=scoped.filter(e=>(!options.family||e.family===options.family)&&(!q||activitySearchText(e).includes(q)));const offset=Math.max(0,Number(options.cursor)||0),limit=Math.min(100,Math.max(1,options.limit??50));const projects=new Map<string,ActivityProjectOption>();all.forEach(e=>{if(e.projectId&&!projects.has(e.projectId))projects.set(e.projectId,{id:e.projectId,title:e.projectTitle??"Project",deleted:e.action==="project.deleted"});});return{events:filtered.slice(offset,offset+limit),nextCursor:offset+limit<filtered.length?String(offset+limit):null,projects:[...projects.values()],summary:summary(scoped)};}

export async function fetchGuestActivity(workspaceId:string,options:{projectId?:string|null;family?:ActivityFamily|null;query?:string;cursor?:string|null;limit?:number}={}):Promise<ActivityPage>{return buildGuestActivityPage(await loadWorkspaceEvents(workspaceId),options);}

export function resetGuestActivityCacheForTests():void{workspaceCache.clear();workspaceLoads.clear();databasePromise?.then(db=>db.close()).catch(()=>undefined);databasePromise=null;}

export function subscribeGuestActivity(workspaceId:string,listener:()=>void):()=>void{const handle=(event:Event)=>{if((event as CustomEvent).detail===workspaceId)listener();};window.addEventListener(CHANGE_EVENT,handle);return()=>window.removeEventListener(CHANGE_EVENT,handle);}

// Observe the guest snapshot independently from the board JSON so activity never
// becomes part of exports or cloud state. New workspaces are intentionally ignored,
// which also guarantees imported workspaces start with a clean timeline.
if(typeof window!=="undefined"&&typeof indexedDB!=="undefined"){
  const key="chisel.workspaces.v5.guest";let previous:AppState|null=null,previousRaw:string|null=null;try{previousRaw=localStorage.getItem(key);previous=previousRaw?normalizeAppState(JSON.parse(previousRaw)):null;}catch{previous=null;}
  window.setInterval(()=>{try{const raw=localStorage.getItem(key);if(raw===previousRaw)return;previousRaw=raw;const next=raw?normalizeAppState(JSON.parse(raw)):null;if(!next)return;if(previous){const events=deriveActivityEvents(previous,next).filter(item=>item.action!=="workspace.created");void appendGuestActivity(events).catch(()=>undefined);for(const removed of previous.workspaces.filter(item=>!next.workspaces.some(candidate=>candidate.id===item.id)))void deleteGuestActivity(removed.id).catch(()=>undefined);}previous=next;}catch{/* A malformed local snapshot is handled by the board loader. */}},100);
}
