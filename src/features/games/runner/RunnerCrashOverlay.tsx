interface RunnerCrashOverlayProps {
  dist: number;
  oppDist: number;
  oppCrashed: boolean;
  opponentName: string;
  onSpectate: () => void;
  dismissed: boolean;
}

/**
 * Post-crash surface. Own runner is out; opponent may still be running.
 *   · Full modal until dismissed — shows personal record + live
 *     opponent distance.
 *   · "관전하기" collapses the modal but keeps a small pill overlay so
 *     the crashed player can watch the peer's HUD until both are out
 *     (RunnerGameOver takes over then).
 */
export function RunnerCrashOverlay({
  dist, oppDist, oppCrashed, opponentName, onSpectate, dismissed,
}: RunnerCrashOverlayProps) {
  if (dismissed) {
    return (
      <div className="runner-crash-pill" role="status">
        <div className="runner-crash-pill-head">
          <span className="runner-crash-pill-badge">관전 중</span>
          <span className="runner-crash-pill-mine">내 기록 {dist}m</span>
        </div>
        <div className="runner-crash-pill-opp">
          <span className="runner-crash-pill-oppname">{opponentName}</span>
          <span className={`runner-crash-pill-oppdist ${oppCrashed ? 'is-done' : 'is-live'}`}>
            {oppDist}m{oppCrashed ? ' · 크래시' : ' · 달리는 중'}
          </span>
        </div>
      </div>
    )
  }
  return (
    <div className="runner-crash-overlay" role="dialog" aria-modal="true">
      <div className="runner-crash-card">
        <div className="runner-crash-eyebrow">CRASH!</div>
        <div className="runner-crash-headline">부딪혔어요</div>
        <div className="runner-crash-metric">
          <div className="runner-crash-metric-label">이번 판 기록</div>
          <div className="runner-crash-metric-value">{dist}m</div>
        </div>
        <div className="runner-crash-opp">
          <div className="runner-crash-opp-label">상대 {opponentName}</div>
          <div className={`runner-crash-opp-val ${oppCrashed ? 'is-done' : 'is-live'}`}>
            {oppCrashed ? `${oppDist}m · 크래시` : `${oppDist}m · 달리는 중`}
          </div>
        </div>
        <button
          type="button"
          className="runner-crash-btn runner-crash-btn--spectate"
          onClick={onSpectate}
          disabled={oppCrashed}
        >
          {oppCrashed ? '결과 대기 중…' : '관전하기'}
        </button>
      </div>
    </div>
  )
}
