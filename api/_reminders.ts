import {randomUUID} from "node:crypto";
import type {TaskReminder} from "../src/lib/reminders.js";
import {getQuery} from "./_db.js";
import {normalizeAppState} from "../src/lib/store.js";
import type {Project} from "../src/types.js";

export interface ReminderRow {
  id:string; user_id:string; workspace_id:string; project_id:string; task_id:string; share_id:string|null;
  remind_at:string|Date; status:"scheduled"|"queued"|"fired"|"cancelled"; queue_message_id:string|null;
  last_error:string|null; created_at:string|Date; updated_at:string|Date;
}

const iso=(value:string|Date)=>value instanceof Date?value.toISOString():String(value);
export function reminderFromRow(row:ReminderRow):TaskReminder{return{id:row.id,workspaceId:row.workspace_id,projectId:row.project_id,taskId:row.task_id,remindAt:iso(row.remind_at),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)}}

interface ShareSnapshot{shareId:string;ownerUserId:string;sourceWorkspaceId:string;sourceWorkspaceName:string;ownerLogin:string;project:Project}
interface AccessSnapshotRow{state:unknown;shares:ShareSnapshot[]}

export async function resolveReminderTask(userId:string,workspaceId:string,projectId:string,taskId:string){
  const sql=getQuery();
  const rows=await sql`select
      (select state from boards where user_id=${userId} limit 1) as state,
      coalesce((select jsonb_agg(jsonb_build_object(
        'shareId',sp.share_id,'ownerUserId',sp.owner_user_id,'sourceWorkspaceId',sp.source_workspace_id,
        'sourceWorkspaceName',sp.source_workspace_name,'ownerLogin',coalesce(profile.login,'unknown'),'project',sp.project
      )) from project_members member join shared_projects sp on sp.share_id=member.share_id
        left join user_profiles profile on profile.user_id=sp.owner_user_id where member.user_id=${userId}),'[]'::jsonb) as shares` as AccessSnapshotRow[];
  const snapshot=rows[0],shares=Array.isArray(snapshot?.shares)?snapshot.shares:[],state=normalizeAppState(snapshot?.state);
  const workspace=state?.workspaces.find(item=>item.id===workspaceId),project=workspace?.projects.find(item=>item.id===projectId),task=project?.tasks.find(item=>item.id===taskId);
  if(workspace&&project&&task){const share=shares.find(item=>item.ownerUserId===userId&&item.sourceWorkspaceId===workspaceId&&item.project.id===projectId);return{workspace,project,task,shareId:share?.shareId??null}}
  const share=shares.find(item=>`shared:${item.shareId}`===workspaceId&&item.project.id===projectId),sharedTask=share?.project.tasks.find(item=>item.id===taskId);
  if(share&&sharedTask)return{workspace:{id:workspaceId,name:`${share.ownerLogin} / ${share.project.title||"Untitled project"}`},project:share.project,task:sharedTask,shareId:share.shareId};
  throw Object.assign(new Error("Task not found."),{status:404});
}

export async function cancelUserShareReminders(userId:string,shareId:string):Promise<void>{
  await getQuery()`update task_reminders set status='cancelled',cancelled_at=now(),updated_at=now()
    where user_id=${userId} and share_id=${shareId} and status in ('scheduled','queued')`;
}

export function newReminderId():string{return randomUUID()}
