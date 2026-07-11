import {useCallback, useState} from "react";

/**
 * GitHub sign-in via the OAuth Device Flow.
 *
 * The device-code and token endpoints live on github.com and do NOT send CORS
 * headers, so those two calls are routed through a same-origin proxy (see the
 * `server.proxy` entry in vite.config.ts). The profile call hits api.github.com,
 * which does support CORS, so it goes out directly.
 */

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const PROXY = import.meta.env.VITE_GITHUB_PROXY ?? "/gh";
const SESSION_KEY = "chisel.auth.v1";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const SCOPE = "read:user";

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface Session {
  /** How the session was established. */
  kind: "github" | "guest";
  /** GitHub access token, or null for a guest session. */
  token: string | null;
  user: GitHubUser;
}

const GUEST_USER: GitHubUser = {
  id: 0,
  login: "guest",
  name: "Guest",
  avatarUrl: "",
  htmlUrl: "",
};

/** A local-only session with no GitHub account attached. */
export function guestSession(): Session {
  return {kind: "guest", token: null, user: {...GUEST_USER}};
}

/** localStorage namespace for a session's workspace state. */
export function boardScope(session: Session): string {
  return session.kind === "guest" ? "guest" : String(session.user.id);
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export class AuthError extends Error {}
class CancelledError extends Error {}

/** True when a GitHub OAuth App client ID has been configured. */
export function githubConfigured(): boolean {
  return typeof CLIENT_ID === "string" && CLIENT_ID.length > 0;
}

async function postForm(path: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(`${PROXY}${path}`, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded", Accept: "application/json"},
    body: new URLSearchParams(body).toString(),
  });
  // GitHub's OAuth endpoints report problems in the JSON body — sometimes with a
  // non-2xx status (e.g. device_flow_disabled → 400) and sometimes with 200
  // (authorization_pending, slow_down). Return the parsed body so callers can
  // surface error_description; only fall back to a status message when there is
  // no JSON to read.
  const data = await res.json().catch(() => null);
  if (data) return data;
  throw new AuthError(`GitHub request failed (${res.status}).`);
}

/** Step 1: ask GitHub for a device + user code. */
export async function requestDeviceCode(): Promise<DeviceCode> {
  if (!CLIENT_ID) throw new AuthError("GitHub sign-in is not configured.");
  const data = await postForm("/login/device/code", {client_id: CLIENT_ID, scope: SCOPE});
  if (data.error) throw new AuthError(data.error_description || data.error);
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: Number(data.expires_in) || 900,
    interval: Number(data.interval) || 5,
  };
}

/** Step 2: poll until the user authorizes the device, then resolve the access token. */
export async function pollForToken(device: DeviceCode, signal: AbortSignal): Promise<string> {
  let interval = device.interval;
  const deadline = Date.now() + device.expiresIn * 1000;
  while (Date.now() < deadline) {
    await delay(interval * 1000, signal);
    const data = await postForm("/login/oauth/access_token", {
      client_id: CLIENT_ID!,
      device_code: device.deviceCode,
      grant_type: DEVICE_GRANT,
    });
    if (data.access_token) return data.access_token as string;
    switch (data.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        interval = Number(data.interval) || interval + 5;
        break;
      case "expired_token":
        throw new AuthError("The code expired before you finished. Please try again.");
      case "access_denied":
        throw new AuthError("Sign-in was denied on GitHub.");
      default:
        throw new AuthError(data.error_description || data.error || "GitHub returned an unexpected response.");
    }
  }
  throw new AuthError("The code expired before you finished. Please try again.");
}

/** Step 3: exchange the token for the signed-in user's profile. */
export async function fetchUser(token: string): Promise<GitHubUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json"},
  });
  if (!res.ok) throw new AuthError(`Could not load your GitHub profile (${res.status}).`);
  const u = await res.json();
  return {
    id: u.id,
    login: u.login,
    name: u.name ?? null,
    avatarUrl: u.avatar_url,
    htmlUrl: u.html_url,
  };
}

/** True when the rejection came from an aborted flow rather than a real failure. */
export function isCancelled(err: unknown): boolean {
  return err instanceof CancelledError;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new CancelledError());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new CancelledError());
      },
      {once: true},
    );
  });
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.kind === "github" || parsed.kind === "guest") && parsed.user && typeof parsed.user.id === "number") {
      return parsed as Session;
    }
  } catch {
    /* corrupted session — treat as signed out */
  }
  return null;
}

function persistSession(session: Session | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

/** React state for the current GitHub session, persisted to localStorage. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const signIn = useCallback((next: Session) => {
    persistSession(next);
    setSession(next);
  }, []);
  const signOut = useCallback(() => {
    persistSession(null);
    setSession(null);
  }, []);
  return {session, signIn, signOut};
}
