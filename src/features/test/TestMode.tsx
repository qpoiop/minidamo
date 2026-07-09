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
   *  HUD reads with a proper name instead of "호스트(HOST)". */
  myName?: string;
}

export function TestMode({ onExit, myName = '' }: TestModeProps) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(() => readGameFromUrl())
  const [matchOption, setMatchOption] = useState<number>(3)
  // 2-axis 옵션이 있는 게임 (냥파장 오차 × 승리 점수) 을 테스트모드에
  // 서도 조절할 수 있게 노출. 첫 로드는 각 게임 def 의 첫 번째 값을
  // 자동 스냅.
  const [matchOption2, setMatchOption2] = useState<number | undefined>(undefined)
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

  // Players list — the active side takes the tester's real nickname,
  // the opposite side gets a distinct fake identity so the HUD reads
  // as two different people (the previous "상대(홍길동)" wrap made both
  // slots look identical).
  const players = useMemo(() => {
    const cleaned = myName.trim() || '나(테스터)'
    const opponent = '테스트 상대'
    return [
      { id: HOST_ID, name: myRole === 'host' ? cleaned : opponent, ready: true, isHost: true },
      { id: GUEST_ID, name: myRole === 'guest' ? cleaned : opponent, ready: true, isHost: false },
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
          P2P/로비 건너뛰고 혼자 두 역할(호스트·참가자) 왔다갔다 하며 플레이. 상태는 공유되고 로직은 멀티와 동일. 실시간 게임도 역할 전환 시 다른 쪽 시점으로 확인 가능.
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
            호스트
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
       * game (e.g. 서바이벌 → 스프린트). We deliberately do NOT include
       * myRole — remounting on role toggle wiped the shared board /
       * seed too, which read as "the game restarted". Instead we keep
       * one shared instance and let the tester switch which side they
       * are viewing. Solo-side effects (peek notify / disrupt on peer)
       * are the accepted trade-off. */}
      <GameComp
        key={`${selectedGameId}-${matchOption}-${matchOption2 ?? ''}`}
        players={players}
        peerId={peerId}
        isHost={isHost}
        sendMessage={noopSend}
        onLobby={() => setSelectedGameId(null)}
        onChooseOther={() => setSelectedGameId(null)}
        onExit={requestExit}
        isOpponentOnline
        matchOption={matchOption}
        matchOption2={matchOption2 ?? def.matchOptions2?.[0]?.value}
        soloMode
      />
      <div className="test-mode-option-row">
        <label htmlFor="test-mo">{def.matchOptionsLabel ?? '옵션'}</label>
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
      {/* 2-axis 옵션 (예: 냥파장 승리 점수) 지원. 게임 def 에 정의
       * 되어 있을 때만 노출. */}
      {def.matchOptions2 && def.matchOptions2.length > 0 && (
        <div className="test-mode-option-row">
          <label htmlFor="test-mo2">{def.matchOption2Label ?? '옵션 2'}</label>
          <select
            id="test-mo2"
            className="pixel-select"
            value={matchOption2 ?? def.matchOptions2[0].value}
            onChange={(e) => setMatchOption2(Number(e.target.value))}
          >
            {def.matchOptions2.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}
      <ConfirmModal
        open={exitConfirmOpen}
        {...CONFIRM_TEST_EXIT}
        onOk={() => { setExitConfirmOpen(false); onExit() }}
        onCancel={() => setExitConfirmOpen(false)}
      />
    </div>
  )
}
