import {authenticateUserId, queryValue, type ApiResponse} from "./_auth.js";
import {dispatchPendingRuns} from "./_automationQueue.js";
import {ensureSchema} from "./_db.js";
import {errorStatus, sendError, type BodyRequest} from "./_http.js";
import {listRuns} from "./_automation.js";

export default async function handler(req: BodyRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      sendError(res, 405, "Method not allowed.");
      return;
    }
    const userId = await authenticateUserId(req);
    await ensureSchema();
    await dispatchPendingRuns(userId);
    const workspaceId = queryValue(req.query, "workspaceId");
    const ruleId = queryValue(req.query, "ruleId");
    res.status(200).json({runs: await listRuns(userId, workspaceId, ruleId)});
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) console.error(error);
    sendError(res, status, status >= 500 ? "Automation history is unavailable." : (error as Error).message);
  }
}
