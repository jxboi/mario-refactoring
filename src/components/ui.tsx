import type { Effort, Risk } from '../types';
import { EFFORTS } from '../types';

export function RiskPill({ risk }: { risk: Risk }) {
  return <span className={`risk-pill risk-${risk}`}>{risk}</span>;
}

export function EffortDots({ effort }: { effort: Effort }) {
  const level = EFFORTS.indexOf(effort) + 1;
  return (
    <span className="effort-dots" title={`Effort: ${effort.toUpperCase()}`}>
      {EFFORTS.map((_, i) => (
        <span key={i} className={`effort-dot${i < level ? ' on' : ''}`} />
      ))}
    </span>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
