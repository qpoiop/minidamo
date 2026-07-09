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
import { deal, sortTiles } from './deck'
import type { Tile } from './deck'
import './vinci.css'

/**
 * 모빈치코드 · 2인 숫자 추리.
 *
 * State: seed 결정론 → 양쪽이 같은 hostHand/guestHand/stock 를 재현.
 * "숨김" 은 UI 필터일 뿐 · 실제 값은 양쪽이 알고 있음 (P2P 구조상 한계).
 *
 * P2P protocol:
 *   VC_HELLO  · guest → host 신호 (재접속 시 seed 요청)
 *   VC_INIT   · hostScore = seed
 *   VC_DRAW   · actor 가 스톡 top 1장 뽑음 · gameData = { actor }
 *   VC_GUESS  · gameData = { actor, targetId, guessed: number | 'joker' }
 *   VC_STOP   · gameData = { actor }  · 정답 후 멈춤 (held 를 자기 hand 로 비공개 삽입)
 *
 * 결정론: 스톡 top 은 항상 배열 마지막 요소 · 순서 고정. drawnCount 로 추적.
 */

interface VinciProps {
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

type Phase = 'draw' | 'guess' | 'continue' | 'over'

interface Reveal { tileId: number; ownerHost: boolean }

export function Vinci({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true, soloMode = false,
}: VinciProps) {
  void soloMode

  const [seed, setSeed] = useState<number>(() => (isHost ? (Math.random() * 2 ** 31) | 0 : 0))
  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])

  const initial = useMemo(() => seed !== 0 ? deal(seed) : null, [seed])

  const [drawnCount, setDrawnCount] = useState(0)
  const [hostExtra, setHostExtra] = useState<Tile[]>([])
  const [guestExtra, setGuestExtra] = useState<Tile[]>([])
  const [heldTileId, setHeldTileId] = useState<number | null>(null)
  const [heldOwnerHost, setHeldOwnerHost] = useState<boolean>(true)
  const [revealed, setRevealed] = useState<Reveal[]>([])
  const [turn, setTurn] = useState<'host' | 'guest'>('host')
  const [phase, setPhase] = useState<Phase>('draw')
  const [pickedTargetId, setPickedTargetId] = useState<number | null>(null)
  const [guessDraft, setGuessDraft] = useState<number | 'joker' | null>(null)
  const [winner, setWinner] = useState<'host' | 'guest' | null>(null)
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  const { myName, opponentName } = useRoleParticipants(players, isHost)
  const myOwner: 'host' | 'guest' = isHost ? 'host' : 'guest'
  const isMyTurn = turn === myOwner && !winner
  const canAct = isMyTurn && isOpponentOnline

  const hostHand = useMemo(() => initial ? [...initial.hostHand, ...hostExtra] : [], [initial, hostExtra])
  const guestHand = useMemo(() => initial ? [...initial.guestHand, ...guestExtra] : [], [initial, guestExtra])
  const stock = useMemo(() => initial ? initial.stock.slice(0, initial.stock.length - drawnCount) : [], [initial, drawnCount])
  const stockTop = useMemo(() => stock.length > 0 ? stock[stock.length - 1] : null, [stock])

  const myHand = myOwner === 'host' ? hostHand : guestHand
  const oppHand = myOwner === 'host' ? guestHand : hostHand
  const myHandSorted = useMemo(() => sortTiles(myHand), [myHand])
  const oppHandSorted = useMemo(() => sortTiles(oppHand), [oppHand])

  const revealedIds = useMemo(() => new Set(revealed.map((r) => r.tileId)), [revealed])
  const heldTile = useMemo(() => {
    if (heldTileId === null) return null
    return [...hostHand, ...guestHand, ...(initial?.stock ?? [])].find((t) => t.id === heldTileId) ?? null
  }, [heldTileId, hostHand, guestHand, initial])

  const applyMatchReset = useCallback(() => {
    const next = isHost ? ((Math.random() * 2 ** 31) | 0) : 0
    setSeed(next)
    setDrawnCount(0)
    setHostExtra([])
    setGuestExtra([])
    setHeldTileId(null)
    setHeldOwnerHost(true)
    setRevealed([])
    setTurn('host')
    setPhase('draw')
    setPickedTargetId(null)
    setGuessDraft(null)
    setWinner(null)
    setLastEvent(null)
    return next
  }, [isHost])
  const onHostPostReset = useCallback((next: number) => {
    setTimeout(() => {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'VC_INIT', hostScore: next },
      })
    }, 60)
  }, [sendMessage, peerId])
  const { handleRestartMatch } = useMatchRestart({
    applyMatchReset, sendMessage, peerId, isHost, onHostPostReset, hostRestartRoute: onLobby,
  })

  // Guest → host hello · seed 요청.
  useEffect(() => {
    if (isHost) return
    if (!isOpponentOnline) return
    const send = () => sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'VC_HELLO' },
    })
    send()
    const t = setTimeout(() => { if (seedRef.current === 0) send() }, 1500)
    return () => clearTimeout(t)
  }, [isHost, isOpponentOnline, peerId, sendMessage])

  // 상대 → 여기로 이벤트 처리 (deps 로 최신 state 접근).
  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.type !== 'GAME_ACTION') return
      const { actionType, hostScore, gameData } = msg.payload
      if (actionType === 'VC_HELLO' && isHost) {
        sendMessage({
          type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
          payload: { actionType: 'VC_INIT', hostScore: seedRef.current },
        })
        return
      }
      if (actionType === 'VC_INIT' && typeof hostScore === 'number' && !isHost) {
        if (seedRef.current === hostScore) return
        seedRef.current = hostScore
        setSeed(hostScore)
        return
      }
      if (actionType === 'VC_DRAW' && gameData) {
        const d = gameData as { actor: 'host' | 'guest' }
        applyDraw(d.actor)
        return
      }
      if (actionType === 'VC_GUESS' && gameData) {
        const d = gameData as { actor: 'host' | 'guest'; targetId: number; guessed: number | 'joker' }
        applyGuess(d.actor, d.targetId, d.guessed)
        return
      }
      if (actionType === 'VC_STOP' && gameData) {
        const d = gameData as { actor: 'host' | 'guest' }
        applyStop(d.actor)
        return
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  })

  function applyDraw(actor: 'host' | 'guest') {
    if (!initial) return
    if (phase !== 'draw') return
    const remainingCount = initial.stock.length - drawnCount
    if (remainingCount === 0) {
      // 스톡 소진 → 곧바로 지목 단계 (heldTile 없음)
      setHeldTileId(null)
      setHeldOwnerHost(actor === 'host')
      setPhase('guess')
      return
    }
    const top = initial.stock[initial.stock.length - drawnCount - 1]
    setDrawnCount((n) => n + 1)
    setHeldTileId(top.id)
    setHeldOwnerHost(actor === 'host')
    setPhase('guess')
  }

  function applyGuess(actor: 'host' | 'guest', targetId: number, guessed: number | 'joker') {
    const target = [...hostHand, ...guestHand].find((t) => t.id === targetId)
    if (!target) return
    const targetOwnerHost = hostHand.some((t) => t.id === targetId)
    const held = heldTileId !== null
      ? [...hostHand, ...guestHand, ...(initial?.stock ?? [])].find((t) => t.id === heldTileId)
      : null

    const correct = guessed === 'joker'
      ? target.color === 'joker'
      : (target.color !== 'joker' && target.value === guessed)

    if (correct) {
      const nextRevealed = [...revealed, { tileId: targetId, ownerHost: targetOwnerHost }]
      setRevealed(nextRevealed)
      // 상대 hand 전체 공개?
      const oppOwnerHost = !heldOwnerHost === (actor === 'host' ? false : true) ? !heldOwnerHost : !heldOwnerHost
      // Simpler: 상대 = actor 반대
      const oppHost = actor === 'host' ? false : true
      const oppHandNow = oppHost ? hostHand : guestHand
      const revealedSet = new Set(nextRevealed.map((r) => r.tileId))
      const allRevealed = oppHandNow.every((t) => revealedSet.has(t.id))
      void oppOwnerHost
      setLastEvent(`정답 · ${target.color === 'joker' ? '조커' : target.value} 공개`)
      if (allRevealed) {
        setWinner(actor)
        setPhase('over')
      } else {
        setPhase('continue')
      }
    } else {
      // 오답 → held 를 actor hand 에 공개 삽입.
      if (held) {
        if (actor === 'host') setHostExtra((p) => [...p, held])
        else setGuestExtra((p) => [...p, held])
        setRevealed((prev) => [...prev, { tileId: held.id, ownerHost: actor === 'host' }])
        setLastEvent(`오답 · ${target.color === 'joker' ? '조커였음' : target.value + '이 아님'} · 뽑은 타일 공개`)
      } else {
        setLastEvent('오답 · 뽑은 타일 없음')
      }
      // 자기 hand 전체 공개?
      const myHost = actor === 'host'
      const myHandNow = myHost ? [...hostHand, ...(held && myHost ? [held] : [])] : [...guestHand, ...(held && !myHost ? [held] : [])]
      const revealedSet = new Set([...revealed.map((r) => r.tileId), ...(held ? [held.id] : [])])
      const allMyRevealed = myHandNow.every((t) => revealedSet.has(t.id))
      setHeldTileId(null)
      setPickedTargetId(null)
      setGuessDraft(null)
      if (allMyRevealed) {
        setWinner(actor === 'host' ? 'guest' : 'host')
        setPhase('over')
      } else {
        setPhase('draw')
        setTurn(actor === 'host' ? 'guest' : 'host')
      }
    }
  }

  function applyStop(actor: 'host' | 'guest') {
    const held = heldTileId !== null
      ? [...hostHand, ...guestHand, ...(initial?.stock ?? [])].find((t) => t.id === heldTileId)
      : null
    if (held) {
      if (actor === 'host') setHostExtra((p) => [...p, held])
      else setGuestExtra((p) => [...p, held])
    }
    setHeldTileId(null)
    setPickedTargetId(null)
    setGuessDraft(null)
    setPhase('draw')
    setTurn(actor === 'host' ? 'guest' : 'host')
    setLastEvent('멈춤 · 뽑은 타일 비공개 보관')
  }

  const doDraw = () => {
    if (!canAct || phase !== 'draw') return
    applyDraw(myOwner)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'VC_DRAW', gameData: { actor: myOwner } },
    })
  }

  const doGuess = () => {
    if (!canAct || phase !== 'guess' || pickedTargetId === null || guessDraft === null) return
    applyGuess(myOwner, pickedTargetId, guessDraft)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'VC_GUESS', gameData: { actor: myOwner, targetId: pickedTargetId, guessed: guessDraft } },
    })
  }

  const doContinue = () => {
    if (!canAct || phase !== 'continue') return
    setPickedTargetId(null)
    setGuessDraft(null)
    setPhase('guess')
    setLastEvent('계속 추리 · 손에 든 타일 여전히 리스크')
  }

  const doStop = () => {
    if (!canAct || phase !== 'continue') return
    applyStop(myOwner)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'VC_STOP', gameData: { actor: myOwner } },
    })
  }

  const renderTileFace = (t: Tile) => (
    <span className="vc-tile-face">
      <span className="vc-tile-color">{t.color === 'black' ? '■' : t.color === 'white' ? '□' : '★'}</span>
      <span className="vc-tile-value">{t.color === 'joker' ? 'J' : t.value}</span>
    </span>
  )

  const outcome: 'win' | 'lose' | undefined = winner ? (winner === myOwner ? 'win' : 'lose') : undefined

  const turnText = winner
    ? outcome === 'win' ? '내 승리 · 상대 타일 전부 공개' : '패배 · 내 타일 전부 공개'
    : !isOpponentOnline ? '상대 연결 대기'
      : isMyTurn ? phase === 'draw' ? '내 턴 · 타일 뽑기'
        : phase === 'guess' ? '내 턴 · 상대 타일 지목 후 숫자 선언'
        : phase === 'continue' ? '정답! 계속 or 멈춤 선택'
        : '진행 중'
      : phase === 'guess' ? `${opponentName} 지목 중`
      : `${opponentName} 고민 중`

  const heldByMe = heldTileId !== null && heldOwnerHost === (myOwner === 'host')

  return (
    <div className="game-screen" data-my-turn={isMyTurn && !winner ? '1' : '0'}>
      <GameHeader
        code="VINCI"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={`더미 ${stock.length + (heldTileId !== null ? 1 : 0)} · 내 손패 ${myHand.length} · 상대 ${oppHand.length}`}
        variant={winner ? 'idle' : canAct ? 'default' : 'idle'}
        isMyTurn={canAct}
      />

      <div className="vc-row vc-row--opponent">
        <span className="vc-row-label">{opponentName} 의 타일</span>
        <div className="vc-hand">
          {oppHandSorted.map((t) => {
            const isRevealed = revealedIds.has(t.id)
            const isPicked = pickedTargetId === t.id
            return (
              <button
                key={t.id}
                type="button"
                className={`vc-tile vc-tile--${t.color} ${isRevealed ? 'is-revealed' : ''} ${isPicked ? 'is-picked' : ''}`}
                disabled={!canAct || phase !== 'guess' || isRevealed}
                onClick={() => { setPickedTargetId(t.id); setGuessDraft(null) }}
              >
                {isRevealed ? renderTileFace(t) : <span className="vc-tile-back">?</span>}
              </button>
            )
          })}
        </div>
      </div>

      {heldTileId !== null && (
        heldByMe && heldTile ? (
          <div className="vc-held" aria-live="polite">
            <span className="vc-held-label">방금 뽑음 · 나만 봄</span>
            <span className={`vc-tile vc-tile--${heldTile.color} is-held`}>{renderTileFace(heldTile)}</span>
          </div>
        ) : (
          <div className="vc-held" aria-live="polite">
            <span className="vc-held-label">{opponentName} 이 뽑음</span>
            <span className="vc-tile is-held"><span className="vc-tile-back">?</span></span>
          </div>
        )
      )}

      <div className="vc-row vc-row--me">
        <span className="vc-row-label">내 타일 · 오름차순 · 나만 값 보임</span>
        <div className="vc-hand">
          {myHandSorted.map((t) => (
            <span
              key={t.id}
              className={`vc-tile vc-tile--${t.color} is-mine ${revealedIds.has(t.id) ? 'is-revealed' : ''}`}
            >{renderTileFace(t)}</span>
          ))}
        </div>
      </div>

      {!winner && (
        <div className="vc-actions">
          {phase === 'draw' && (
            <button type="button" className="pixel-btn pixel-btn--primary" disabled={!canAct} onClick={doDraw}>
              {stockTop ? `타일 뽑기 · 더미 ${stock.length}` : '지목만 (더미 소진)'}
            </button>
          )}
          {phase === 'guess' && (
            <>
              <div className="vc-guess-pad" role="group" aria-label="숫자 선언">
                {Array.from({ length: 12 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`vc-guess-btn ${guessDraft === i ? 'is-active' : ''}`}
                    disabled={!canAct || pickedTargetId === null}
                    onClick={() => setGuessDraft(i)}
                  >{i}</button>
                ))}
                <button
                  type="button"
                  className={`vc-guess-btn vc-guess-btn--joker ${guessDraft === 'joker' ? 'is-active' : ''}`}
                  disabled={!canAct || pickedTargetId === null}
                  onClick={() => setGuessDraft('joker')}
                >조커</button>
              </div>
              <div className="vc-actions-row">
                <button
                  type="button"
                  className="pixel-btn pixel-btn--primary"
                  disabled={!canAct || pickedTargetId === null || guessDraft === null}
                  onClick={doGuess}
                >선언</button>
                <span className="vc-hint">틀리면 방금 뽑은 타일이 공개돼요.</span>
              </div>
            </>
          )}
          {phase === 'continue' && (
            <div className="vc-actions-row">
              <button type="button" className="pixel-btn pixel-btn--primary" disabled={!canAct} onClick={doContinue}>계속 추리</button>
              <button type="button" className="pixel-btn pixel-btn--secondary" disabled={!canAct} onClick={doStop}>멈춤 · 비공개 보관</button>
            </div>
          )}
        </div>
      )}

      {lastEvent && !winner && (
        <div className="vc-event" role="status">{lastEvent}</div>
      )}

      <GamePlayerHud
        rows={players.map((p) => {
          const ownerHost = p.isHost
          const hand = ownerHost ? hostHand : guestHand
          const hidden = hand.filter((t) => !revealedIds.has(t.id)).length
          return {
            player: p,
            active: turn === (ownerHost ? 'host' : 'guest') && !winner,
            online: p.id === peerId ? true : isOpponentOnline,
            extra: <span className="participant-symbol">비공개 {hidden}</span>,
          }
        })}
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <TurnTransitionToast isMyTurn={isMyTurn} opponentName={opponentName} suppress={!!winner} />
      <RegistryGuide gameId="vinci" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {winner && (
        <GameOverModal
          title={outcome === 'win' ? 'YOU WIN' : 'YOU LOSE'}
          winnerText={outcome === 'win' ? '상대 타일 전부 공개' : '내 타일 전부 공개'}
          outcome={outcome}
          scoreSummary={[
            { label: '내 비공개', value: myHand.filter((t) => !revealedIds.has(t.id)).length, highlight: outcome === 'win' },
            { label: '상대 비공개', value: oppHand.filter((t) => !revealedIds.has(t.id)).length },
          ]}
          note={outcome === 'win' ? `${opponentName} 의 타일을 모두 밝혔어요.` : `${opponentName} 이 내 타일을 모두 밝혔어요.`}
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
