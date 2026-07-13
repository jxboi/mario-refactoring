import type {ActivityFamily,ActivityPage} from "./activity";
import {fetchActivityPage} from "./activityApi";
import {fetchGuestActivity} from "./guestActivity";

export interface ActivityRequest {
  mode:"guest"|"signed";
  userKey:string;
  workspaceId:string;
  projectId?:string|null;
  family?:ActivityFamily|null;
  query?:string;
  revision?:string|null;
  limit?:number;
}

interface CacheEntry {page:ActivityPage;revision:string|null;updatedAt:number;}
const MAX_ENTRIES=40,FRESH_MS=15000;
const cache=new Map<string,CacheEntry>(),inflight=new Map<string,Promise<ActivityPage>>();

export function activityCacheKey(request:ActivityRequest):string{return JSON.stringify([request.mode,request.userKey,request.workspaceId,request.projectId??null,request.family??null,request.query?.trim().toLowerCase()??"",request.limit??50]);}
const requestRevision=(request:ActivityRequest)=>request.revision??null;
export function getCachedActivity(request:ActivityRequest):ActivityPage|undefined{return cache.get(activityCacheKey(request))?.page;}
export function isActivityCacheFresh(request:ActivityRequest):boolean{const entry=cache.get(activityCacheKey(request));return Boolean(entry&&entry.revision===requestRevision(request)&&Date.now()-entry.updatedAt<FRESH_MS);}
export function invalidateActivityCache(mode:"guest"|"signed",workspaceId:string):void{for(const[key,entry]of cache){const parsed=JSON.parse(key) as string[];if(parsed[0]===mode&&parsed[2]===workspaceId)cache.set(key,{...entry,updatedAt:0});}}
export function clearActivityCache():void{cache.clear();inflight.clear();}

function remember(key:string,request:ActivityRequest,page:ActivityPage){cache.delete(key);cache.set(key,{page,revision:requestRevision(request),updatedAt:Date.now()});while(cache.size>MAX_ENTRIES)cache.delete(cache.keys().next().value as string);return page;}
async function fetchRequest(request:ActivityRequest):Promise<ActivityPage>{const options={workspaceId:request.workspaceId,projectId:request.projectId,family:request.family,query:request.query,limit:request.limit??50};return request.mode==="guest"?fetchGuestActivity(request.workspaceId,options):fetchActivityPage(options);}

export function loadActivity(request:ActivityRequest,force=false):Promise<ActivityPage>{const key=activityCacheKey(request);if(!force&&isActivityCacheFresh(request))return Promise.resolve(cache.get(key)!.page);const flightKey=`${key}:${requestRevision(request)??"local"}`;const active=inflight.get(flightKey);if(active)return active;const promise=fetchRequest(request).then(page=>remember(key,request,page)).finally(()=>inflight.delete(flightKey));inflight.set(flightKey,promise);return promise;}
export function prefetchActivity(request:ActivityRequest):Promise<void>{return loadActivity(request).then(()=>undefined).catch(()=>undefined);}

if(typeof window!=="undefined")window.addEventListener("chisel:activity-changed",event=>{const workspaceId=(event as CustomEvent).detail;if(typeof workspaceId==="string")invalidateActivityCache("guest",workspaceId);});
