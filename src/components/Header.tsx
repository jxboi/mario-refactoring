import type { Filters } from '../App';
import type { Project } from '../lib/store';
import type { RefactorItem, Risk } from '../types';
import { RISKS } from '../types';
import { ProjectMenu } from './ProjectMenu';

interface Props {
  items: RefactorItem[];
  projects: Project[];
  activeId: string;
  filters: Filters;
  onFilters: (f: Filters) => void;
  onImportClick: () => void;
  onProjectSwitch: (id: string) => void;
  onProjectCreate: (name: string) => void;
  onProjectRename: (id: string, name: string) => void;
  onProjectDelete: (id: string) => void;
}

export function Header({
  items,
  projects,
  activeId,
  filters,
  onFilters,
  onImportClick,
  onProjectSwitch,
  onProjectCreate,
  onProjectRename,
  onProjectDelete,
}: Props) {
  const total = items.length;
  const deployed = items.filter((i) => i.stage === 'deployed').length;
  const inFlight = items.filter((i) => i.stage === 'active' || i.stage === 'reviewing').length;
  const blocked = items.filter((i) => i.blocked && i.stage !== 'deployed' && i.stage !== 'deferred').length;
  const pct = total === 0 ? 0 : Math.round((deployed / total) * 100);

  const toggleRisk = (r: Risk) => {
    const next = new Set(filters.risks);
    next.has(r) ? next.delete(r) : next.add(r);
    onFilters({ ...filters, risks: next });
  };

  return (
    <header className="header">
      <div className="header-row">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--brand-bg)" />
            <path
              d="M9 23 L20 12 L23 15 L12 26 Z M21.5 10.5 L24.5 7.5 L27.5 10.5 L24.5 13.5 Z"
              fill="var(--accent)"
            />
          </svg>
          <span className="brand-name">Chisel</span>
        </div>
        <span className="brand-sep">/</span>
        <ProjectMenu
          projects={projects}
          activeId={activeId}
          onSwitch={onProjectSwitch}
          onCreate={onProjectCreate}
          onRename={onProjectRename}
          onDelete={onProjectDelete}
        />

        {total > 0 && (
          <div className="progress-cluster">
            <div className="progress-track" title={`${pct}% deployed`}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="progress-label">
              <strong>{deployed}/{total}</strong> deployed
              <span className="stat-inflight" title="In Active or Reviewing">
                {' '}· {inFlight} in flight
              </span>
              {blocked > 0 && (
                <button
                  className={`stat-blocked${filters.blockedOnly ? ' active' : ''}`}
                  title={filters.blockedOnly ? 'Show all items' : 'Show only blocked items'}
                  onClick={() => onFilters({ ...filters, blockedOnly: !filters.blockedOnly })}
                >
                  ⛔ {blocked} blocked
                </button>
              )}
            </span>
          </div>
        )}

        {total > 0 && (
          <div className="header-actions">
            <button className="btn btn-primary" onClick={onImportClick}>
              <span className="btn-icon">⇡</span> Import JSON
            </button>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="header-row filter-row">
          <input
            className="search-input"
            type="search"
            placeholder="Search titles, files, tags…"
            value={filters.query}
            onChange={(e) => onFilters({ ...filters, query: e.target.value })}
          />
          <div className="filter-chips">
            {RISKS.map((r) => (
              <button
                key={r}
                className={`chip chip-${r}${filters.risks.has(r) ? ' active' : ''}`}
                onClick={() => toggleRisk(r)}
              >
                {r} risk
              </button>
            ))}
            {(filters.query || filters.risks.size > 0 || filters.blockedOnly) && (
              <button
                className="chip chip-clear"
                onClick={() => onFilters({ query: '', risks: new Set(), blockedOnly: false })}
              >
                clear
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
