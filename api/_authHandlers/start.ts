import {cookie, isSecure, oauthState, type ApiRequest, type ApiResponse, STATE_COOKIE} from "../_auth.js";

export default function handler(req: ApiRequest, res: ApiResponse) {
  const clientId = process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({error: "GITHUB_CLIENT_ID is not configured."});
    return;
  }
  const state = oauthState();
  const params = new URLSearchParams({client_id: clientId, redirect_uri: redirectUri(req), scope: "read:user", state});
  res.setHeader("Set-Cookie", cookie(STATE_COOKIE, state, isSecure(req), 600));
  res.setHeader("Location", `https://github.com/login/oauth/authorize?${params.toString()}`);
  res.status(302).end();
}

function redirectUri(req: ApiRequest): string {
  if (process.env.GITHUB_REDIRECT_URI) return process.env.GITHUB_REDIRECT_URI;
  const protocol = isSecure(req) ? "https" : "http";
  return `${protocol}://${req.headers.host ?? "127.0.0.1:5180"}/api/auth/callback`;
}
