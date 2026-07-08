import {useCallback, useEffect, useRef, useState} from "react";
import {AuthError, fetchUser, githubConfigured, guestSession, isCancelled, pollForToken, requestDeviceCode, type DeviceCode, type Session} from "../lib/auth";

type Phase = "idle" | "starting" | "awaiting" | "error";

export function SignInScreen({onSignedIn}: {onSignedIn: (session: Session) => void}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const configured = githubConfigured();

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async () => {
    setError(null);
    setDevice(null);
    setCopied(false);
    setPhase("starting");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const dev = await requestDeviceCode();
      setDevice(dev);
      setPhase("awaiting");
      const token = await pollForToken(dev, controller.signal);
      const user = await fetchUser(token);
      onSignedIn({kind: "github", token, user});
    } catch (err) {
      if (isCancelled(err) || controller.signal.aborted) {
        setPhase("idle");
        return;
      }
      setError(err instanceof AuthError ? err.message : "Sign-in failed. Please try again.");
      setPhase("error");
    }
  }, [onSignedIn]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setDevice(null);
  }, []);

  const copyCode = useCallback(() => {
    if (!device) return;
    navigator.clipboard?.writeText(device.userCode).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  }, [device]);

  const busy = phase === "starting" || phase === "awaiting";

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="brand signin-brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--brand-bg)" />
            <path d="M9 23 L20 12 L23 15 L12 26 Z M21.5 10.5 L24.5 7.5 L27.5 10.5 L24.5 13.5 Z" fill="var(--accent)" />
          </svg>
          <span className="brand-name">Chisel</span>
        </div>

        <h1 className="signin-title">Sign in to your board</h1>
        <p className="signin-sub">Connect your GitHub account to open your refactoring boards.</p>

        {!configured && (
          <p className="signin-note">
            GitHub sign-in isn’t configured yet. Set <code>VITE_GITHUB_CLIENT_ID</code> to your OAuth App’s client ID (see the README) and restart the dev server.
          </p>
        )}

        {phase === "awaiting" && device && (
          <div className="device-panel">
            <p className="device-hint">Enter this code on GitHub to finish signing in:</p>
            <div className="device-code">
              <span className="device-code-value">{device.userCode}</span>
              <button className="btn btn-ghost btn-sm" onClick={copyCode} type="button">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <a className="btn btn-primary signin-btn" href={device.verificationUri} target="_blank" rel="noreferrer">
              Open GitHub ↗
            </a>
            <p className="device-status">
              <span className="device-spinner" aria-hidden="true" /> Waiting for authorization…
            </p>
            <button className="btn btn-ghost btn-sm" onClick={cancel} type="button">
              Cancel
            </button>
          </div>
        )}

        {phase !== "awaiting" && (
          <>
            {error && <p className="signin-error">{error}</p>}
            <button className="btn btn-primary signin-btn" onClick={start} disabled={!configured || busy} type="button">
              <GitHubMark />
              {phase === "starting" ? "Connecting…" : error ? "Try again" : "Sign in with GitHub"}
            </button>
            <div className="signin-divider">
              <span>or</span>
            </div>
            <button className="btn btn-ghost signin-btn" onClick={() => onSignedIn(guestSession())} disabled={busy} type="button">
              Continue as guest
            </button>
            <p className="signin-guest-note">Guest boards stay on this device and aren’t linked to any account.</p>
          </>
        )}
      </div>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg className="gh-mark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
