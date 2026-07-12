import {DuplicateMessageError} from "@vercel/queue";
import {getQuery} from "./_db.js";
import {createQueueClient} from "./_queueClient.js";

export const AUTOMATION_TOPIC = "task-automation-actions";
const queue = createQueueClient();

interface PendingRow { id: string; }

async function publishRun(id: string): Promise<void> {
  const sql = getQuery();
  try {
    const result = await queue.send(AUTOMATION_TOPIC, {runId: id}, {idempotencyKey: id, retentionSeconds: 86_400});
    await sql`update automation_runs set status = 'queued', queue_message_id = ${result.messageId}, last_error = null, updated_at = now() where id = ${id} and status = 'pending'`;
    if (process.env.NODE_ENV === "development") {
      const {deliverAutomationRun} = await import("./_automationDelivery.js");
      await deliverAutomationRun(id, 1);
    }
  } catch (error) {
    if (error instanceof DuplicateMessageError) {
      await sql`update automation_runs set status = 'queued', last_error = null, updated_at = now() where id = ${id} and status = 'pending'`;
      return;
    }
    const message = error instanceof Error ? error.message : "Queue publication failed.";
    await sql`update automation_runs set last_error = ${message.slice(0, 1000)}, updated_at = now() where id = ${id} and status = 'pending'`;
  }
}

export async function dispatchPendingRuns(userId?: string): Promise<void> {
  const sql = getQuery();
  let rows: PendingRow[];
  if (userId) {
    rows = await sql`select id from automation_runs where status = 'pending' and user_id = ${userId} order by created_at limit 50` as PendingRow[];
  } else {
    rows = await sql`select id from automation_runs where status = 'pending' order by created_at limit 100` as PendingRow[];
  }
  await Promise.all(rows.map((row) => publishRun(row.id)));
}
