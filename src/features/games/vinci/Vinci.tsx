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

type Phase = 'draw' | 'guess' | 'over'

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
  const [hasCorrectThisTurn, setHasCorrectThisTurn] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  // 조커 소유자가 지정한 삽입 랭크 · 정렬용 (조커는 값이 유동 → 소유자가
  // 원하는 위치에 숨김). 시안·기획서 A. §정렬·삽입·조커 상세.
  const [jokerRanks, setJokerRanks] = useState<Map<number, number>>(new Map())
  // 멈춤 직전 조커 위치 선택 모달.
  const [jokerPickForTileId, setJokerPickForTileId] = useState<number | null>(null)

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
  const myHandSorted = useMemo(() => sortTiles(myHand, jokerRanks), [myHand, jokerRanks])
  const oppHandSorted = useMemo(() => sortTiles(oppHand, jokerRanks), [oppHand, jokerRanks])

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
    setHasCorrectThisTurn(false)
    setJokerRanks(new Map())
    setJokerPickForTileId(null)
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
    applyMatchReset, sendMessage, peerId, isHost, onHostPostReset,
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
        const d = gameData as { actor: 'host' | 'guest'; jokerRank?: number; jokerTileId?: number }
        if (typeof d.jokerRank === 'number' && typeof d.jokerTileId === 'number') {
          setJokerRanks((prev) => {
            const nx = new Map(prev)
            nx.set(d.jokerTileId as number, d.jokerRank as number)
            return nx
          })
        }
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
      setPickedTargetId(null)
      setGuessDraft(null)
      if (allRevealed) {
        setWinner(actor)
        setPhase('over')
      } else {
        setHasCorrectThisTurn(true)
        setPhase('guess')
      }
    } else {
      // 오답 → held 를 actor hand 에 공개 삽입.
      if (held) {
        if (actor === 'host') setHostExtra((p) => [...p, held])
        else setGuestExtra((p) => [...p, held])
        setRevealed((prev) => [...prev, { tileId: held.id, ownerHost: actor === 'host' }])
      } else {
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
        setHasCorrectThisTurn(false)
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
    setHasCorrectThisTurn(false)
    setTurn(actor === 'host' ? 'guest' : 'host')
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

  const doStop = () => {
    if (!canAct || phase !== 'guess' || !hasCorrectThisTurn) return
    // 조커면 위치 선택 다이얼로그를 먼저 띄움. 확정 시 confirmStop 호출.
    if (heldTile && heldTile.color === 'joker' && heldTileId !== null) {
      setJokerPickForTileId(heldTileId)
      return
    }
    applyStop(myOwner)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'VC_STOP', gameData: { actor: myOwner } },
    })
  }

  const confirmJokerStop = (rank: number) => {
    if (jokerPickForTileId === null) return
    const jokerTileId = jokerPickForTileId
    setJokerRanks((prev) => {
      const nx = new Map(prev)
      nx.set(jokerTileId, rank)
      return nx
    })
    setJokerPickForTileId(null)
    applyStop(myOwner)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'VC_STOP', gameData: { actor: myOwner, jokerRank: rank, jokerTileId } },
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
      : isMyTurn
        ? phase === 'draw' ? '내 턴 · 타일 뽑기'
        : phase === 'guess'
          ? hasCorrectThisTurn ? '정답 · 이어서 지목하거나 [멈춤]' : '내 턴 · 상대 타일 지목 후 선언'
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

      {/* 안내 배너 삭제 · 사용자 지적 "배너형 안내가 너무 많아".
       *  이미 GameTurnStrip 이 "내 턴 · 상대 타일 지목 후 선언" 을 표시.
       *  중복 제거로 세로 공간 확보 + 안내 노이즈 감소. */}

      {/* 상대 타일 row · 인라인 드로우 상태 chip */}
      <div className="vc-section vc-section--opp">
        <div className="vc-section-head">
          <span className="vc-section-label">{opponentName} 타일 <span className="vc-section-sub">(뒷면·위치만)</span></span>
          <span className="vc-inline-stock">더미 <b>{stock.length}</b></span>
        </div>
        <div className="vc-tiles-row">
          {oppHandSorted.map((t) => {
            const isRevealed = revealedIds.has(t.id)
            const isPicked = pickedTargetId === t.id
            return (
              <button
                key={t.id}
                type="button"
                className={`vc-tile vc-tile--opp vc-tile--${t.color} ${isRevealed ? 'is-revealed' : ''} ${isPicked ? 'is-picked' : ''}`}
                disabled={!canAct || phase !== 'guess' || isRevealed}
                onClick={() => { setPickedTargetId(t.id); setGuessDraft(null) }}
                aria-label={`상대 타일 ${isRevealed ? (t.color === 'joker' ? '조커' : t.value) : '뒷면'}`}
              >
                {isRevealed ? renderTileFace(t) : <span className="vc-tile-back">?</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* 방금 뽑음 · 내가 뽑았을 때만 인라인 표시 (한 줄) */}
      {heldTileId !== null && (
        <div className="vc-drawn-inline">
          {heldByMe && heldTile ? (
            <>
              <span className="vc-drawn-label">방금 뽑음</span>
              <div className={`vc-tile vc-tile--drawn vc-tile--${heldTile.color}`}>{renderTileFace(heldTile)}</div>
              <span className="vc-drawn-sub">나만 봄</span>
            </>
          ) : (
            <>
              <span className="vc-drawn-label">{opponentName} 뽑음</span>
              <div className="vc-tile vc-tile--drawn vc-tile--hidden"><span className="vc-tile-back">?</span></div>
              <span className="vc-drawn-sub">뒷면</span>
            </>
          )}
        </div>
      )}

      {/* 내 타일 row · 값 공개 */}
      <div className="vc-section vc-section--me">
        <span className="vc-section-label">내 타일 <span className="vc-section-sub">(값 보임 · 오름차순)</span></span>
        <div className="vc-tiles-row">
          {myHandSorted.map((t) => (
            <span
              key={t.id}
              className={`vc-tile vc-tile--mine vc-tile--${t.color} ${revealedIds.has(t.id) ? 'is-revealed' : ''}`}
            >{renderTileFace(t)}</span>
          ))}
        </div>
      </div>

      {/* 액션 패널 · 시안 §8a-③ */}
      {!winner && (
        <div className="vc-action-panel">
          {phase === 'draw' && (
            <button type="button" className="vc-btn vc-btn--primary vc-draw-btn" disabled={!canAct} onClick={doDraw}>
              {stockTop ? `타일 뽑기 · 더미 ${stock.length}장` : '지목만 진행 (더미 소진)'}
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
              {heldByMe && heldTile && (
                <div className="vc-risk-notice">틀리면 방금 뽑은 <b>{heldTile.color === 'joker' ? '조커' : heldTile.value}</b> 이(가) 공개돼요.</div>
              )}
              <div className="vc-action-row">
                <button
                  type="button"
                  className="vc-btn vc-btn--primary vc-declare-btn"
                  disabled={!canAct || pickedTargetId === null || guessDraft === null}
                  onClick={doGuess}
                >선언</button>
                {hasCorrectThisTurn && (
                  <button
                    type="button"
                    className="vc-btn vc-btn--outline vc-stop-btn"
                    disabled={!canAct}
                    onClick={doStop}
                  >멈춤 · 비공개 보관</button>
                )}
              </div>
            </>
          )}
        </div>
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

      {/* 조커 위치 선택 다이얼로그 · 사용자 요청: "조커는 위치 내가 정할수있게해줘야지".
       *  현재 내 hand 의 값 배열에서 원하는 rank 를 골라 삽입 (jokerRanks Map). */}
      {jokerPickForTileId !== null && (
        <div className="vc-joker-overlay" role="dialog" aria-modal="true" onClick={() => setJokerPickForTileId(null)}>
          <div className="vc-joker-card" onClick={(e) => e.stopPropagation()}>
            <div className="vc-joker-title">조커 위치 선택</div>
            <div className="vc-joker-hint">삽입할 rank 를 고르세요. 상대에게는 이 위치만 노출됩니다.</div>
            <div className="vc-joker-slots">
              {Array.from({ length: 13 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className="vc-joker-slot"
                  onClick={() => confirmJokerStop(i - 0.5)}
                >
                  ≤ {i}
                </button>
              ))}
              <button
                type="button"
                className="vc-joker-slot vc-joker-slot--end"
                onClick={() => confirmJokerStop(999)}
              >
                맨 뒤
              </button>
            </div>
            <button type="button" className="vc-joker-cancel" onClick={() => setJokerPickForTileId(null)}>취소</button>
          </div>
        </div>
      )}

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
