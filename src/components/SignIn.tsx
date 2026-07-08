import {type FormEvent, useCallback, useState} from "react";
import {DEFAULT_PROJECT_NAME} from "../lib/store";
import {LandingArtwork} from "./LandingArtwork";

export function SignInScreen({onCreateProject}: {onCreateProject: (name: string) => void}) {
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);

  const createProject = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onCreateProject(projectName);
    },
    [onCreateProject, projectName],
  );

  return (
    <main className="signin">
      <section className="signin-shell">
        <div className="signin-story">
          <div className="brand signin-brand">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="7" fill="var(--brand-bg)" />
              <path d="M9 23 L20 12 L23 15 L12 26 Z M21.5 10.5 L24.5 7.5 L27.5 10.5 L24.5 13.5 Z" fill="var(--accent)" />
            </svg>
            <span className="brand-name">Chisel</span>
          </div>

          <span className="front-kicker">Refactoring and task boards</span>
          <h1 className="signin-hero-title">Turn scattered cleanup work into a board you can actually run.</h1>
          <p className="signin-hero-copy">Chisel gives engineers a focused place to import messy backlog notes, prioritize what matters, track blockers, and show visible progress from queued work to shipped changes.</p>
        </div>

        <div className="signin-card">
          <h2 className="signin-title">Create a project</h2>
          <p className="signin-sub">Name a project and jump straight into a local workspace. You can import JSON, add items, and feel how the board works before connecting anything.</p>

          <form className="project-start-form" onSubmit={createProject}>
            <label className="project-start-label" htmlFor="project-name">
              Project name
            </label>
            <input id="project-name" className="project-start-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder={DEFAULT_PROJECT_NAME} autoComplete="off" />
            <button className="btn btn-primary signin-btn" type="submit">
              Create project
            </button>
          </form>
          <p className="signin-guest-note">Starts locally on this device. Export your project anytime as JSON.</p>
        </div>

        <div className="signin-support">
          <div className="signin-value-list">
            <div>
              <strong>Structure the chaos</strong>
              <span>Import JSON or create items manually with categories, tags, effort, and risk.</span>
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
