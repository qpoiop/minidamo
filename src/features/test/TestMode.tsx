import { useEffect, useMemo, useState } from 'react'
import { findGame, GAMES } from '../../games/registry'
import type { P2PMessage } from '../../hooks/useRoom'
import { ConfirmModal } from '../../components/common/ConfirmModal'
import { CONFIRM_TEST_EXIT } from '../games/common/confirmCopy'

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
  /** User's real nickname from home. Falls back to a placeholder so the
   *  HUD reads with a proper name instead of "방장(HOST)". */
  myName?: string;
}

export function TestMode({ onExit, myName = '' }: TestModeProps) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(() => readGameFromUrl())
  const [matchOption, setMatchOption] = useState<number>(3)
  const [myRole, setMyRole] = useState<'host' | 'guest'>('host')
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)

  // Back-gesture guard — pushes a sentinel entry so the browser back
  // button opens the exit confirm instead of leaving the app immediately.
  useEffect(() => {
    const stateMark = { minidamo: true, testMode: true }
    window.history.pushState(stateMark, '')
    const onPop = () => {
      setExitConfirmOpen(true)
      window.history.pushState(stateMark, '')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const requestExit = () => setExitConfirmOpen(true)

  // Static players list — role toggle only changes which side we view.
  // Names honour the real nickname if the user set one; the opposite
  // side gets a friendly placeholder so the HUD never says "HOST/GUEST".
  const players = useMemo(() => {
    const cleaned = myName.trim()
    const meName = cleaned || '나(테스터)'
    const oppName = cleaned ? `상대(${cleaned})` : '상대(테스터)'
    return [
      { id: HOST_ID, name: myRole === 'host' ? meName : oppName, ready: true, isHost: true },
      { id: GUEST_ID, name: myRole === 'guest' ? meName : oppName, ready: true, isHost: false },
    ]
  }, [myName, myRole])

  if (!selectedGameId) {
    return (
      <div className="test-mode-picker">
        <div className="lobby-top-bar">
          <button type="button" className="pixel-arrow" onClick={requestExit} aria-label="뒤로">◀</button>
          <span className="lobby-title">테스트 모드 · 게임 선택</span>
        </div>
        <p className="test-mode-hint">
          P2P/로비 건너뛰고 혼자 두 역할(방장·참가자) 왔다갔다 하며 플레이. 상태는 공유되고 로직은 멀티와 동일. 실시간 게임도 역할 전환 시 다른 쪽 시점으로 확인 가능.
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
        <span className="test-mode-badge">TEST MODE</span>
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
      {/* `key` includes matchOption so switching modes remounts the
       * game (e.g. 서바이벌 → 스프린트). It ALSO includes myRole: games
       * with per-side state (Nyangho's history / peek / disrupt) would
       * otherwise leak the host's state into the guest view when the
       * user toggles the role. The remount gives each role a fresh
       * session — cross-role P2P side-effects (peek notify, disrupt
       * on peer) don't survive the toggle in test mode, which is a
       * known limitation of the solo bench. */}
      <GameComp
        key={`${selectedGameId}-${matchOption}-${myRole}`}
        players={players}
        peerId={peerId}
        isHost={isHost}
        sendMessage={noopSend}
        onLobby={() => setSelectedGameId(null)}
        onChooseOther={() => setSelectedGameId(null)}
        onExit={requestExit}
        isOpponentOnline
        matchOption={matchOption}
        soloMode
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
      <ConfirmModal
        open={exitConfirmOpen}
        {...CONFIRM_TEST_EXIT}
        onOk={() => { setExitConfirmOpen(false); onExit() }}
        onCancel={() => setExitConfirmOpen(false)}
      />
    </div>
  )
}
