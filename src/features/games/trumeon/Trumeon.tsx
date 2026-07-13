import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { deal, points, suitLabel, trickWinner } from './briscola'
import type { Card, Suit } from './briscola'
import './trumeon.css'

/**
 * 모루먼쇼 (Briscola) · 2인 트릭테이킹.
 *
 * 상태는 하나의 GameState 로 통합 · 모든 액션은 순수함수로 (state, action) → state 전환.
 * 리스너·UI 는 최신 상태를 setState 콜백에서 계산해 stale closure 를 피함.
 *
 * P2P protocol:
 *   TM_INIT  · hostScore = seed
 *   TM_PLAY  · gameData = { actor, cardId }
 */

interface TrumeonProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  reconnecting?: boolean;
  soloMode?: boolean;
  matchOption?: number;
}

type Actor = 'host' | 'guest'

interface GameState {
  seed: number;
  hostHand: Card[];
  guestHand: Card[];
  stock: Card[];        // top = last element
  trump: Card | null;
  hostScore: number;
  guestScore: number;
  leadCard: Card | null;
  leadActor: Actor;
  nextToPlay: Actor;
  lastTrick: { lead: Card; follow: Card; winner: Actor; gained: number } | null;
  winner: Actor | 'tie' | null;
}

function initFromSeed(seed: number): GameState {
  const d = deal(seed)
  return {
    seed,
    hostHand: d.hostHand,
    guestHand: d.guestHand,
    stock: d.stock,
    trump: d.trump,
    hostScore: 0,
    guestScore: 0,
    leadCard: null,
    leadActor: 'host',
    nextToPlay: 'host',
    lastTrick: null,
    winner: null,
  }
}

function emptyState(): GameState {
  return {
    seed: 0,
    hostHand: [], guestHand: [], stock: [], trump: null,
    hostScore: 0, guestScore: 0,
    leadCard: null, leadActor: 'host', nextToPlay: 'host',
    lastTrick: null, winner: null,
  }
}

function legalCardsInHand(state: GameState, actor: Actor): Card[] {
  const hand = actor === 'host' ? state.hostHand : state.guestHand
  const strictFollow = state.stock.length === 0
  if (!state.leadCard || !strictFollow) return hand
  const trumpSuit = state.trump?.suit
  const sameSuit = hand.filter((c) => c.suit === state.leadCard!.suit)
  if (sameSuit.length > 0) return sameSuit
  const trumps = trumpSuit ? hand.filter((c) => c.suit === trumpSuit) : []
  if (trumps.length > 0) return trumps
  return hand
}

function playAction(state: GameState, actor: Actor, cardId: number, targetScore: number): GameState {
  const hand = actor === 'host' ? state.hostHand : state.guestHand
  const card = hand.find((c) => c.id === cardId)
  if (!card) return state
  const legal = legalCardsInHand(state, actor)
  if (!legal.some((c) => c.id === cardId)) return state
  if (state.nextToPlay !== actor) return state
  if (state.winner) return state

  const newHand = hand.filter((c) => c.id !== cardId)
  const nextState: GameState = { ...state }
  if (actor === 'host') nextState.hostHand = newHand
  else nextState.guestHand = newHand

  if (!nextState.leadCard) {
    nextState.leadCard = card
    nextState.leadActor = actor
    nextState.nextToPlay = actor === 'host' ? 'guest' : 'host'
    return nextState
  }

  // 후 카드 → 트릭 결정
  const trumpSuit: Suit = nextState.trump?.suit ?? 'cheese'
  const w = trickWinner(nextState.leadCard, card, trumpSuit)
  const winnerActor: Actor = w === 'lead' ? nextState.leadActor : (nextState.leadActor === 'host' ? 'guest' : 'host')
  const gained = points(nextState.leadCard.rank) + points(card.rank)
  if (winnerActor === 'host') nextState.hostScore += gained
  else nextState.guestScore += gained

  nextState.lastTrick = {
    lead: nextState.leadCard,
    follow: card,
    winner: winnerActor,
    gained,
  }

  // 보충 · 승자 먼저 · 스톡 top = 배열 끝
  const stock = nextState.stock.slice()
  const draw1 = stock.pop()
  const draw2 = stock.pop()
  if (draw1) {
    if (winnerActor === 'host') nextState.hostHand = [...nextState.hostHand, draw1]
    else nextState.guestHand = [...nextState.guestHand, draw1]
  }
  if (draw2) {
    const loser: Actor = winnerActor === 'host' ? 'guest' : 'host'
    if (loser === 'host') nextState.hostHand = [...nextState.hostHand, draw2]
    else nextState.guestHand = [...nextState.guestHand, draw2]
  }
  nextState.stock = stock
  nextState.leadCard = null
  nextState.leadActor = winnerActor
  nextState.nextToPlay = winnerActor

  // 승리 검사
  if (nextState.hostScore >= targetScore) nextState.winner = 'host'
  else if (nextState.guestScore >= targetScore) nextState.winner = 'guest'
  else if (nextState.hostHand.length === 0 && nextState.guestHand.length === 0 && nextState.stock.length === 0) {
    if (nextState.hostScore > nextState.guestScore) nextState.winner = 'host'
    else if (nextState.hostScore < nextState.guestScore) nextState.winner = 'guest'
    else nextState.winner = 'tie'
  }
  return nextState
}

export function Trumeon({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true, reconnecting = false, soloMode = false,
  matchOption = 61,
}: TrumeonProps) {
  const targetScore = matchOption

  // solo(테스트) 모드는 단일 공유 인스턴스라 상대 호스트가 없다. guest
  // 역할이어도 직접 seed 를 만들어 보드를 세우지 않으면 emptyState 로
  // 굳어 "보드 동기화 중" 에서 영영 멈춘다. MemoryMatch·BombHunt 와
  // 동일한 (isHost || soloMode) 관례.
  const ownsBoard = isHost || soloMode

  const [state, setState] = useState<GameState>(() => (
    ownsBoard ? initFromSeed((Math.random() * 2 ** 31) | 0) : emptyState()
  ))
  const [guideOpen, setGuideOpen] = useState(false)
  const seedRef = useRef(state.seed)
  useEffect(() => { seedRef.current = state.seed }, [state.seed])

  const { myName, opponentName } = useRoleParticipants(players, isHost)
  const myOwner: Actor = isHost ? 'host' : 'guest'
  const isMyTurn = !!(state.trump && state.nextToPlay === myOwner && !state.winner)
  const canAct = isMyTurn && isOpponentOnline

  // Host → guest seed 전파
  useEffect(() => {
    if (!isHost) return
    if (seedRef.current === 0) return
    const t = setTimeout(() => {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'TM_INIT', hostScore: seedRef.current },
      })
    }, 60)
    return () => clearTimeout(t)
  }, [isHost, peerId, sendMessage])

  useEffect(() => {
    if (isHost) return
    if (!isOpponentOnline) return
    if (state.seed !== 0) return
    const t = setTimeout(() => {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'TM_HELLO' },
      })
    }, 400)
    return () => clearTimeout(t)
  }, [isHost, isOpponentOnline, state.seed, peerId, sendMessage])

  // P2P 리스너 · ref 로 최신 핸들러 참조. addEventListener 는 mount 한 번만.
  const onMsgRef = useRef<(e: Event) => void>(() => {})
  useEffect(() => {
    onMsgRef.current = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.type !== 'GAME_ACTION') return
      const { actionType, hostScore, gameData } = msg.payload
      if (actionType === 'TM_HELLO' && isHost) {
        sendMessage({
          type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
          payload: { actionType: 'TM_INIT', hostScore: seedRef.current },
        })
        return
      }
      if (actionType === 'TM_INIT' && typeof hostScore === 'number' && !isHost) {
        setState((prev) => prev.seed === hostScore ? prev : initFromSeed(hostScore))
        return
      }
      if (actionType === 'TM_PLAY' && gameData) {
        const d = gameData as { actor: Actor; cardId: number }
        setState((prev) => playAction(prev, d.actor, d.cardId, targetScore))
        return
      }
    }
  })
  useEffect(() => {
    const handler = (e: Event) => onMsgRef.current(e)
    window.addEventListener('p2p_message', handler)
    return () => window.removeEventListener('p2p_message', handler)
  }, [])

  const applyMatchReset = useCallback(() => {
    const next = ownsBoard ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = next
    setState(next !== 0 ? initFromSeed(next) : emptyState())
    return next
  }, [ownsBoard])
  const onHostPostReset = useCallback((next: number) => {
    setTimeout(() => {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'TM_INIT', hostScore: next },
      })
    }, 60)
  }, [sendMessage, peerId])
  const { handleRestartMatch } = useMatchRestart({
    applyMatchReset, sendMessage, peerId, isHost, onHostPostReset,
  })

  const playCard = (cardId: number) => {
    if (!canAct) return
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'TM_PLAY', gameData: { actor: myOwner, cardId } },
    })
    setState((prev) => playAction(prev, myOwner, cardId, targetScore))
  }

  const myHand = myOwner === 'host' ? state.hostHand : state.guestHand
  const strictFollow = state.stock.length === 0
  const myLegal = useMemo(() => new Set(legalCardsInHand(state, myOwner).map((c) => c.id)), [state, myOwner])

  const myScore = myOwner === 'host' ? state.hostScore : state.guestScore
  const oppScore = myOwner === 'host' ? state.guestScore : state.hostScore

  const outcome: 'win' | 'lose' | 'draw' | undefined = state.winner
    ? state.winner === myOwner ? 'win' : state.winner === 'tie' ? 'draw' : 'lose'
    : undefined

  const turnText = state.winner
    ? state.winner === myOwner ? '내 매치 승' : state.winner === 'tie' ? '점수 동률' : '패배'
    : !isOpponentOnline ? '상대 연결 대기'
      : !state.trump ? '보드 동기화 중'
      : state.leadCard
        ? isMyTurn ? '내 턴 · 후 카드' : `${opponentName} 후 카드 대기`
        : isMyTurn ? '내 턴 · 리드 카드' : `${opponentName} 리드 카드`

  return (
    <div className="game-screen" data-my-turn={isMyTurn && !state.winner ? '1' : '0'}>
      <GameHeader
        code="TRUMEON"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={`으뜸 ${state.trump ? suitLabel(state.trump.suit) : '—'} · 더미 ${state.stock.length} · 나 ${myScore} / ${targetScore}`}
        variant={state.winner ? 'idle' : canAct ? 'default' : 'idle'}
        isMyTurn={canAct}
      />

      {/* 상단: 으뜸 chip + 점수 progress bar · 시안 §10a 대로. */}
      <div className="tm-topbar">
        {state.trump && (
          <div className={`tm-trump-chip tm-trump-chip--${state.trump.suit}`} aria-label={`으뜸 무늬 ${suitLabel(state.trump.suit)}`}>
            <span className="tm-trump-chip-label">으뜸</span>
            <span className="tm-trump-chip-suit">{suitLabel(state.trump.suit)}</span>
          </div>
        )}
      </div>

      <div className="tm-scoreboard">
        <div className="tm-score-row">
          <span className="tm-score-name">나</span>
          <div className="tm-score-bar" role="progressbar" aria-valuemin={0} aria-valuemax={targetScore} aria-valuenow={myScore}>
            <div className="tm-score-fill" style={{ width: `${Math.min(100, (myScore / targetScore) * 100)}%` }} />
          </div>
        </div>
        <div className="tm-score-row tm-score-row--opp">
          <span className="tm-score-name">상대</span>
          <div className="tm-score-bar">
            <div className="tm-score-fill" style={{ width: `${Math.min(100, (oppScore / targetScore) * 100)}%` }} />
          </div>
        </div>
        <div className="tm-meta">목표 {targetScore}점 · 더미 {state.stock.length}장 {strictFollow && '· 무늬 강제 국면'}</div>
      </div>

      {/* 트릭 자리 · 시안 §10a-② */}
      <div className="tm-trick-area">
        <span className="tm-trick-label">트릭 자리</span>
        <div className="tm-trick-slots" aria-live="polite">
          <div className="tm-trick-slot">
            {state.leadCard ? (
              <div className={`tm-card tm-card--${state.leadCard.suit}`}>
                <span className="tm-card-rank">{state.leadCard.rank}</span>
                <span className="tm-card-paw" aria-hidden="true">🐾</span>
                <span className="tm-card-pt">{points(state.leadCard.rank)}pt</span>
              </div>
            ) : (
              <div className="tm-card tm-card--empty"><span className="tm-slot-label">{state.leadActor === myOwner ? '내 리드' : `${opponentName} 리드`}</span></div>
            )}
          </div>
          <div className="tm-trick-slot">
            <div className="tm-card tm-card--empty tm-card--dashed"><span className="tm-slot-label">{state.leadActor === myOwner ? `${opponentName} 후` : '내 후'}</span></div>
          </div>
        </div>
      </div>

      {state.lastTrick && !state.leadCard && (
        <div className="tm-last-trick">
          <b>직전 트릭 · </b>
          {state.lastTrick.winner === myOwner ? '내가 획득' : '상대 획득'} (+{state.lastTrick.gained}점)
        </div>
      )}

      <div className="tm-hand" role="group" aria-label="내 손패">
        <span className="tm-hand-label">내 손패 (탭 → 확정)</span>
        <div className="tm-hand-cards">
          {myHand.map((c) => {
            const legal = myLegal.has(c.id) && isMyTurn
            return (
              <button
                key={c.id}
                type="button"
                className={`tm-card tm-card--${c.suit} tm-card--play ${legal ? '' : 'is-locked'}`}
                disabled={!canAct || !legal}
                onClick={() => playCard(c.id)}
                title={legal ? '이 카드 내기' : strictFollow ? '이 국면엔 무늬를 따라야 해요' : ''}
                aria-label={`${c.rank} ${suitLabel(c.suit)} ${points(c.rank)}점`}
              >
                <span className="tm-card-rank">{c.rank}</span>
                <span className="tm-card-paw" aria-hidden="true">🐾</span>
                <span className="tm-card-pt">{points(c.rank)}</span>
              </button>
            )
          })}
        </div>
        <div className="tm-hand-notice">
          카드를 골라 트릭에 내세요 · 점수 pip 확인
          {strictFollow && ' · 종반은 무늬 따르기 강제, 낼 수 없는 카드는 흐리게 잠겨요'}
        </div>
      </div>

      <GamePlayerHud
        rows={players.map((p) => {
          const owner: Actor = p.isHost ? 'host' : 'guest'
          const handSize = owner === 'host' ? state.hostHand.length : state.guestHand.length
          return {
            player: p,
            active: state.nextToPlay === owner && !state.winner,
            online: p.id === peerId ? true : isOpponentOnline,
            extra: <span className="participant-symbol">손 {handSize} · {owner === 'host' ? state.hostScore : state.guestScore}점</span>,
          }
        })}
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} reconnecting={reconnecting} onExit={onExit} />
      <TurnTransitionToast isMyTurn={isMyTurn} opponentName={opponentName} suppress={!!state.winner} />
      <RegistryGuide gameId="trumeon" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {state.winner && (
        <GameOverModal
          title={outcome === 'win' ? 'YOU WIN' : outcome === 'draw' ? 'DRAW' : 'YOU LOSE'}
          winnerText={outcome === 'win' ? `${targetScore}점 선도달` : outcome === 'draw' ? '점수 동률' : '점수 열세'}
          outcome={outcome}
          scoreSummary={[
            { label: '내 점수', value: myScore, highlight: outcome === 'win' },
            { label: '상대 점수', value: oppScore },
          ]}
          note={outcome === 'win' ? '트릭 흐름 관리에 성공했어요.' : outcome === 'draw' ? '드문 동률 · 마지막 트릭 획득자 승 옵션 검토.' : `${opponentName} 이 점수 흐름을 가져갔어요.`}
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

