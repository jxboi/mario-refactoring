import {useEffect, useRef, useState} from "react";
import type {GitHubUser} from "../lib/auth";

interface Props {
  user: GitHubUser;
  isGuest: boolean;
  onSignOut: () => void;
}

export function AccountMenu({user, isGuest, onSignOut}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const displayName = isGuest ? "Guest" : user.name || user.login;

  return (
    <div className="account-menu" ref={rootRef}>
      <button className={`account-user account-trigger${isGuest ? " account-guest" : ""}${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={isGuest ? "Local-only guest session" : `@${user.login} on GitHub`}>
        {isGuest ? (
          <span className="account-avatar account-avatar-guest" aria-hidden="true">
            ᴳ
          </span>
        ) : (
          <img className="account-avatar" src={user.avatarUrl} alt="" width={26} height={26} />
        )}
        <span className="account-name">{displayName}</span>
        <svg className="settings-caret" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="settings-menu account-menu-panel" role="menu">
          {isGuest ? (
            <div className="account-menu-header">
              <span className="account-avatar account-avatar-guest" aria-hidden="true">
                ᴳ
              </span>
              <div className="account-menu-meta">
                <span className="account-menu-name">Guest</span>
                <span className="account-menu-sub">Local-only session</span>
              </div>
            </div>
          ) : (
            <a className="account-menu-header account-menu-link" href={user.htmlUrl} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
              <img className="account-avatar" src={user.avatarUrl} alt="" width={26} height={26} />
              <div className="account-menu-meta">
                <span className="account-menu-name">{user.name || user.login}</span>
                <span className="account-menu-sub">@{user.login}</span>
              </div>
            </a>
          )}
          <div className="settings-sep" />
          <button className="settings-item" role="menuitem" onClick={run(onSignOut)}>
            <span className="settings-item-icon">⏻</span> {isGuest ? "Exit" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
