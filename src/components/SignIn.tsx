import {type FormEvent, useCallback, useState} from "react";
import {DEFAULT_WORKSPACE_NAME} from "../lib/store";
import {githubConfigured} from "../lib/auth";
import {BrandLogo} from "./BrandLogo";
import {LandingArtwork} from "./LandingArtwork";

const GitHubMark = () => (
  <svg className="gh-mark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

export function SignInScreen({onCreateWorkspace}: {onCreateWorkspace: (name: string) => void}) {
  const [workspaceName, setWorkspaceName] = useState(DEFAULT_WORKSPACE_NAME);
  const createWorkspace = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onCreateWorkspace(workspaceName);
    },
    [onCreateWorkspace, workspaceName],
  );

  const signInWithGitHub = useCallback(() => {
    window.location.assign("/api/auth/start");
  }, []);

  return (
    <main className="signin">
      {githubConfigured() && (
        <div className="signin-topbar">
          <button type="button" className="signin-corner-btn" onClick={signInWithGitHub}>
            <GitHubMark />
            Sign in with GitHub
          </button>
        </div>
      )}
      <section className="signin-shell">
        <div className="signin-story">
          <BrandLogo className="signin-brand brand-landing" />

          <h1 className="signin-hero-title">Chisel your messy tasks into a focused board</h1>
          <p className="signin-hero-copy">Chisel gives engineers a focused place to import messy backlog notes, prioritize what matters, track blockers, and show visible progress from queued work to shipped changes.</p>
        </div>

        <div className="signin-card">
          <h2 className="signin-title">Create a workspace</h2>
          <p className="signin-sub">Name a workspace, create projects, and organize each project into a focused task board.</p>

          <form className="project-start-form" onSubmit={createWorkspace}>
            <label className="project-start-label" htmlFor="workspace-name">
              Workspace name
            </label>
            <input id="workspace-name" className="project-start-input" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder={DEFAULT_WORKSPACE_NAME} autoComplete="off" />
            <button className="btn btn-primary signin-btn" type="submit">
              Create workspace
            </button>
          </form>
          <p className="signin-guest-note">Starts locally on this device. Export a project or the full workspace anytime as JSON.</p>
        </div>

        <div className="signin-support">
          <div className="signin-value-list">
            <div>
              <strong>Structure the chaos</strong>
              <span>Import JSON or create items manually with categories, tags, effort, and priority.</span>
            </div>
            <div>
              <strong>Protect focus</strong>
              <span>Keep active, review, deferred, and done work separated without losing context.</span>
            </div>
            <div>
              <strong>Make progress legible</strong>
              <span>Use the board as a lightweight source of truth for what changed and what is blocked.</span>
            </div>
          </div>

          <LandingArtwork />
        </div>
      </section>
    </main>
  );
}
