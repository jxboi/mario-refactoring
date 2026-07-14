import {DuplicateMessageError} from "@vercel/queue";
import {getQuery} from "./_db.js";
import {createQueueClient} from "./_queueClient.js";
import {REMINDER_HORIZON_SECONDS,REMINDER_RETENTION_SECONDS,reminderDelaySeconds} from "../src/lib/reminders.js";

export const REMINDER_TOPIC="task-reminders";
const queue=createQueueClient();

interface DispatchRow{id:string;remind_at:string|Date}

export async function publishReminder(id:string):Promise<void>{
  const sql=getQuery();
  const rows=await sql`select id,remind_at from task_reminders where id=${id} and status='scheduled' limit 1` as DispatchRow[];
  const row=rows[0];if(!row)return;
  const delaySeconds=reminderDelaySeconds(row.remind_at);
  if(delaySeconds>REMINDER_HORIZON_SECONDS)return;
  // During local development the alert endpoint delivers due reminders from
  // Postgres. Avoid trying an expired token pulled by `vercel env pull`.
  if(process.env.NODE_ENV==="development"&&!process.env.VERCEL_QUEUE_API_TOKEN)return;
  try{
    const result=await queue.send(REMINDER_TOPIC,{reminderId:id},{delaySeconds,idempotencyKey:id,retentionSeconds:REMINDER_RETENTION_SECONDS});
    await sql`update task_reminders set status='queued',queue_message_id=${result.messageId},last_error=null,queued_at=now(),updated_at=now() where id=${id} and status='scheduled'`;
  }catch(error){
    if(error instanceof DuplicateMessageError){await sql`update task_reminders set status='queued',last_error=null,queued_at=coalesce(queued_at,now()),updated_at=now() where id=${id} and status='scheduled'`;return;}
    const message=error instanceof Error?error.message:"Queue publication failed.";
    await sql`update task_reminders set last_error=${message.slice(0,1000)},updated_at=now() where id=${id} and status='scheduled'`;
  }
}

export async function dispatchSchedulableReminders(userId?:string):Promise<void>{
  const sql=getQuery();let rows:{id:string}[];
  if(userId)rows=await sql`select id from task_reminders where user_id=${userId} and status='scheduled' and remind_at<=now()+interval '6 days' order by remind_at limit 50` as {id:string}[];
  else rows=await sql`select id from task_reminders where status='scheduled' and remind_at<=now()+interval '6 days' order by remind_at limit 100` as {id:string}[];
  await Promise.all(rows.map(row=>publishReminder(row.id)));
}
