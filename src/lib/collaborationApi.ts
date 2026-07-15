export interface CollaborationMember { userId:string; login:string; name:string|null; avatarUrl:string; role:"owner"|"editor"; joinedAt?:string; }
export interface PendingInvitation { id:string; login:string; role:"editor"; createdAt:string; }
export interface IncomingInvitation { id:string; shareId:string; projectTitle:string; inviterLogin:string; role:"editor"; createdAt:string; }
export interface ProjectCollaboration { share:{id:string;role:"owner"|"editor"}|null; members:CollaborationMember[]; invitations:PendingInvitation[]; }

async function request<T>(url:string, init?:RequestInit):Promise<T>{
  const response=await fetch(url,{...init,headers:{Accept:"application/json",...(init?.body?{"Content-Type":"application/json"}:{}),...(init?.headers??{})}});
  const data=await response.json().catch(()=>null) as ({error?:string}&T)|null;
  if(!response.ok)throw new Error(data?.error||`Collaboration request failed (${response.status}).`);
  return data as T;
}
interface CollaborationCacheEntry{value?:ProjectCollaboration;updatedAt:number;promise?:Promise<ProjectCollaboration>}
const collaborationCache=new Map<string,CollaborationCacheEntry>(),CACHE_MS=30000;
export function clearCollaborationCache():void{collaborationCache.clear()}
export function getCachedProjectCollaboration(projectId:string):ProjectCollaboration|undefined{const entry=collaborationCache.get(projectId);return entry?.value&&Date.now()-entry.updatedAt<CACHE_MS?entry.value:undefined}
export function fetchProjectCollaboration(projectId:string,force=false):Promise<ProjectCollaboration>{
  const existing=collaborationCache.get(projectId);
  if(!force&&existing?.value&&Date.now()-existing.updatedAt<CACHE_MS)return Promise.resolve(existing.value);
  if(existing?.promise)return existing.promise;
  const promise=request<ProjectCollaboration>(`/api/collaboration?projectId=${encodeURIComponent(projectId)}`).then(value=>{collaborationCache.set(projectId,{value,updatedAt:Date.now()});return value}).catch(error=>{if(existing)collaborationCache.set(projectId,existing);else collaborationCache.delete(projectId);throw error});
  collaborationCache.set(projectId,{value:existing?.value,updatedAt:existing?.updatedAt??0,promise});return promise;
}
export const prefetchProjectCollaboration=(projectId:string)=>fetchProjectCollaboration(projectId);
export const fetchInvitations=()=>request<{invitations:IncomingInvitation[]}>("/api/collaboration").then(data=>data.invitations);
export const collaborationAction=async(body:Record<string,unknown>)=>{const result=await request<{ok?:boolean;invitation?:PendingInvitation}>("/api/collaboration",{method:"POST",body:JSON.stringify(body)});clearCollaborationCache();return result};
