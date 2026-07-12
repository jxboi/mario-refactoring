import {deliverAutomationRun} from "../_automationDelivery.ts";
import {createQueueClient} from "../_queueClient.ts";

interface QueueMessage { runId: string; }

const queue = createQueueClient();
const MAX_ATTEMPTS = 5;

export default queue.handleNodeCallback<QueueMessage>(async (message, metadata) => {
  const attempt = metadata.deliveryCount;
  try {
    await deliverAutomationRun(message.runId, attempt);
  } catch (error) {
    const statusCode = (error as Error & {statusCode?: number | null}).statusCode;
    const retryable = statusCode == null || statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      const {getQuery} = await import("../_db.ts");
      const sql = getQuery();
      const messageText = error instanceof Error ? error.message.slice(0, 1000) : "Email delivery failed.";
      await sql`update automation_runs set status = 'failed', last_error = ${messageText}, updated_at = now() where id = ${message.runId}`;
      return;
    }
    throw error;
  }
}, {
  retry: (_error, metadata) => ({afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5)}),
});
