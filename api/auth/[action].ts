import start from "../_authHandlers/start.js";
import callback from "../_authHandlers/callback.js";
import session from "../_authHandlers/session.js";
import logout from "../_authHandlers/logout.js";
import {queryValue, type ApiResponse} from "../_auth.js";
import {sendError, type BodyRequest} from "../_http.js";

export default async function handler(req: BodyRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const action = queryValue(req.query, "action");
  if (!["start", "callback", "session", "logout"].includes(action)) {
    sendError(res, 404, "Auth endpoint not found.");
    return;
  }
  const method = action === "logout" ? "POST" : "GET";
  if (req.method !== method) {
    res.setHeader("Allow", method);
    sendError(res, 405, "Method not allowed.");
    return;
  }
  switch (action) {
    case "start": return start(req, res);
    case "callback": return callback(req, res);
    case "session": return session(req, res);
    case "logout": return logout(req, res);
  }
}
