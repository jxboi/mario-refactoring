import type {Filters} from "../App";
import type {GitHubUser} from "../lib/auth";
import type {BoardSyncState, Project, Workspace} from "../lib/store";
import type {ProjectType, Risk, WorkItem} from "../types";
import {RISKS, RISK_LABELS, typeConfig} from "../types";
import {AccountMenu} from "./AccountMenu";
import {BrandLogo} from "./BrandLogo";
import {ProjectMenu} from "./ProjectMenu";
import {SettingsMenu} from "./SettingsMenu";
import {WorkspaceMenu} from "./WorkspaceMenu";

interface Props {
  items: WorkItem[];
  projects: Project[];
  activeProjectId: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  metricLabel: string;
  showFiles: boolean;
  filters: Filters;
  onFilters: (f: Filters) => void;
  onImportClick: () => void;
  onExportClick: () => void;
  onImportWorkspaceClick: () => void;
  onExportWorkspaceClick: () => void;
  onManageCategories: () => void;
  onManageSkills: () => void;
  onProjectSwitch: (id: string) => void;
  onProjectCreate: (name: string, projectType: ProjectType) => void;
  onProjectRename: (id: string, name: string) => void;
  onProjectDelete: (id: string) => void;
  onWorkspaceSwitch: (id: string) => void;
  onWorkspaceCreate: (name: string) => void;
  onWorkspaceRename: (id: string, name: string) => void;
  onWorkspaceDelete: (id: string) => void;
  onHome: () => void;
  user: GitHubUser;
  isGuest: boolean;
  sync: BoardSyncState;
  onSignOut: () => void;
}

export function Header({items, projects, activeProjectId, workspaces, activeWorkspaceId, metricLabel, showFiles, filters, onFilters, onImportClick, onExportClick, onImportWorkspaceClick, onExportWorkspaceClick, onManageCategories, onManageSkills, onProjectSwitch, onProjectCreate, onProjectRename, onProjectDelete, onWorkspaceSwitch, onWorkspaceCreate, onWorkspaceRename, onWorkspaceDelete, onHome, user, isGuest, sync, onSignOut}: Props) {
  const total = items.filter((i) => i.stage !== "deferred").length;
  const deployed = items.filter((i) => i.stage === "deployed").length;
  const pct = total === 0 ? 0 : Math.round((deployed / total) * 100);
  const activeType = projects.find((project) => project.id === activeProjectId)?.type;
  const completionLabel = typeConfig(activeType).stages.find((stage) => stage.id === "deployed")?.label.toLowerCase() ?? "done";

  const toggleRisk = (r: Risk) => {
    const next = new Set(filters.risks);
    next.has(r) ? next.delete(r) : next.add(r);
    onFilters({...filters, risks: next});
  };

  return (
    <header className="header">
      <div className="header-row">
        <div className="header-left">
          <BrandLogo onClick={onHome} />
          <span className="brand-sep">/</span>
          <WorkspaceMenu workspaces={workspaces} activeId={activeWorkspaceId} onSwitch={onWorkspaceSwitch} onCreate={onWorkspaceCreate} onRename={onWorkspaceRename} onDelete={onWorkspaceDelete} />
          <span className="brand-sep">/</span>
          <ProjectMenu projects={projects} activeId={activeProjectId} onSwitch={onProjectSwitch} onCreate={onProjectCreate} onRename={onProjectRename} onDelete={onProjectDelete} />
        </div>

        {total > 0 && (
          <div className="progress-cluster">
            <div className="progress-track" title={`${pct}% ${completionLabel}`}>
              <div className="progress-fill" style={{width: `${pct}%`}} />
            </div>
            <span className="progress-label">
              <strong>
                {deployed}/{total}
              </strong>{" "}
              {completionLabel}
            </span>
          </div>
        )}

        <div className="header-right">
          <div className="header-actions">
            <SettingsMenu canImport canExport onImportClick={onImportClick} onExportClick={onExportClick} onImportWorkspaceClick={onImportWorkspaceClick} onExportWorkspaceClick={onExportWorkspaceClick} onManageCategories={onManageCategories} onManageSkills={onManageSkills} />
          </div>

          <AccountMenu user={user} isGuest={isGuest} sync={sync} onSignOut={onSignOut} />
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
