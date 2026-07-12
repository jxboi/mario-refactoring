import {QueueClient} from "@vercel/queue";

/**
 * Vercel injects OIDC automatically in deployed functions. For local
 * development, passing the pulled token explicitly avoids the OIDC helper's
 * legacy `.vercel/project.json` lookup when the CLI uses `.vercel/repo.json`.
 */
export function createQueueClient(): QueueClient {
  const token = process.env.VERCEL_QUEUE_API_TOKEN || process.env.VERCEL_OIDC_TOKEN;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || null;
  // `vercel dev` uses `dev1` as its local function region, but that is not a
  // Vercel Queues service region. Let local queue traffic use the SDK's iad1
  // fallback instead of attempting https://dev1.vercel-queue.com.
  const region = process.env.NODE_ENV === "development" && process.env.VERCEL_REGION === "dev1"
    ? "iad1"
    : process.env.VERCEL_REGION;
  return new QueueClient({
    ...(token ? {token} : {}),
    ...(region ? {region} : {}),
    deploymentId,
  });
}
