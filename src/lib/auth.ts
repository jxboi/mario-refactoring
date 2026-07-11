import {useCallback, useEffect, useState} from "react";

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const SESSION_KEY = "chisel.auth.v1";

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
  /** GitHub uses a server-side HttpOnly cookie; guests have no token. */
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

export class AuthError extends Error {}

/** True when a GitHub OAuth App client ID has been configured. */
export function githubConfigured(): boolean {
  return typeof CLIENT_ID === "string" && CLIENT_ID.length > 0;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.kind === "guest" && parsed.user && typeof parsed.user.id === "number") {
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
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/auth/session", {headers: {Accept: "application/json"}})
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {user?: GitHubUser | null};
        if (data.user) setSession({kind: "github", token: "session", user: data.user});
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);
  const signIn = useCallback((next: Session) => {
    if (next.kind === "guest") persistSession(next);
    setSession(next);
  }, []);
  const signOut = useCallback(() => {
    void fetch("/api/auth/logout", {method: "POST"});
    persistSession(null);
    setSession(null);
  }, []);
  return {session, loading, signIn, signOut};
}
