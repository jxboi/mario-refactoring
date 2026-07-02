import { useState } from 'react';
import type { RefactorItem, Stage } from '../types';
import { STAGES, categoryMeta } from '../types';
import { EffortDots, RiskPill } from './ui';

interface BoardProps {
  items: RefactorItem[];
  totalCount: number;
  onMove: (id: string, stage: Stage, beforeId?: string) => void;
  onSelect: (id: string) => void;
  onAddItem: (stage: Stage) => void;
  onImportClick: () => void;
  onLoadSample: () => void;
}

const DRAG_MIME = 'application/x-chisel-item';

export function Board({ items, totalCount, onMove, onSelect, onAddItem, onImportClick, onLoadSample }: BoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  if (totalCount === 0) {
    return (
      <main className="board-empty">
        <div className="empty-card">
          <svg className="empty-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--brand-bg)" />
            <path d="M9 23 L20 12 L23 15 L12 26 Z M21.5 10.5 L24.5 7.5 L27.5 10.5 L24.5 13.5 Z" fill="var(--accent)" />
          </svg>
          <h1>A calm place to chip away at your codebase</h1>
          <p>
            Drop a JSON file of refactoring items anywhere on this page — Chisel parses it, previews
            what it found, and files everything into a workflow built for refactoring: queued,
            active, reviewing, deployed.
          </p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={onImportClick}>
              <span className="btn-icon">⇡</span> Import JSON
            </button>
            <button className="btn btn-ghost" onClick={() => onAddItem('queued')}>
              ＋ New item
            </button>
            <button className="btn btn-ghost" onClick={onLoadSample}>
              Explore with sample data
            </button>
          </div>
          <pre className="empty-schema">{`[
  {
    "title": "Extract retry logic into a service",
    "description": "Duplicated across three handlers",
    "files": ["src/checkout/card_handler.py"],
    "risk": "high",         // low | medium | high
    "effort": "l",          // xs | s | m | l | xl
    "category": "extract",  // extract, rename, dead-code, …
    "tags": ["payments"],
    "status": "in-progress"
  }
]`}</pre>
        </div>
      </main>
    );
  }

  const handleDrop = (e: React.DragEvent, stage: Stage, beforeId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (id) onMove(id, stage, beforeId);
    setDragId(null);
    setOverStage(null);
  };

  const now = Date.now();

  return (
    <main className="board">
      {STAGES.map((stage) => {
        const stageItems = items.filter((i) => i.stage === stage.id);

        // Hidden-by-default columns (Deferred) show as a slim, collapsed strip
        // until the user opts to reveal them. Dropping a card on the strip still
        // moves it into the stage without expanding.
        if (stage.hiddenByDefault && !showHidden) {
          return (
            <button
              key={stage.id}
              type="button"
              className={`column-collapsed${overStage === stage.id ? ' drag-over' : ''}`}
              title={`${stage.label} — ${stage.hint}. Click to show.`}
              onClick={() => setShowHidden(true)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_MIME)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setOverStage(stage.id);
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setOverStage(null);
              }}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              <span className="column-collapsed-label">{stage.label}</span>
              <span className="column-count">{stageItems.length}</span>
              <span className="column-collapsed-hint">show</span>
            </button>
          );
        }

        // Recency-windowed columns (Deployed) only surface recent items; older
        // ones drop off the board but are still counted so nothing looks lost.
        let colItems = stageItems;
        let hiddenOlder = 0;
        if (stage.recentDays != null) {
          const cutoff = now - stage.recentDays * 86_400_000;
          colItems = stageItems.filter((i) => i.updatedAt >= cutoff);
          hiddenOlder = stageItems.length - colItems.length;
        }

        return (
          <section
            key={stage.id}
            className={`column column-${stage.group}${overStage === stage.id ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DRAG_MIME)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOverStage(stage.id);
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOverStage(null);
            }}
            onDrop={(e) => handleDrop(e, stage.id)}
          >
            <header className="column-head" title={stage.hint}>
              {stage.group === 'active' && <span className="column-live-dot" aria-hidden="true" />}
              {stage.group === 'done' && <span className="column-done-check" aria-hidden="true">✓</span>}
              <span className="column-title">{stage.label}</span>
              <span className="column-count">{colItems.length}</span>
              {stage.hiddenByDefault ? (
                <button
                  className="col-collapse"
                  title={`Hide ${stage.label}`}
                  onClick={() => setShowHidden(false)}
                >
                  ✕
                </button>
              ) : (
                <button
                  className="col-add"
                  title={`New item in ${stage.label}`}
                  onClick={() => onAddItem(stage.id)}
                >
                  ＋
                </button>
              )}
            </header>
            <div className="column-body">
              {colItems.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  dragging={dragId === item.id}
                  onSelect={() => onSelect(item.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, item.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(item.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  onDropBefore={(e) => handleDrop(e, stage.id, item.id)}
                />
              ))}
              {colItems.length === 0 && <div className="column-placeholder">Empty</div>}
              {hiddenOlder > 0 && (
                <div className="column-archived-note">
                  {hiddenOlder} older deploy{hiddenOlder === 1 ? '' : 's'} archived
                </div>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}

interface CardProps {
  item: RefactorItem;
  dragging: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDropBefore: (e: React.DragEvent) => void;
}

function Card({ item, dragging, onSelect, onDragStart, onDragEnd, onDropBefore }: CardProps) {
  const cat = categoryMeta(item.category);
  return (
    <article
      className={`card${dragging ? ' dragging' : ''}${item.blocked ? ' card-blocked' : ''}${item.stage === 'deployed' ? ' card-landed' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDrop={onDropBefore}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
      }}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
    >
      {item.blocked && (
        <div className="card-block-banner" title={item.blockReason || 'Blocked'}>
          ⛔ {item.blockReason || 'Blocked'}
        </div>
      )}
      <div className={`card-title${item.title ? '' : ' untitled'}`}>{item.title || 'Untitled'}</div>
      {item.files.length > 0 && (
        <div className="card-file">
          <code>{item.files[0]}</code>
          {item.files.length > 1 && <span className="card-file-more">+{item.files.length - 1}</span>}
        </div>
      )}
      <div className="card-meta">
        <span className="card-cat" title={cat.label}>
          {cat.glyph}
        </span>
        <span className="card-meta-right">
          {item.notes.length > 0 && (
            <span className="card-notes" title={`${item.notes.length} notes`}>
              ✎{item.notes.length}
            </span>
          )}
          <EffortDots effort={item.effort} />
          <RiskPill risk={item.risk} />
        </span>
      </div>
    </article>
  );
}
