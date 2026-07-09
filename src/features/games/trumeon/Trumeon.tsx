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
import type { Card } from './briscola'
import './trumeon.css'

/**
 * 모루먼쇼 (Briscola) · 2인 트릭테이킹.
 *
 * · 40장 덱, 손패 3장, 트럼프 무늬 고정.
 * · 트릭: 선(리드) 1장 → 후 1장 → 판정 → 승자 두 장 획득 → 보충.
 * · 더미 소진 후 손패 3장으로 마무리 · 이때부터 무늬 따르기 강제.
 * · 61점 선도달 즉시 승 · 아니면 종반 후 합산 우위 승.
 *
 * P2P protocol:
 *   'TM_INIT'  · hostScore = seed (호스트 → 게스트)
 *   'TM_PLAY'  · gameData = { cardId, actor: 'host'|'guest' }
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
  soloMode?: boolean;
  matchOption?: number;
}

export function Trumeon({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true, soloMode = false,
  matchOption = 61,
}: TrumeonProps) {
  void soloMode

  const targetScore = matchOption

  const [seed, setSeed] = useState<number>(() => (isHost ? (Math.random() * 2 ** 31) | 0 : 0))
  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])

  const initial = useMemo(() => seed !== 0 ? deal(seed) : null, [seed])

  // 라이브 상태 (양쪽 동일 시드라 로컬 계산 가능).
  const [hostHand, setHostHand] = useState<Card[]>([])
  const [guestHand, setGuestHand] = useState<Card[]>([])
  const [stock, setStock] = useState<Card[]>([])
  const [hostScore, setHostScore] = useState(0)
  const [guestScore, setGuestScore] = useState(0)
  const [leadCard, setLeadCard] = useState<Card | null>(null)
  const [leadActor, setLeadActor] = useState<'host' | 'guest'>('host')
  const [nextToPlay, setNextToPlay] = useState<'host' | 'guest'>('host')
  const [trumpCard, setTrumpCard] = useState<Card | null>(null)
  const [winner, setWinner] = useState<'host' | 'guest' | 'tie' | null>(null)
  const [lastTrick, setLastTrick] = useState<{ lead: Card; follow: Card; winner: 'host' | 'guest' } | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  const { myName, opponentName } = useRoleParticipants(players, isHost)
  const myOwner: 'host' | 'guest' = isHost ? 'host' : 'guest'

  useEffect(() => {
    if (initial) {
      setHostHand(initial.hostHand)
      setGuestHand(initial.guestHand)
      setStock(initial.stock)
      setTrumpCard(initial.trump)
    }
  }, [initial])

  useEffect(() => {
    if (isHost) {
      const t = setTimeout(() => {
        sendMessage({
          type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
          payload: { actionType: 'TM_INIT', hostScore: seedRef.current },
        })
      }, 60)
      return () => clearTimeout(t)
    }
    return undefined
  }, [isHost, peerId, sendMessage])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.type !== 'GAME_ACTION') return
      const { actionType, hostScore: hs, gameData } = msg.payload
      if (actionType === 'TM_INIT' && typeof hs === 'number' && !isHost) {
        seedRef.current = hs
        setSeed(hs)
        return
      }
      if (actionType === 'TM_PLAY' && gameData) {
        const d = gameData as { cardId: number; actor: 'host' | 'guest' }
        playCard(d.cardId, d.actor, false)
        return
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  })

  const applyMatchReset = useCallback(() => {
    const next = isHost ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = next
    setSeed(next)
    setHostScore(0)
    setGuestScore(0)
    setLeadCard(null)
    setLeadActor('host')
    setNextToPlay('host')
    setLastTrick(null)
    setWinner(null)
    return next
  }, [isHost])
  const onHostPostReset = useCallback((next: number) => {
    setTimeout(() => {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'TM_INIT', hostScore: next },
      })
    }, 60)
  }, [sendMessage, peerId])
  const { handleRestartMatch } = useMatchRestart({
    applyMatchReset, sendMessage, peerId, isHost, onHostPostReset, hostRestartRoute: onLobby,
  })

  /** 현재 국면 판단 · 더미 소진 후엔 무늬 따르기 강제. */
  const strictFollow = stock.length === 0

  const currentActor = nextToPlay
  const isMyTurn = !winner && currentActor === myOwner
  const canAct = isMyTurn && isOpponentOnline

  const myHand = myOwner === 'host' ? hostHand : guestHand
  const oppHandSize = myOwner === 'host' ? guestHand.length : hostHand.length

  function legalCards(actor: 'host' | 'guest'): Card[] {
    const hand = actor === 'host' ? hostHand : guestHand
    if (!leadCard || !strictFollow) return hand
    // 무늬 강제: 있으면 따라야 함. 없으면 트럼프 우선, 그도 없으면 아무거나.
    const trumpSuit = trumpCard?.suit
    const sameSuit = hand.filter((c) => c.suit === leadCard.suit)
    if (sameSuit.length > 0) return sameSuit
    const trumps = hand.filter((c) => c.suit === trumpSuit)
    if (trumps.length > 0) return trumps
    return hand
  }

  const myLegalSet = useMemo(() => new Set(legalCards(myOwner).map((c) => c.id)), [
    myOwner, hostHand, guestHand, leadCard, strictFollow, trumpCard,
  ])

  function playCard(cardId: number, actor: 'host' | 'guest', broadcast: boolean) {
    const hand = actor === 'host' ? hostHand : guestHand
    const card = hand.find((c) => c.id === cardId)
    if (!card) return
    const legal = legalCards(actor)
    if (!legal.some((c) => c.id === cardId)) return
    const newHand = hand.filter((c) => c.id !== cardId)
    if (actor === 'host') setHostHand(newHand)
    else setGuestHand(newHand)

    if (!leadCard) {
      // Lead 카드
      setLeadCard(card)
      setLeadActor(actor)
      setNextToPlay(actor === 'host' ? 'guest' : 'host')
    } else {
      // 후 카드 → 트릭 결정
      const trumpSuit = trumpCard?.suit ?? 'cheese'
      const w = trickWinner(leadCard, card, trumpSuit)
      const trickWinnerActor = w === 'lead' ? leadActor : (leadActor === 'host' ? 'guest' : 'host')
      const gained = points(leadCard.rank) + points(card.rank)
      if (trickWinnerActor === 'host') setHostScore((s) => s + gained)
      else setGuestScore((s) => s + gained)
      setLastTrick({ lead: leadCard, follow: card, winner: trickWinnerActor })

      // 보충 · 승자 먼저 · 더미 top = 배열 끝
      setTimeout(() => {
        setStock((prevStock) => {
          const s = prevStock.slice()
          const draw1 = s.pop()
          const draw2 = s.pop()
          if (draw1) {
            if (trickWinnerActor === 'host') setHostHand((h) => [...h, draw1])
            else setGuestHand((h) => [...h, draw1])
          }
          if (draw2) {
            if (trickWinnerActor === 'host') setGuestHand((h) => [...h, draw2])
            else setHostHand((h) => [...h, draw2])
          }
          return s
        })
        setLeadCard(null)
        setNextToPlay(trickWinnerActor)
      }, 900)

      // 승리 검사
      const nextHost = trickWinnerActor === 'host' ? hostScore + gained : hostScore
      const nextGuest = trickWinnerActor === 'guest' ? guestScore + gained : guestScore
      if (nextHost >= targetScore) { setWinner('host'); return }
      if (nextGuest >= targetScore) { setWinner('guest'); return }
    }
    if (broadcast) {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'TM_PLAY', gameData: { cardId, actor } },
      })
    }
  }

  // 종료 검사 (스톡·손패 소진)
  useEffect(() => {
    if (winner) return
    if (hostHand.length === 0 && guestHand.length === 0 && stock.length === 0 && leadCard === null) {
      if (hostScore > guestScore) setWinner('host')
      else if (hostScore < guestScore) setWinner('guest')
      else setWinner('tie')
    }
  }, [hostHand.length, guestHand.length, stock.length, leadCard, hostScore, guestScore, winner])

  const turnText = winner
    ? winner === myOwner ? '내 매치 승' : winner === 'tie' ? '동률' : '패배'
    : !isOpponentOnline ? '상대 연결 대기'
      : leadCard
        ? isMyTurn ? '내 턴 · 후 카드' : `${opponentName} 후 카드 대기`
        : isMyTurn ? '내 턴 · 리드 카드' : `${opponentName} 리드 카드`

  const outcome: 'win' | 'lose' | 'draw' | undefined = winner
    ? winner === myOwner ? 'win' : winner === 'tie' ? 'draw' : 'lose'
    : undefined

  return (
    <div className="game-screen" data-my-turn={isMyTurn && !winner ? '1' : '0'}>
      <GameHeader
        code="TRUMEON"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={`으뜸 ${trumpCard ? suitLabel(trumpCard.suit) : '—'} · 더미 ${stock.length} · 나 ${myOwner === 'host' ? hostScore : guestScore} / ${targetScore}`}
        variant={winner ? 'idle' : canAct ? 'default' : 'idle'}
        isMyTurn={canAct}
      />

      <div className="tm-arena">
        <div className="tm-scores">
          <span className="tm-score">나 <b>{myOwner === 'host' ? hostScore : guestScore}</b></span>
          <span className="tm-score">상대 <b>{myOwner === 'host' ? guestScore : hostScore}</b></span>
          <span className="tm-target">목표 {targetScore}점</span>
        </div>

        <div className="tm-trump-row">
          {trumpCard && (
            <div className={`tm-trump tm-trump--${trumpCard.suit}`} aria-label={`으뜸 무늬 ${suitLabel(trumpCard.suit)}`}>
              <span className="tm-trump-label">으뜸</span>
              <span className="tm-trump-body">{trumpCard.rank}<br />{suitLabel(trumpCard.suit)}</span>
            </div>
          )}
          <div className="tm-stock" aria-label={`더미 ${stock.length}장 남음`}>
            <span className="tm-stock-label">더미</span>
            <span className="tm-stock-count">{stock.length}</span>
          </div>
        </div>

        <div className="tm-trick" aria-live="polite">
          <div className="tm-trick-slot">
            <span className="tm-trick-label">{leadActor === myOwner ? '내 리드' : '상대 리드'}</span>
            {leadCard ? (
              <div className={`tm-card tm-card--${leadCard.suit}`}>
                <span className="tm-card-rank">{leadCard.rank}</span>
                <span className="tm-card-suit">{suitLabel(leadCard.suit)}</span>
                <span className="tm-card-pt">{points(leadCard.rank)}pt</span>
              </div>
            ) : (
              <div className="tm-card tm-card--empty">—</div>
            )}
          </div>
          <div className="tm-trick-slot">
            <span className="tm-trick-label">{leadActor === myOwner ? '상대 후' : '내 후'}</span>
            <div className="tm-card tm-card--empty">—</div>
          </div>
        </div>

        {lastTrick && !leadCard && (
          <div className="tm-last-trick">
            <b>직전 트릭 · </b>
            {lastTrick.winner === myOwner ? '내가 획득' : '상대 획득'} (+{points(lastTrick.lead.rank) + points(lastTrick.follow.rank)}점)
          </div>
        )}

        <div className="tm-hand" role="group" aria-label="내 손패">
          <span className="tm-hand-label">내 손패 (탭 → 확정)</span>
          <div className="tm-hand-cards">
            {myHand.map((c) => {
              const legal = myLegalSet.has(c.id) && isMyTurn
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`tm-card tm-card--${c.suit} tm-card--play ${legal ? '' : 'is-locked'}`}
                  disabled={!canAct || !legal}
                  onClick={() => playCard(c.id, myOwner, true)}
                  title={legal ? '이 카드 내기' : strictFollow ? '이 국면엔 무늬를 따라야 해요' : ''}
                >
                  <span className="tm-card-rank">{c.rank}</span>
                  <span className="tm-card-suit">{suitLabel(c.suit)}</span>
                  <span className="tm-card-pt">{points(c.rank)}pt</span>
                </button>
              )
            })}
          </div>
          {strictFollow && <div className="tm-follow-notice">더미 소진 · 무늬 따르기 강제. 낼 수 없는 카드는 흐리게 잠겨요.</div>}
        </div>
      </div>

      <GamePlayerHud
        rows={players.map((p) => {
          const owner: 'host' | 'guest' = p.isHost ? 'host' : 'guest'
          const handSize = owner === 'host' ? hostHand.length : guestHand.length
          void oppHandSize
          return {
            player: p,
            active: nextToPlay === owner && !winner,
            online: p.id === peerId ? true : isOpponentOnline,
            extra: <span className="participant-symbol">손 {handSize} · {owner === 'host' ? hostScore : guestScore}점</span>,
          }
        })}
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <TurnTransitionToast isMyTurn={isMyTurn} opponentName={opponentName} suppress={!!winner} />
      <RegistryGuide gameId="trumeon" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {winner && (
        <GameOverModal
          title={outcome === 'win' ? 'YOU WIN' : outcome === 'draw' ? 'DRAW' : 'YOU LOSE'}
          winnerText={outcome === 'win' ? `${targetScore}점 선도달` : outcome === 'draw' ? '점수 동률' : '점수 열세'}
          outcome={outcome}
          scoreSummary={[
            { label: '내 점수', value: myOwner === 'host' ? hostScore : guestScore, highlight: outcome === 'win' },
            { label: '상대 점수', value: myOwner === 'host' ? guestScore : hostScore },
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
