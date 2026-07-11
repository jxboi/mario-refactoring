import {randomBytes} from "node:crypto";

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
