import {cookie, isSecure, SESSION_COOKIE, type ApiRequest, type ApiResponse} from "../_auth.js";

export default function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Set-Cookie", cookie(SESSION_COOKIE, "", isSecure(req), 0));
  res.status(204).end();
}
