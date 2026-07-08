import { useMemo, useState } from 'react'
import { findGame, GAMES } from '../../games/registry'
import type { P2PMessage } from '../../hooks/useRoom'

/**
 * Solo test mode.
 *
 * A single game component instance is mounted; the tester swaps roles
 * (host ↔ guest) between turns via a toggle. Because state lives inside
 * that one instance, both "sides" see the same board / seed / log — so
 * playing both sides sequentially reproduces the same behaviour a real
 * two-peer match would produce, without a network at all.
 *
 * sendMessage is a no-op: the game already applied every mutation
 * locally on the click that triggered the send. Re-dispatching would
 * double-apply. That's the intentional deviation from the multi path
 * — the shared local state substitutes for the wire.
 */

const HOST_ID = 'test-host'
const GUEST_ID = 'test-guest'

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
  const [myRole, setMyRole] = useState<'host' | 'guest'>('host')

  // Static players list — role toggle only changes which side we view.
  const players = useMemo(() => ([
    { id: HOST_ID, name: '방장(HOST)', ready: true, isHost: true },
    { id: GUEST_ID, name: '참가자(GUEST)', ready: true, isHost: false },
  ]), [])

  if (!selectedGameId) {
    return (
      <div className="test-mode-picker">
        <div className="lobby-top-bar">
          <button type="button" className="pixel-arrow" onClick={onExit} aria-label="뒤로">◀</button>
          <span className="lobby-title">테스트 모드 · 게임 선택</span>
        </div>
        <p className="test-mode-hint">
          P2P/로비 건너뛰고 혼자 두 역할(방장·참가자) 왔다갔다 하며 플레이. 상태는 공유되고 로직은 멀티와 동일.
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
  const isHost = myRole === 'host'
  const peerId = isHost ? HOST_ID : GUEST_ID

  return (
    <div className="game-play-container">
      <div className="test-mode-toolbar">
        <span className="test-mode-badge">TEST · 역할 전환식</span>
        <div className="test-mode-role-toggle">
          <button
            type="button"
            className={`test-mode-role-btn ${isHost ? 'is-active' : ''}`}
            onClick={() => setMyRole('host')}
          >
            방장
          </button>
          <button
            type="button"
            className={`test-mode-role-btn ${!isHost ? 'is-active' : ''}`}
            onClick={() => setMyRole('guest')}
          >
            참가자
          </button>
        </div>
      </div>
      <GameComp
        players={players}
        peerId={peerId}
        isHost={isHost}
        sendMessage={noopSend}
        onLobby={() => setSelectedGameId(null)}
        onChooseOther={() => setSelectedGameId(null)}
        onExit={onExit}
        isOpponentOnline
        matchOption={matchOption}
      />
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
