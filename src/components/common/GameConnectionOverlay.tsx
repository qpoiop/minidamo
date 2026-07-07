interface GameConnectionOverlayProps {
  isOpponentOnline: boolean;
  reconnecting?: boolean;
  onExit: () => void;
}

/**
 * Shared overlay both games render on top of their board when the peer
 * connection isn't healthy. Non-blocking during transient reconnect
 * (2–5s) so ongoing input isn't disturbed, but always offers a bail-out.
 */
export function GameConnectionOverlay({ isOpponentOnline, reconnecting, onExit }: GameConnectionOverlayProps) {
  if (isOpponentOnline && !reconnecting) return null
  const title = reconnecting ? '재연결 중…' : '상대방 오프라인'
  const desc = reconnecting
    ? '잠깐 끊긴 것 같아요. 자동으로 다시 잇는 중이에요.'
    : '상대방과 데이터 채널이 닫혔어요. 잠시 후 자동 복구되지 않으면 방을 나가 주세요.'
  return (
    <div className="game-conn-overlay" role="status">
      <div className="game-conn-card">
        <div className="spin-loader" />
        <div className="game-conn-title">{title}</div>
        <div className="game-conn-desc">{desc}</div>
        <button type="button" className="pixel-btn pixel-btn--ghost" onClick={onExit}>
          방 나가기
        </button>
      </div>
    </div>
  )
}
