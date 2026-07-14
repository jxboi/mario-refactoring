import {cookie,cookies,createSession,githubUser,isSecure,queryValue,SESSION_COOKIE,SESSION_MAX_AGE_SECONDS,STATE_COOKIE,type ApiRequest,type ApiResponse} from "../_auth.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const code = queryValue(req.query, "code");
    const state = queryValue(req.query, "state");
    const expectedState = cookies(req)[STATE_COOKIE];
    if (!code || !state || !expectedState || state !== expectedState) {
      res.status(400).json({error: "Invalid OAuth callback state."});
      return;
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {Accept: "application/json", "Content-Type": "application/json"},
      body: JSON.stringify({client_id: process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri(req), state}),
    });
    const tokenData = (await tokenResponse.json()) as {access_token?: string; error_description?: string};
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || "GitHub authorization failed.");
    const user=await githubUser(tokenData.access_token);
    res.setHeader("Set-Cookie", [cookie(SESSION_COOKIE,createSession(user),isSecure(req),SESSION_MAX_AGE_SECONDS),cookie(STATE_COOKIE,"",isSecure(req),0)]);
    res.setHeader("Location", "/");
    res.status(302).end();
  } catch (error) {
    res.status(502).json({error: error instanceof Error ? error.message : "GitHub authorization failed."});
  }
}

function redirectUri(req: ApiRequest): string {
  if (process.env.GITHUB_REDIRECT_URI) return process.env.GITHUB_REDIRECT_URI;
  const protocol = isSecure(req) ? "https" : "http";
  return `${protocol}://${req.headers.host ?? "127.0.0.1:5180"}/api/auth/callback`;
}
