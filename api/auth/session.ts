import {cookie,cookies,createSession,githubUser,isSecure,readSession,SESSION_COOKIE,SESSION_MAX_AGE_SECONDS,type ApiRequest,type ApiResponse} from "../_auth.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) {
    res.status(200).json({user: null});
    return;
  }
  try {
    const session=readSession(token);
    if(session){res.status(200).json({user:session.user});return;}
    // Upgrade the previous raw GitHub-token cookie once, then all subsequent
    // authentication is verified locally without another GitHub request.
    if(token.includes("."))throw new Error("Invalid signed session.");
    const user=await githubUser(token);
    res.setHeader("Set-Cookie",cookie(SESSION_COOKIE,createSession(user),isSecure(req),SESSION_MAX_AGE_SECONDS));
    res.status(200).json({user});
  } catch {
    res.setHeader("Set-Cookie",cookie(SESSION_COOKIE,"",isSecure(req),0));
    res.status(401).json({user: null});
  }
}
