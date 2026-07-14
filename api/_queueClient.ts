import {QueueClient} from "@vercel/queue";

/** Vercel injects OIDC in production; local publishing uses an API token. */
export function createQueueClient(): QueueClient {
  // Pulled OIDC tokens expire and must not be treated as durable local queue
  // credentials. Local queue publishing requires a dedicated API token;
  // deployed functions continue to use Vercel's request-scoped OIDC token.
  const token = process.env.VERCEL_QUEUE_API_TOKEN
    || (process.env.NODE_ENV !== "development" ? process.env.VERCEL_OIDC_TOKEN : undefined);
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
