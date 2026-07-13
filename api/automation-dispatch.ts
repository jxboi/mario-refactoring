import type {ApiResponse} from "./_auth.js";
import {headerValue} from "./_auth.js";
import {dispatchPendingRuns} from "./_automationQueue.js";
import {ensureSchema} from "./_db.js";
import {sendError, type BodyRequest} from "./_http.js";

export default async function handler(req: BodyRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendError(res, 405, "Method not allowed.");
    return;
  }
  if (!process.env.CRON_SECRET || headerValue(req.headers, "authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    sendError(res, 401, "Unauthorized.");
    return;
  }
  await ensureSchema();
  await dispatchPendingRuns();
  res.status(200).json({ok: true});
}
