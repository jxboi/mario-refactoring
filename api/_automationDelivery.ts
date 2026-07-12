import {Resend} from "resend";
import type {AutomationEmailPayload} from "../src/lib/automations.js";
import {TaskStageChangedEmail} from "./_email.js";
import {ensureSchema, getQuery} from "./_db.js";

interface RunRow { status: string; payload: AutomationEmailPayload; }

export async function deliverAutomationRun(runId: string, attempt: number): Promise<void> {
  await ensureSchema();
  const sql = getQuery();
  const rows = await sql`select status, payload from automation_runs where id = ${runId} limit 1` as RunRow[];
  const run = rows[0];
  if (!run || run.status === "sent" || run.status === "failed") return;

  await sql`update automation_runs set status = 'retrying', attempts = ${attempt}, updated_at = now() where id = ${runId}`;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    await sql`update automation_runs set status = 'failed', last_error = 'RESEND_API_KEY and RESEND_FROM_EMAIL are required.', updated_at = now() where id = ${runId}`;
    return;
  }

  const {data, error} = await new Resend(apiKey).emails.send({
    from,
    to: run.payload.to,
    subject: run.payload.subject,
    react: TaskStageChangedEmail(run.payload),
  }, {idempotencyKey: runId});

  if (!error) {
    await sql`update automation_runs set status = 'sent', provider_message_id = ${data?.id ?? null}, last_error = null, sent_at = now(), updated_at = now() where id = ${runId}`;
    return;
  }

  const errorMessage = error.message.slice(0, 1000);
  await sql`update automation_runs set status = 'retrying', last_error = ${errorMessage}, updated_at = now() where id = ${runId}`;
  const providerError = new Error(errorMessage);
  Object.assign(providerError, {statusCode: error.statusCode});
  throw providerError;
}
