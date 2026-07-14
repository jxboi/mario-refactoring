import {randomUUID} from "node:crypto";
import {ensureSchema,getQuery} from "./_db.js";
import {resolveReminderTask,type ReminderRow} from "./_reminders.js";

export async function deliverReminder(reminderId:string,setupSchema=true):Promise<void>{
  if(setupSchema)await ensureSchema();const sql=getQuery();
  const rows=await sql`select id,user_id,workspace_id,project_id,task_id,share_id,remind_at,status,queue_message_id,last_error,created_at,updated_at from task_reminders where id=${reminderId} limit 1` as ReminderRow[];
  const reminder=rows[0];if(!reminder||reminder.status==="fired"||reminder.status==="cancelled")return;
  if(new Date(reminder.remind_at).getTime()>Date.now())throw new Error("Reminder was delivered before its due time.");
  let target:Awaited<ReturnType<typeof resolveReminderTask>>;
  try{target=await resolveReminderTask(reminder.user_id,reminder.workspace_id,reminder.project_id,reminder.task_id)}catch(error){
    if((error as {status?:number}).status===404){await sql`update task_reminders set status='cancelled',cancelled_at=now(),updated_at=now() where id=${reminder.id} and status in ('scheduled','queued')`;return;}throw error;
  }
  if(target.task.stage==="deployed"){
    await sql`update task_reminders set status='cancelled',cancelled_at=now(),updated_at=now() where id=${reminder.id} and status in ('scheduled','queued')`;return;
  }
  const alertId=randomUUID();
  await sql`with fired as (
      update task_reminders set status='fired',fired_at=now(),last_error=null,updated_at=now()
      where id=${reminder.id} and status in ('scheduled','queued') and remind_at<=now()
      returning id,user_id,workspace_id,project_id,task_id
    )
    insert into task_alerts (id,reminder_id,user_id,workspace_id,project_id,task_id,workspace_title,project_title,task_title,triggered_at)
    select ${alertId},fired.id,fired.user_id,fired.workspace_id,fired.project_id,fired.task_id,${target.workspace.name},${target.project.title||"Untitled project"},${target.task.title||"Untitled task"},now()
    from fired on conflict (reminder_id) do nothing`;
}

/**
 * Deliver reminders that are already due before reading the alert feed.
 * This is the durable fallback for local development and transient queue
 * publication/consumer failures. Database guards keep it idempotent with the
 * normal queue consumer.
 */
export async function deliverDueRemindersForUser(userId:string):Promise<void>{
  await ensureSchema();const sql=getQuery();
  const rows=await sql`select id from task_reminders where user_id=${userId} and status in ('scheduled','queued') and remind_at<=now() order by remind_at limit 50` as {id:string}[];
  await Promise.all(rows.map(row=>deliverReminder(row.id,false)));
}
