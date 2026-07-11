interface LandingArtworkProps {
  compact?: boolean;
}

export function LandingArtwork({compact = false}: LandingArtworkProps) {
  return (
    <div className={`landing-art${compact ? " landing-art-compact" : ""}`} aria-hidden="true">
      <div className="art-glow art-glow-one" />
      <div className="art-glow art-glow-two" />

      <div className="art-code-panel">
        <div className="art-window-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="art-code-line short" />
        <div className="art-code-line" />
        <div className="art-code-line medium" />
        <div className="art-code-pill">json import</div>
      </div>

      <div className="art-board">
        <div className="art-board-top">
          <span>Delivery plan</span>
          <strong>68%</strong>
        </div>
        <div className="art-columns">
          <div className="art-column">
            <span className="art-column-label">Queue</span>
            <div className="art-card mini-card-muted" />
            <div className="art-card mini-card-risk" />
          </div>
          <div className="art-column art-column-active">
            <span className="art-column-label">Active</span>
            <div className="art-card mini-card-live" />
            <div className="art-card mini-card-wide" />
          </div>
          <div className="art-column">
            <span className="art-column-label">Review</span>
            <div className="art-card mini-card-done" />
          </div>
        </div>
      </div>

      <div className="art-spark art-spark-one" />
      <div className="art-spark art-spark-two" />
      <div className="art-spark art-spark-three" />
    </div>
  );
}
