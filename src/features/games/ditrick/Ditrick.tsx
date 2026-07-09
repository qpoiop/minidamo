import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { TurnTransitionToast } from '../common/TurnTransitionToast'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { RegistryGuide } from '../common/RegistryGuide'
import { useRoleParticipants } from '../common/useRoleParticipants'
import { useMatchRestart } from '../common/useMatchRestart'
import './ditrick.css'

/**
 * 모디언트릭 (Indian Poker MVP) · 2인 심리 베팅.
 *
 * · 각자 카드 1장 · 자기 것 뒷면 · 상대 것 앞면. 앤티 1.
 * · 액션: 체크 · 콜 · 레이즈 · 폴드.
 * · 총 판 수 후 칩 우세 승 · 상대 칩 0 시 즉시 승.
 *
 * 결정론: 호스트가 카드 값을 랜덤 뽑아 DT_DEAL 로 전파. 이후 액션은
 * 순차 브로드캐스트 · 양쪽이 같은 라운드 상태를 유지.
 *
 * P2P protocol:
 *   DT_DEAL   · hostScore = hostCard · guestScore = guestCard · gameData = { round, firstToAct }
 *   DT_BET    · gameData = { actor, kind: 'check'|'call'|'raise'|'fold', amount? }
 */

interface DitrickProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  soloMode?: boolean;
  matchOption?: number;   // 판 수
  matchOption2?: number;  // 시작 칩
}

type BetKind = 'check' | 'call' | 'raise' | 'fold'
type Actor = 'host' | 'guest'

interface RoundState {
  round: number;
  hostCard: number;
  guestCard: number;
  pot: number;
  currentBet: number;    // 콜에 필요한 액수
  toAct: Actor;
  raiseCount: number;    // 왕복 상한
  hostFolded: boolean;
  guestFolded: boolean;
  bothChecked: boolean;
}

interface LogEntry { round: number; text: string }

export function Ditrick({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true, soloMode = false,
  matchOption = 15, matchOption2 = 30,
}: DitrickProps) {
  void soloMode

  const totalRounds = matchOption
  const startChips = matchOption2

  const [hostChips, setHostChips] = useState<number>(startChips)
  const [guestChips, setGuestChips] = useState<number>(startChips)
  const [round, setRound] = useState<RoundState | null>(null)
  const [showdownVisible, setShowdownVisible] = useState<boolean>(false)
  const [matchOver, setMatchOver] = useState<Actor | 'tie' | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [guideOpen, setGuideOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState<number>(3)

  const hostChipsRef = useRef(hostChips)
  const guestChipsRef = useRef(guestChips)
  useEffect(() => { hostChipsRef.current = hostChips }, [hostChips])
  useEffect(() => { guestChipsRef.current = guestChips }, [guestChips])

  const { myName, opponentName } = useRoleParticipants(players, isHost)
  const myOwner: Actor = isHost ? 'host' : 'guest'

  const startRound = useCallback((idx: number) => {
    if (!isHost) return
    const hc = Math.floor(Math.random() * 10) + 1
    const gc = Math.floor(Math.random() * 10) + 1
    const firstToAct: Actor = idx % 2 === 1 ? 'host' : 'guest'
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'DT_DEAL', hostScore: hc, guestScore: gc, gameData: { round: idx, firstToAct } },
    })
    applyDeal(idx, hc, gc, firstToAct)
  }, [isHost, peerId, sendMessage])

  const applyDeal = (idx: number, hc: number, gc: number, firstToAct: Actor) => {
    // 앤티 1 씩
    setHostChips((c) => c - 1)
    setGuestChips((c) => c - 1)
    setRound({
      round: idx,
      hostCard: hc,
      guestCard: gc,
      pot: 2,
      currentBet: 0,
      toAct: firstToAct,
      raiseCount: 0,
      hostFolded: false,
      guestFolded: false,
      bothChecked: false,
    })
    setShowdownVisible(false)
    setRaiseAmount(3)
  }

  useEffect(() => {
    if (!isHost) return
    if (round || matchOver) return
    const t = setTimeout(() => startRound(1), 300)
    return () => clearTimeout(t)
  }, [isHost, round, matchOver, startRound])

  const applyMatchReset = useCallback(() => {
    setHostChips(startChips)
    setGuestChips(startChips)
    setRound(null)
    setShowdownVisible(false)
    setMatchOver(null)
    setLog([])
    setRaiseAmount(3)
  }, [startChips])
  const { handleRestartMatch } = useMatchRestart({
    applyMatchReset, sendMessage, peerId, isHost, hostRestartRoute: onLobby,
  })

  function finalizeRound(r: RoundState, cause: 'showdown' | Actor /* folded actor */) {
    setShowdownVisible(cause === 'showdown')
    let winner: Actor | 'tie'
    if (cause === 'host') winner = 'guest'
    else if (cause === 'guest') winner = 'host'
    else winner = r.hostCard > r.guestCard ? 'host' : r.hostCard < r.guestCard ? 'guest' : 'tie'

    if (winner === 'tie') {
      const half = Math.floor(r.pot / 2)
      const extra = r.pot - half * 2
      setHostChips((c) => c + half + (r.toAct === 'host' ? extra : 0))
      setGuestChips((c) => c + half + (r.toAct === 'guest' ? extra : 0))
    } else if (winner === 'host') setHostChips((c) => c + r.pot)
    else setGuestChips((c) => c + r.pot)

    setLog((prev) => [...prev, {
      round: r.round,
      text: cause === 'showdown'
        ? `R${r.round} · 쇼다운 · ${r.hostCard} vs ${r.guestCard} → ${winner === 'tie' ? '동률 분할' : winner === 'host' ? '호스트 +' + r.pot : '게스트 +' + r.pot}`
        : `R${r.round} · ${cause === 'host' ? '호스트' : '게스트'} 폴드 → ${winner === 'host' ? '호스트 +' + r.pot : '게스트 +' + r.pot}`,
    }])

    // 다음 판 · 매치 종료 체크. hostChips/guestChips 는 setter 후 useEffect 로 감지.
    setRound((prev) => prev ? { ...prev, toAct: winner === 'tie' ? prev.toAct : winner as Actor } : prev)

    setTimeout(() => {
      const nextIdx = r.round + 1
      const hc = hostChipsRef.current + (winner === 'host' ? r.pot : winner === 'tie' ? Math.floor(r.pot / 2) : 0)
      const gc = guestChipsRef.current + (winner === 'guest' ? r.pot : winner === 'tie' ? Math.ceil(r.pot / 2) : 0)
      if (hc <= 0) { setMatchOver('guest'); return }
      if (gc <= 0) { setMatchOver('host'); return }
      if (nextIdx > totalRounds) {
        setMatchOver(hc > gc ? 'host' : hc < gc ? 'guest' : 'tie')
        return
      }
      if (isHost) startRound(nextIdx)
    }, 1600)
  }

  function applyBet(actor: Actor, kind: BetKind, amount = 0) {
    setRound((prev) => {
      if (!prev) return prev
      if (prev.toAct !== actor) return prev
      const next: RoundState = { ...prev }
      if (kind === 'fold') {
        finalizeRound(next, actor)
        return next
      }
      if (kind === 'check') {
        if (next.currentBet !== 0) {
          // 콜과 동등 취급 (없는 상황이지만 방어)
          const need = next.currentBet
          next.pot += need
          if (actor === 'host') setHostChips((c) => c - need); else setGuestChips((c) => c - need)
          finalizeRound(next, 'showdown')
          return next
        }
        if (next.bothChecked) {
          // 이미 체크 있었으면 두 번째 = 즉시 쇼다운
          finalizeRound(next, 'showdown')
          return next
        }
        next.bothChecked = true
        next.toAct = actor === 'host' ? 'guest' : 'host'
        return next
      }
      if (kind === 'call') {
        const need = next.currentBet
        next.pot += need
        if (actor === 'host') setHostChips((c) => c - need); else setGuestChips((c) => c - need)
        finalizeRound(next, 'showdown')
        return next
      }
      if (kind === 'raise') {
        // 콜 필요분 + 증액. 남은 칩 초과면 all-in 스냅.
        const availableChips = actor === 'host' ? hostChipsRef.current : guestChipsRef.current
        const bet = Math.min(next.currentBet + amount, availableChips)
        next.pot += bet
        if (actor === 'host') setHostChips((c) => c - bet); else setGuestChips((c) => c - bet)
        next.currentBet = Math.max(0, bet - next.currentBet)
        next.raiseCount += 1
        next.bothChecked = false
        next.toAct = actor === 'host' ? 'guest' : 'host'
        // 왕복 상한 (레이즈 3회 후 강제 콜 요구 · 계속 raiseCount 세면 무한 방지)
        if (next.raiseCount >= 5) {
          finalizeRound(next, 'showdown')
        }
      }
      return next
    })
  }

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.type !== 'GAME_ACTION') return
      const { actionType, hostScore, guestScore, gameData } = msg.payload
      if (actionType === 'DT_DEAL' && typeof hostScore === 'number' && typeof guestScore === 'number' && gameData) {
        if (isHost) return // host 는 이미 자신이 apply 함
        const d = gameData as { round: number; firstToAct: Actor }
        applyDeal(d.round, hostScore, guestScore, d.firstToAct)
        return
      }
      if (actionType === 'DT_BET' && gameData) {
        const d = gameData as { actor: Actor; kind: BetKind; amount?: number }
        applyBet(d.actor, d.kind, d.amount)
        return
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  })

  const doAction = (kind: BetKind, amount = 0) => {
    if (!round || round.toAct !== myOwner || matchOver) return
    if (!isOpponentOnline) return
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'DT_BET', gameData: { actor: myOwner, kind, amount } },
    })
    applyBet(myOwner, kind, amount)
  }

  const isMyTurn = !!(round && round.toAct === myOwner && !matchOver && !showdownVisible)
  const canAct = isMyTurn && isOpponentOnline
  const myChips = myOwner === 'host' ? hostChips : guestChips
  const oppChips = myOwner === 'host' ? guestChips : hostChips
  const myCardHidden = round ? (myOwner === 'host' ? round.hostCard : round.guestCard) : 0
  const oppCard = round ? (myOwner === 'host' ? round.guestCard : round.hostCard) : 0
  const pot = round?.pot ?? 0
  const callAmount = round?.currentBet ?? 0
  const maxRaise = Math.max(1, Math.min(myChips - callAmount, Math.max(pot * 2, 5)))

  const turnText = matchOver
    ? matchOver === myOwner ? '내 매치 승' : matchOver === 'tie' ? '동률 매치' : '패배'
    : !isOpponentOnline ? '상대 연결 대기'
      : showdownVisible ? '쇼다운 · 다음 판 대기'
      : isMyTurn ? '내 베팅 차례' : `${opponentName} 베팅 중`

  const outcome: 'win' | 'lose' | 'draw' | undefined = matchOver
    ? matchOver === myOwner ? 'win' : matchOver === 'tie' ? 'draw' : 'lose'
    : undefined

  return (
    <div className="game-screen" data-my-turn={isMyTurn && !matchOver ? '1' : '0'}>
      <GameHeader
        code="DITRICK"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={`${round?.round ?? 0} / ${totalRounds}판 · 팟 ${pot} · 내 칩 ${myChips} · 상대 ${oppChips}`}
        variant={matchOver ? 'idle' : canAct ? 'default' : 'idle'}
        isMyTurn={canAct}
      />

      {round && (
        <div className="dt-arena">
          <div className="dt-side">
            <span className="dt-side-label">{opponentName} · 나에게 보임</span>
            <div className="dt-card dt-card--face">{oppCard}</div>
            <span className="dt-chip">칩 {oppChips}</span>
          </div>

          <div className="dt-pot">
            <span className="dt-pot-label">팟</span>
            <span className="dt-pot-value">{pot}</span>
            {showdownVisible && (
              <span className="dt-showdown">쇼다운 · {round.hostCard} vs {round.guestCard}</span>
            )}
          </div>

          <div className="dt-side">
            <span className="dt-side-label">내 카드 · 상대에게만 보임</span>
            <div className={`dt-card ${showdownVisible ? 'dt-card--face' : 'dt-card--back'}`}>
              {showdownVisible ? myCardHidden : '?'}
            </div>
            <span className="dt-chip">칩 {myChips}</span>
          </div>
        </div>
      )}

      {round && !matchOver && !showdownVisible && (
        <div className="dt-actions">
          <div className="dt-actions-row">
            <button
              type="button"
              className="pixel-btn pixel-btn--secondary"
              disabled={!canAct}
              onClick={() => doAction(callAmount === 0 ? 'check' : 'call')}
            >{callAmount === 0 ? '체크' : `콜 (${callAmount})`}</button>
            <button
              type="button"
              className="pixel-btn pixel-btn--ghost"
              disabled={!canAct}
              onClick={() => doAction('fold')}
            >폴드</button>
          </div>
          <div className="dt-actions-row">
            <label className="dt-raise-label">
              레이즈 +{raiseAmount}
              <input
                type="range"
                min={1}
                max={maxRaise}
                value={Math.min(raiseAmount, maxRaise)}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
                disabled={!canAct || maxRaise < 1}
              />
            </label>
            <button
              type="button"
              className="pixel-btn pixel-btn--primary"
              disabled={!canAct || maxRaise < 1}
              onClick={() => doAction('raise', Math.min(raiseAmount, maxRaise))}
            >레이즈</button>
          </div>
          <div className="dt-hint">상대 카드가 낮으면 내 카드가 이길 확률↑. 세게 나오는 상대는 신호일 수 있어요.</div>
        </div>
      )}

      {log.length > 0 && (
        <div className="dt-log">
          {log.slice(-4).map((entry, i) => (
            <div key={i} className="dt-log-line">{entry.text}</div>
          ))}
        </div>
      )}

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: round?.toAct === (p.isHost ? 'host' : 'guest') && !matchOver && !showdownVisible,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">칩 {p.isHost ? hostChips : guestChips}</span>,
        }))}
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <TurnTransitionToast isMyTurn={isMyTurn} opponentName={opponentName} suppress={!!matchOver} />
      <RegistryGuide gameId="ditrick" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {matchOver && (
        <GameOverModal
          title={outcome === 'win' ? 'YOU WIN' : outcome === 'draw' ? 'DRAW' : 'YOU LOSE'}
          winnerText={outcome === 'win' ? '칩 우위 매치 승' : outcome === 'draw' ? '칩 동률' : '칩 열위'}
          outcome={outcome}
          scoreSummary={[
            { label: '내 칩', value: myChips, highlight: outcome === 'win' },
            { label: '상대 칩', value: oppChips },
          ]}
          note={outcome === 'win' ? '읽기·베팅 심리에서 우세했어요.' : outcome === 'draw' ? '접전 끝 무승부.' : `${opponentName} 의 심리전이 한 수 위였어요.`}
          onRestart={handleRestartMatch}
          onLobby={onLobby}
          onChooseOther={onChooseOther}
          onExit={onExit}
          restartDisabled={!isOpponentOnline}
          restartHint={!isOpponentOnline ? '상대방 재연결 대기 중' : undefined}
        />
      )}
      <span className="sr-only">내 이름 {myName}</span>
    </div>
  )
}
