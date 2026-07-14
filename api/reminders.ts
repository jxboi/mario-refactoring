import {authenticateUserId,queryValue,type ApiResponse} from "./_auth.js";
import {ensureSchema,getQuery} from "./_db.js";
import {errorStatus,readJson,sendError,type BodyRequest} from "./_http.js";
import {dispatchSchedulableReminders,publishReminder} from "./_reminderQueue.js";
import {newReminderId,reminderFromRow,resolveReminderTask,type ReminderRow} from "./_reminders.js";
import {waitUntil} from "@vercel/functions";

interface Ref{workspaceId:string;projectId:string;taskId:string}
const refFrom=(value:Record<string,unknown>|null):Ref=>({workspaceId:typeof value?.workspaceId==="string"?value.workspaceId:"",projectId:typeof value?.projectId==="string"?value.projectId:"",taskId:typeof value?.taskId==="string"?value.taskId:""});
const requireRef=(ref:Ref)=>{if(!ref.workspaceId||!ref.projectId||!ref.taskId)throw Object.assign(new Error("Workspace, project, and task are required."),{status:400})};
const requireProjectRef=(ref:Omit<Ref,"taskId">)=>{if(!ref.workspaceId||!ref.projectId)throw Object.assign(new Error("Workspace and project are required."),{status:400})};

export default async function handler(req:BodyRequest,res:ApiResponse){res.setHeader("Cache-Control","no-store");try{
  if(!req.method||!["GET","PUT","DELETE"].includes(req.method)){res.setHeader("Allow","GET, PUT, DELETE");sendError(res,405,"Method not allowed.");return;}
  const userId=await authenticateUserId(req);const sql=getQuery();
  if(req.method==="GET"){
    const ref={workspaceId:queryValue(req.query,"workspaceId"),projectId:queryValue(req.query,"projectId"),taskId:queryValue(req.query,"taskId")};requireProjectRef(ref);
    const load=()=>sql`select id,user_id,workspace_id,project_id,task_id,share_id,remind_at,status,queue_message_id,last_error,created_at,updated_at from task_reminders
      where user_id=${userId} and workspace_id=${ref.workspaceId} and project_id=${ref.projectId}
        and (${ref.taskId}::text='' or task_id=${ref.taskId}) and status in ('scheduled','queued') order by created_at desc` as unknown as Promise<ReminderRow[]>;
    let rows:ReminderRow[];try{rows=await load()}catch(error){if((error as {code?:string}).code!=="42P01")throw error;await ensureSchema();rows=await load()}
    void dispatchSchedulableReminders(userId);
    if(ref.taskId)res.status(200).json({reminder:rows[0]?reminderFromRow(rows[0]):null});
    else res.status(200).json({reminders:rows.map(reminderFromRow)});
    return;
  }
  const body=await readJson(req) as Record<string,unknown>|null;const ref=refFrom(body);requireRef(ref);
  if(req.method==="DELETE"){
    const remove=()=>sql`update task_reminders set status='cancelled',cancelled_at=now(),updated_at=now() where user_id=${userId} and workspace_id=${ref.workspaceId} and project_id=${ref.projectId} and task_id=${ref.taskId} and status in ('scheduled','queued')`;
    try{await remove()}catch(error){if((error as {code?:string}).code!=="42P01")throw error;await ensureSchema();await remove()}
    res.status(204).end();return;
  }
  const remindAt=typeof body?.remindAt==="string"?body.remindAt:"",timestamp=Date.parse(remindAt);
  if(!Number.isFinite(timestamp)||timestamp<=Date.now())throw Object.assign(new Error("Choose a reminder time in the future."),{status:400});
  const target=await resolveReminderTask(userId,ref.workspaceId,ref.projectId,ref.taskId);
  if(target.task.stage==="deployed")throw Object.assign(new Error("Completed tasks cannot have reminders."),{status:409});
  const id=newReminderId();
  const persist=()=>sql`insert into task_reminders (id,user_id,workspace_id,project_id,task_id,share_id,remind_at,status)
    values (${id},${userId},${ref.workspaceId},${ref.projectId},${ref.taskId},${target.shareId},${new Date(timestamp).toISOString()},'scheduled')
    on conflict (user_id,workspace_id,project_id,task_id) where status in ('scheduled','queued')
    do update set id=excluded.id,share_id=excluded.share_id,remind_at=excluded.remind_at,status='scheduled',queue_message_id=null,last_error=null,
      created_at=now(),updated_at=now(),queued_at=null,fired_at=null,cancelled_at=null
    returning id,user_id,workspace_id,project_id,task_id,share_id,remind_at,status,queue_message_id,last_error,created_at,updated_at` as unknown as Promise<ReminderRow[]>;
  let rows:ReminderRow[];try{rows=await persist()}catch(error){if((error as {code?:string}).code!=="42P01")throw error;await ensureSchema();rows=await persist()}
  waitUntil(publishReminder(id).catch(error=>console.error("Reminder queue publication failed.",error)));
  res.status(200).json({reminder:reminderFromRow(rows[0])});
}catch(error){const status=errorStatus(error);if(status>=500)console.error(error);sendError(res,status,status>=500?"Reminder storage is unavailable.":(error as Error).message)}}
