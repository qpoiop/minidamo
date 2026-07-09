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
 * 모디언트릭 (Indian Poker + Cockroach Poker 융합) · 2인 심리 베팅.
 *
 * · 각자 카드 1장. 자기 것은 못 보고 상대 것만 보임.
 * · 앤티 1 → 순차 베팅 (체크/콜 · 레이즈 · 폴드).
 * · 15판 후 칩 우세 승 or 파산 즉시.
 * · 시드 결정론: 각 판마다 호스트가 두 카드 값을 뽑고 hostScore=myVal ·
 *   guestScore=oppVal 로 브로드캐스트 (guest 관점에서 자기 카드가 뭔지
 *   실시간에 숨기려면 UI 에서 필터 · 완전한 anti-cheat 는 아니지만 P2P
 *   구조상 최선).
 *
 * P2P protocol (payload.actionType):
 *   'DT_DEAL'  · hostScore = hostCard · guestScore = guestCard · gameData = {round}
 *   'DT_BET'   · gameData = { kind: 'check'|'call'|'raise'|'fold', amount? }
 *   'DT_END'   · gameData = { winner: 'host'|'guest'|'tie', potShare?, ... }
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
  matchOption?: number;   // 총 판 수 (15 · 21)
  matchOption2?: number;  // 시작 칩 (30 · 50)
}

type BetKind = 'check' | 'call' | 'raise' | 'fold'

interface Round {
  round: number;
  hostCard: number;
  guestCard: number;
  potHost: number;
  potGuest: number;
  currentBet: number;
  toAct: 'host' | 'guest';
  phase: 'betting' | 'showdown' | 'over';
  raiseRound: number;    // 왕복 상한 계산
}

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
  const [round, setRound] = useState<Round | null>(null)
  const [matchOver, setMatchOver] = useState<'host' | 'guest' | 'tie' | null>(null)
  const [roundLog, setRoundLog] = useState<string[]>([])
  const [guideOpen, setGuideOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState<number>(3)
  const raiseAmountRef = useRef(raiseAmount)
  useEffect(() => { raiseAmountRef.current = raiseAmount }, [raiseAmount])

  const { myName, opponentName } = useRoleParticipants(players, isHost)
  const myOwner: 'host' | 'guest' = isHost ? 'host' : 'guest'
  const oppOwner: 'host' | 'guest' = isHost ? 'guest' : 'host'

  const dealNewRound = useCallback((nextRoundIdx: number) => {
    if (!isHost) return
    const hc = Math.floor(Math.random() * 10) + 1
    const gc = Math.floor(Math.random() * 10) + 1
    // 앤티 1
    setHostChips((prev) => prev - 1)
    setGuestChips((prev) => prev - 1)
    const r: Round = {
      round: nextRoundIdx,
      hostCard: hc,
      guestCard: gc,
      potHost: 1,
      potGuest: 1,
      currentBet: 0,
      toAct: nextRoundIdx % 2 === 1 ? 'host' : 'guest',  // 선공 교대
      phase: 'betting',
      raiseRound: 0,
    }
    setRound(r)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'DT_DEAL', hostScore: hc, guestScore: gc, gameData: { round: nextRoundIdx, toAct: r.toAct } },
    })
  }, [isHost, peerId, sendMessage])

  useEffect(() => {
    // 매치 시작 시 호스트가 첫 판 배분.
    if (isHost && !round && !matchOver) {
      const t = setTimeout(() => dealNewRound(1), 300)
      return () => clearTimeout(t)
    }
    return undefined
  }, [isHost, round, matchOver, dealNewRound])

  const applyMatchReset = useCallback(() => {
    setHostChips(startChips)
    setGuestChips(startChips)
    setRound(null)
    setMatchOver(null)
    setRoundLog([])
    setRaiseAmount(3)
  }, [startChips])
  const { handleRestartMatch } = useMatchRestart({ applyMatchReset, sendMessage, peerId, isHost, hostRestartRoute: onLobby })

  const finalizeRound = useCallback((r: Round, folded?: 'host' | 'guest') => {
    // 팟 이동 결정
    let payoutHost = 0
    let payoutGuest = 0
    let winner: 'host' | 'guest' | 'tie'
    if (folded) {
      winner = folded === 'host' ? 'guest' : 'host'
    } else {
      if (r.hostCard > r.guestCard) winner = 'host'
      else if (r.hostCard < r.guestCard) winner = 'guest'
      else winner = 'tie'
    }
    const pot = r.potHost + r.potGuest
    if (winner === 'host') payoutHost = pot
    else if (winner === 'guest') payoutGuest = pot
    else {
      payoutHost = Math.floor(pot / 2)
      payoutGuest = pot - payoutHost
    }
    setHostChips((prev) => prev + payoutHost)
    setGuestChips((prev) => prev + payoutGuest)
    setRoundLog((prev) => [...prev, `R${r.round} · 호스트 ${r.hostCard} vs 게스트 ${r.guestCard} → ${winner === 'tie' ? '동률 분할' : winner === 'host' ? '호스트 +' + pot : '게스트 +' + pot}${folded ? ` (${folded === 'host' ? '호스트' : '게스트'} 폴드)` : ''}`])
    setRound({ ...r, phase: 'over' })

    // 매치 종료 검사 (칩 or 판 소진)
    setTimeout(() => {
      const nextHostChips = hostChips + payoutHost - (r.potHost - 1) // approx, but state already updated
      void nextHostChips
      // Actually just read setter results directly by scheduling.
    }, 0)
  }, [hostChips])

  // 매치 종료 감시: 칩 0 or 판 소진
  useEffect(() => {
    if (matchOver) return
    if (round && round.phase === 'over') {
      const nextRoundIdx = round.round + 1
      if (hostChips <= 0) { setMatchOver('guest'); return }
      if (guestChips <= 0) { setMatchOver('host'); return }
      if (nextRoundIdx > totalRounds) {
        if (hostChips > guestChips) setMatchOver('host')
        else if (hostChips < guestChips) setMatchOver('guest')
        else setMatchOver('tie')
        return
      }
      if (isHost) {
        const t = setTimeout(() => dealNewRound(nextRoundIdx), 1400)
        return () => clearTimeout(t)
      }
    }
    return undefined
  }, [round, hostChips, guestChips, totalRounds, isHost, dealNewRound, matchOver])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.type !== 'GAME_ACTION') return
      const { actionType, hostScore, guestScore, gameData } = msg.payload
      if (actionType === 'DT_DEAL' && typeof hostScore === 'number' && typeof guestScore === 'number' && gameData) {
        const d = gameData as { round: number; toAct: 'host' | 'guest' }
        if (!isHost) {
          setHostChips((prev) => prev - 1)
          setGuestChips((prev) => prev - 1)
        }
        setRound({
          round: d.round,
          hostCard: hostScore,
          guestCard: guestScore,
          potHost: 1,
          potGuest: 1,
          currentBet: 0,
          toAct: d.toAct,
          phase: 'betting',
          raiseRound: 0,
        })
        return
      }
      if (actionType === 'DT_BET' && gameData) {
        const d = gameData as { kind: BetKind; amount?: number; actor: 'host' | 'guest' }
        applyBet(d.kind, d.actor, d.amount ?? 0, false)
        return
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  })

  const applyBet = (kind: BetKind, actor: 'host' | 'guest', amount: number, broadcast: boolean) => {
    setRound((prev) => {
      if (!prev || prev.phase !== 'betting') return prev
      const next: Round = { ...prev }
      if (kind === 'fold') {
        finalizeRound(next, actor)
        return next
      }
      if (kind === 'check') {
        // 둘 다 체크면 쇼다운. 첫 체크는 상대 응대 대기.
        if (next.currentBet === 0) {
          next.toAct = actor === 'host' ? 'guest' : 'host'
          if (next.raiseRound >= 1) {
            // 이미 한번 체크 있었으면 쇼다운
            finalizeRound(next)
            return next
          }
          next.raiseRound += 1
        } else {
          // currentBet > 0 상황에서 체크 = 콜과 동일 취급
          const need = next.currentBet
          if (actor === 'host') { next.potHost += need; setHostChips((c) => c - need) }
          else { next.potGuest += need; setGuestChips((c) => c - need) }
          finalizeRound(next)
          return next
        }
      }
      if (kind === 'call') {
        const need = next.currentBet
        if (actor === 'host') { next.potHost += need; setHostChips((c) => c - need) }
        else { next.potGuest += need; setGuestChips((c) => c - need) }
        finalizeRound(next)
        return next
      }
      if (kind === 'raise') {
        // 콜 필요분 + 증액
        const need = next.currentBet + amount
        if (actor === 'host') { next.potHost += need; setHostChips((c) => c - need) }
        else { next.potGuest += need; setGuestChips((c) => c - need) }
        next.currentBet = amount
        next.raiseRound += 1
        next.toAct = actor === 'host' ? 'guest' : 'host'
        // 왕복 3회 초과 시 강제 쇼다운
        if (next.raiseRound >= 6) {
          finalizeRound(next)
          return next
        }
      }
      return next
    })
    if (broadcast) {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'DT_BET', gameData: { kind, amount, actor } },
      })
    }
  }

  const isMyTurn = round?.phase === 'betting' && round.toAct === myOwner && !matchOver
  const canAct = isMyTurn && isOpponentOnline
  const myChips = myOwner === 'host' ? hostChips : guestChips
  const oppChips = myOwner === 'host' ? guestChips : hostChips
  const myCardHidden = round ? (myOwner === 'host' ? round.hostCard : round.guestCard) : 0
  const oppCard = round ? (myOwner === 'host' ? round.guestCard : round.hostCard) : 0
  const showdownHostCard = round?.phase === 'over' ? round.hostCard : null

  const pot = round ? round.potHost + round.potGuest : 0
  const callAmount = round?.currentBet ?? 0
  const maxRaise = Math.min(myChips - callAmount, pot * 2 || 5)

  const turnText = matchOver
    ? matchOver === myOwner ? '내 매치 승리' : matchOver === 'tie' ? '동률 매치' : '패배'
    : !isOpponentOnline ? '상대 연결 대기'
      : round?.phase === 'over' ? '결판 · 다음 판 대기'
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
          <div className="dt-side dt-side--opp">
            <span className="dt-side-label">{opponentName} · 나에게 보임</span>
            <div className={`dt-card dt-card--face`}>{oppCard}</div>
            <span className="dt-chip">칩 {oppChips}</span>
          </div>

          <div className="dt-pot" aria-live="polite">
            <span className="dt-pot-label">팟</span>
            <span className="dt-pot-value">{pot}</span>
            {round.phase === 'over' && showdownHostCard !== null && (
              <span className="dt-showdown">쇼다운 · {round.hostCard} vs {round.guestCard}</span>
            )}
          </div>

          <div className="dt-side dt-side--me">
            <span className="dt-side-label">내 카드 · 상대에게만 보임</span>
            <div className={`dt-card ${round.phase === 'over' ? 'dt-card--face' : 'dt-card--back'}`}>
              {round.phase === 'over' ? myCardHidden : '?'}
            </div>
            <span className="dt-chip">칩 {myChips}</span>
          </div>
        </div>
      )}

      {round && !matchOver && round.phase === 'betting' && (
        <div className="dt-actions">
          <div className="dt-actions-row">
            <button
              type="button"
              className="pixel-btn pixel-btn--secondary"
              disabled={!canAct}
              onClick={() => applyBet(callAmount === 0 ? 'check' : 'call', myOwner, callAmount, true)}
            >{callAmount === 0 ? '체크' : `콜 (${callAmount})`}</button>
            <button
              type="button"
              className="pixel-btn pixel-btn--ghost"
              disabled={!canAct}
              onClick={() => applyBet('fold', myOwner, 0, true)}
            >폴드</button>
          </div>
          <div className="dt-actions-row">
            <label className="dt-raise-label">
              레이즈 +{raiseAmount}
              <input
                type="range"
                min={1}
                max={Math.max(1, maxRaise)}
                value={Math.min(raiseAmount, Math.max(1, maxRaise))}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
                disabled={!canAct || maxRaise < 1}
              />
            </label>
            <button
              type="button"
              className="pixel-btn pixel-btn--primary"
              disabled={!canAct || maxRaise < 1}
              onClick={() => applyBet('raise', myOwner, raiseAmount, true)}
            >레이즈</button>
          </div>
          <div className="dt-hint">상대 카드가 낮으면 내 카드가 이길 확률↑ · 상대 베팅이 세면 내 카드가 낮다는 신호일 수 있어요.</div>
        </div>
      )}

      {roundLog.length > 0 && (
        <div className="dt-log">
          {roundLog.slice(-4).map((line, i) => (
            <div key={i} className="dt-log-line">{line}</div>
          ))}
        </div>
      )}

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: round?.toAct === (p.isHost ? 'host' : 'guest') && round?.phase === 'betting' && !matchOver,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">칩 {p.isHost ? hostChips : guestChips}</span>,
        }))}
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <TurnTransitionToast isMyTurn={!!isMyTurn} opponentName={opponentName} suppress={!!matchOver} />
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
      <span className="sr-only">내 이름 {myName} · 상대 {oppOwner}</span>
    </div>
  )
}
