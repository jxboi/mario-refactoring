import {cookies, githubUser, SESSION_COOKIE, type ApiRequest, type ApiResponse} from "../_auth";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) {
    res.status(200).json({user: null});
    return;
  }
  try {
    res.status(200).json({user: await githubUser(token)});
  } catch {
    res.status(401).json({user: null});
  }
}
