import { useState } from 'react'
import { findGame, GAMES } from '../../games/registry'
import type { P2PMessage } from '../../hooks/useRoom'

/**
 * Solo test mode. Skips lobby + P2P handshake entirely so we can
 * validate a game's UI / mechanics without a peer.
 *
 * Mocked props:
 *   - players: [me(host), bot(guest)] — both marked ready & online.
 *   - sendMessage: no-op sink (message logged to console for debug).
 *   - isOpponentOnline: true (so games don't gate on "상대 재연결 중").
 *
 * Turn-based games where the bot never moves will freeze after our
 * first move — that's expected. The mode exists to inspect visuals,
 * animations, and rule/log wiring, not to play a full match.
 * Canvas single-player games (Wudada, Escape) run to completion.
 */

const ME_ID = 'test-self'
const BOT_ID = 'test-bot'

const MOCK_PLAYERS = [
  { id: ME_ID, name: '나(테스트)', ready: true, isHost: true },
  { id: BOT_ID, name: '봇', ready: true, isHost: false },
]

const noopSend = (msg: P2PMessage): void => {
  // eslint-disable-next-line no-console
  console.debug('[test-mode] sendMessage', msg.type, msg.payload)
}

function readGameFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const g = params.get('game')
  return g && findGame(g) ? g : null
}

interface TestModeProps {
  onExit: () => void;
}

export function TestMode({ onExit }: TestModeProps) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(() => readGameFromUrl())
  const [matchOption, setMatchOption] = useState<number>(3)

  if (!selectedGameId) {
    return (
      <div className="test-mode-picker">
        <div className="lobby-top-bar">
          <button type="button" className="pixel-arrow" onClick={onExit} aria-label="뒤로">◀</button>
          <span className="lobby-title">테스트 모드 · 게임 선택</span>
        </div>
        <p className="test-mode-hint">
          P2P/로비 건너뛰고 게임 UI만 확인. 턴제 게임은 내 첫 수 이후 봇이 움직이지 않아요.
        </p>
        <div className="test-mode-list">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              className="test-mode-item"
              onClick={() => setSelectedGameId(g.id)}
            >
              <span className="test-mode-item-code">{g.code}</span>
              <span className="test-mode-item-title">{g.title}</span>
              <span className="test-mode-item-desc">{g.desc}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const def = findGame(selectedGameId)
  if (!def) return null
  const GameComp = def.Component

  return (
    <div className="game-play-container">
      <div className="test-mode-badge">TEST MODE · 봇 상대 (자동 이동 없음)</div>
      <GameComp
        players={MOCK_PLAYERS}
        peerId={ME_ID}
        isHost
        sendMessage={noopSend}
        onLobby={() => setSelectedGameId(null)}
        onChooseOther={() => setSelectedGameId(null)}
        onExit={onExit}
        isOpponentOnline
        matchOption={matchOption}
      />
      {/* Match-option knob for turn/round games. Some games ignore this. */}
      <div className="test-mode-option-row">
        <label htmlFor="test-mo">옵션</label>
        <select
          id="test-mo"
          className="pixel-select"
          value={matchOption}
          onChange={(e) => setMatchOption(Number(e.target.value))}
        >
          {def.matchOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
