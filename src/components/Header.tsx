import type {Filters} from "../App";
import type {GitHubUser} from "../lib/auth";
import type {Project} from "../lib/store";
import type {ProjectType, RefactorItem, Risk} from "../types";
import {RISKS, RISK_LABELS} from "../types";
import {ProjectMenu} from "./ProjectMenu";

interface Props {
  items: RefactorItem[];
  projects: Project[];
  activeId: string;
  metricLabel: string;
  showFiles: boolean;
  filters: Filters;
  onFilters: (f: Filters) => void;
  onImportClick: () => void;
  onManageCategories: () => void;
  onManageSkills: () => void;
  onProjectSwitch: (id: string) => void;
  onProjectCreate: (name: string, projectType: ProjectType) => void;
  onProjectRename: (id: string, name: string) => void;
  onProjectDelete: (id: string) => void;
  user: GitHubUser;
  isGuest: boolean;
  onSignOut: () => void;
}

export function Header({items, projects, activeId, metricLabel, showFiles, filters, onFilters, onImportClick, onManageCategories, onManageSkills, onProjectSwitch, onProjectCreate, onProjectRename, onProjectDelete, user, isGuest, onSignOut}: Props) {
  const total = items.filter((i) => i.stage !== "deferred").length;
  const deployed = items.filter((i) => i.stage === "deployed").length;
  const pct = total === 0 ? 0 : Math.round((deployed / total) * 100);

  const toggleRisk = (r: Risk) => {
    const next = new Set(filters.risks);
    next.has(r) ? next.delete(r) : next.add(r);
    onFilters({...filters, risks: next});
  };

  return (
    <header className="header">
      <div className="header-row">
        <div className="header-left">
          <div className="brand">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="7" fill="var(--brand-bg)" />
              <path d="M9 23 L20 12 L23 15 L12 26 Z M21.5 10.5 L24.5 7.5 L27.5 10.5 L24.5 13.5 Z" fill="var(--accent)" />
            </svg>
            <span className="brand-name">Chisel</span>
          </div>
          <span className="brand-sep">/</span>
          <ProjectMenu projects={projects} activeId={activeId} onSwitch={onProjectSwitch} onCreate={onProjectCreate} onRename={onProjectRename} onDelete={onProjectDelete} />
        </div>

        {total > 0 && (
          <div className="progress-cluster">
            <div className="progress-track" title={`${pct}% deployed`}>
              <div className="progress-fill" style={{width: `${pct}%`}} />
            </div>
            <span className="progress-label">
              <strong>
                {deployed}/{total}
              </strong>{" "}
              deployed
            </span>
          </div>
        )}

        <div className="header-right">
          <div className="header-actions">
            {" "}
            <button className="btn btn-ghost" onClick={onManageSkills} title="Author refactoring skills">
              <span className="btn-icon">✦</span> <span className="btn-label">Skills</span>
            </button>{" "}
            <button className="btn btn-ghost" onClick={onManageCategories} title="Manage categories">
              <span className="btn-icon">❖</span> <span className="btn-label">Categories</span>
            </button>
            {total > 0 && (
              <button className="btn btn-ghost btn-accent" onClick={onImportClick} title="Import JSON">
                <span className="btn-icon">⇡</span> <span className="btn-label">Import JSON</span>
              </button>
            )}
          </div>

          <div className="account">
            {isGuest ? (
              <span className="account-user account-guest" title="Local-only guest session">
                <span className="account-avatar account-avatar-guest" aria-hidden="true">
                  ᴳ
                </span>
                <span className="account-name">Guest</span>
              </span>
            ) : (
              <a className="account-user" href={user.htmlUrl} target="_blank" rel="noreferrer" title={`@${user.login} on GitHub`}>
                <img className="account-avatar" src={user.avatarUrl} alt="" width={26} height={26} />
                <span className="account-name">{user.name || user.login}</span>
              </a>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onSignOut}>
              {isGuest ? "Exit" : "Sign out"}
            </button>
          </div>
        </div>
      </div>

      {total > 0 && (
        <div className="header-row filter-row">
          <input className="search-input" type="search" placeholder={showFiles ? "Search titles, files, tags…" : "Search titles, tags…"} value={filters.query} onChange={(e) => onFilters({...filters, query: e.target.value})} />
          <div className="filter-chips">
            {RISKS.map((r) => (
              <button key={r} className={`chip chip-${r}${filters.risks.has(r) ? " active" : ""}`} onClick={() => toggleRisk(r)}>
                {RISK_LABELS[r]} {metricLabel.toLowerCase()}
              </button>
            ))}
            <button className={`chip chip-blocked${filters.blockedOnly ? " active" : ""}`} onClick={() => onFilters({...filters, blockedOnly: !filters.blockedOnly})}>
              blocked
            </button>
            {(filters.query || filters.risks.size > 0 || filters.blockedOnly) && (
              <button className="chip chip-clear" onClick={() => onFilters({query: "", risks: new Set(), blockedOnly: false})}>
                clear
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
