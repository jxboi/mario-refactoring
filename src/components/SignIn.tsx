import {
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { githubConfigured } from "../lib/auth";
import { useDialog } from "../lib/useDialog";
import { BrandLogo } from "./BrandLogo";
import { LandingIcon, LandingPreview } from "./LandingPreview";
import "./landing.css";

const GitHubMark = () => (
  <svg
    className="gh-mark"
    viewBox="0 0 16 16"
    width="16"
    height="16"
    aria-hidden="true"
    fill="currentColor"
  >
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

function GitHubSignInDialog({ onClose }: { onClose: () => void }) {
  const { dialogRef, onDialogKeyDown } = useDialog<HTMLDivElement>(onClose);
  return (
    <div
      className="front-dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="front-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="front-dialog-title"
        aria-describedby="front-dialog-description"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        <button
          className="front-dialog-close"
          type="button"
          aria-label="Close sign-in dialog"
          onClick={onClose}
        >
          <LandingIcon name="close" />
        </button>
        <BrandLogo className="front-brand" showName={false} />
        <h2 id="front-dialog-title">Start your journey.</h2>
        <p id="front-dialog-description">
          Sign in with GitHub to open your Kanban workspace.
        </p>
        {githubConfigured() ? (
          <a className="front-button front-button-primary front-signin-action" href="/api/auth/start">
            <GitHubMark />
            Sign in with GitHub
          </a>
        ) : (
          <p role="status">GitHub sign-in is currently unavailable. Please try again later.</p>
        )}
      </div>
    </div>
  );
}

export function SignInScreen() {
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!creating && triggerRef.current) {
      triggerRef.current.focus({ preventScroll: true });
      triggerRef.current = null;
    }
  }, [creating]);
  const start = (event: MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = event.currentTarget;
    setCreating(true);
  };
  return (
    <div className="chisel-landing">
      <div
        className="chisel-landing-content"
        {...(creating ? { inert: "" } : {})}
      >
        <a href="#front-main" className="front-skip">
          Skip to content
        </a>
        <header className="front-header">
          <a
            className="front-brand-link"
            href="#front-main"
            aria-label="Chisely home"
          >
            <BrandLogo className="front-brand" />
          </a>
          <nav className="front-nav" aria-label="Main navigation">
            <a href="#workspace-preview">The workspace</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <div className="front-header-actions">
            {githubConfigured() && (
              <a className="front-github" href="/api/auth/start">
                <GitHubMark />
                <span>Sign in with GitHub</span>
              </a>
            )}
            <button
              type="button"
              className="front-button front-button-primary front-header-start"
              onClick={start}
            >
              Start your journey
            </button>
          </div>
        </header>
        <main id="front-main">
          <section className="front-hero" aria-labelledby="front-title">
            <h1 id="front-title">
              A little structure.
              <br />A lot more <em>possibility.</em>
            </h1>
            <div className="front-hero-actions">
              <button
                type="button"
                className="front-button front-button-primary"
                onClick={start}
              >
                Start your journey
                <LandingIcon name="arrow" />
              </button>
            </div>
          </section>
          <LandingPreview />
          <section
            id="how-it-works"
            className="front-features"
            aria-label="How Chisely works"
            tabIndex={-1}
          >
            <div>
              <h2>
                <span>01 /</span> Make space
              </h2>
              <p>
                Bring your projects, tasks,
                <br /> and scattered thoughts together.
              </p>
            </div>
            <div>
              <h2>
                <span>02 /</span> Find your focus
              </h2>
              <p>
                See what matters now.
                <br /> Let everything else wait its turn.
              </p>
            </div>
            <div>
              <h2>
                <span>03 /</span> Keep moving
              </h2>
              <p>
                Small steps, visible progress.
                <br /> From first idea to finally done.
              </p>
            </div>
          </section>
        </main>
        <footer className="front-footer">
          <a
            className="front-brand-link"
            href="#front-main"
            aria-label="Back to top"
          >
            <BrandLogo className="front-brand" />
          </a>
          <p>A little less noise. A little more done.</p>
        </footer>
      </div>
      {creating && (
        <GitHubSignInDialog
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
