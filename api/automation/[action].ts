import rules from "../_automationHandlers/automations.js";
import runs from "../_automationHandlers/automation-runs.js";
import test from "../_automationHandlers/automations-test.js";
import {queryValue, type ApiResponse} from "../_auth.js";
import {sendError, type BodyRequest} from "../_http.js";

export default async function handler(req: BodyRequest, res: ApiResponse) {
  switch (queryValue(req.query, "action")) {
    case "rules": return rules(req, res);
    case "runs": return runs(req, res);
    case "test": return test(req, res);
    default: sendError(res, 404, "Automation endpoint not found.");
  }
}
