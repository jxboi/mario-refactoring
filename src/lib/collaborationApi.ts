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
export const fetchProjectCollaboration=(projectId:string)=>request<ProjectCollaboration>(`/api/collaboration?projectId=${encodeURIComponent(projectId)}`);
export const fetchInvitations=()=>request<{invitations:IncomingInvitation[]}>("/api/collaboration").then(data=>data.invitations);
export const collaborationAction=(body:Record<string,unknown>)=>request<{ok?:boolean;invitation?:PendingInvitation}>("/api/collaboration",{method:"POST",body:JSON.stringify(body)});
