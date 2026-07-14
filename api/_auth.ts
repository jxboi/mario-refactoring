import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";

export interface ApiRequest {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  setHeader(name: string, value: string | string[]): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(body?: string): void;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export const SESSION_COOKIE = "chisel_github_session";
export const STATE_COOKIE = "chisel_github_oauth_state";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

interface SessionPayload {v:1;user:GitHubUser;iat:number;exp:number;}

function sessionSecret():string{
  const secret=process.env.SESSION_SECRET||process.env.GITHUB_CLIENT_SECRET;
  if(!secret)throw new Error("SESSION_SECRET or GITHUB_CLIENT_SECRET is required.");
  return secret;
}

function sign(encoded:string):Buffer{return createHmac("sha256",sessionSecret()).update(encoded).digest()}

export function createSession(user:GitHubUser,maxAgeSeconds=SESSION_MAX_AGE_SECONDS,now=Date.now()):string{
  const iat=Math.floor(now/1000),payload:SessionPayload={v:1,user,iat,exp:iat+maxAgeSeconds};
  const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded).toString("base64url")}`;
}

export function readSession(value:string,now=Date.now()):{userId:string;user:GitHubUser;expiresAt:number}|null{
  const [encoded,signature,...rest]=value.split(".");if(!encoded||!signature||rest.length)return null;
  let actual:Buffer;try{actual=Buffer.from(signature,"base64url")}catch{return null}
  const expected=sign(encoded);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  try{
    const payload=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as Partial<SessionPayload>,user=payload.user as Partial<GitHubUser>|undefined;
    const nowSeconds=Math.floor(now/1000);
    if(payload.v!==1||typeof payload.iat!=="number"||typeof payload.exp!=="number"||payload.exp<=nowSeconds||payload.iat>nowSeconds+300||!user||typeof user.id!=="number"||typeof user.login!=="string"||!(typeof user.name==="string"||user.name===null)||typeof user.avatarUrl!=="string"||typeof user.htmlUrl!=="string")return null;
    const validUser:GitHubUser={id:user.id,login:user.login,name:user.name,avatarUrl:user.avatarUrl,htmlUrl:user.htmlUrl};
    return{userId:`github:${validUser.id}`,user:validUser,expiresAt:payload.exp*1000};
  }catch{return null}
}

export function headerValue(headers: ApiRequest["headers"], name: string): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function queryValue(query: ApiRequest["query"], name: string): string {
  const value = query?.[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function cookies(req: ApiRequest): Record<string, string> {
  return Object.fromEntries(
    headerValue(req.headers, "cookie")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, value]) => [name, decodeURIComponent(value)]),
  );
}

export function cookie(name: string, value: string, secure: boolean, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function oauthState(): string {
  return randomBytes(32).toString("hex");
}

export async function githubUser(token: string): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "chisel-board-sync",
    },
  });
  if (!response.ok) throw new Error("Could not load your GitHub profile.");
  const user = (await response.json()) as Record<string, unknown>;
  if (typeof user.id !== "number" || typeof user.login !== "string") throw new Error("Invalid GitHub profile.");
  return {id: user.id, login: user.login, name: typeof user.name === "string" ? user.name : null, avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : "", htmlUrl: typeof user.html_url === "string" ? user.html_url : ""};
}

export function isSecure(req: ApiRequest): boolean {
  return headerValue(req.headers, "x-forwarded-proto") === "https" || headerValue(req.headers, "host").includes("vercel.app");
}

export async function authenticateUser(req: ApiRequest): Promise<{userId: string; user: GitHubUser}> {
  const authorization = headerValue(req.headers, "authorization");
  const bearer=authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if(bearer){try{const user=await githubUser(bearer);return{userId:`github:${user.id}`,user}}catch{throw Object.assign(new Error("Invalid GitHub token."),{status:401})}}
  const value=cookies(req)[SESSION_COOKIE];if(!value)throw Object.assign(new Error("Sign in with GitHub to use cloud features."),{status:401});
  const session=readSession(value);if(!session)throw Object.assign(new Error("Your session has expired. Sign in again."),{status:401});
  return{userId:session.userId,user:session.user};
}

export async function authenticateUserId(req: ApiRequest): Promise<string> {
  return (await authenticateUser(req)).userId;
}
