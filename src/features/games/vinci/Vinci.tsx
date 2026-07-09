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
 * 모빈치코드 (Da Vinci Code) · 2인 숫자 추리 · 리스크 관리.
 *
 * State 는 완전정보 (호스트 hand · 게스트 hand · 스톡) 를 양쪽이 동일 시드로
 * 재생성해 로컬 보유. 프로토콜상 "혼자만 보는" 것은 UI 필터로 구현
 * (자기 hand 는 앞면·상대 hand 는 뒷면). 치트 방지는 P2P 이기에 완벽하지
 * 않으나 지목·판정을 서로 검증 가능 (양쪽 실제값 알고 있음 = 결정론).
 *
 * P2P protocol:
 *   'VC_INIT'  · hostScore = seed
 *   'VC_DRAW'  · gameData = { drawnTileId }  // 뽑은 사람 = sender
 *   'VC_GUESS' · gameData = { targetTileId, guessedValue, guessedColor? }
 *   'VC_STOP'  · 이후 hand 삽입 확정
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

type Phase = 'draw' | 'guess' | 'continue' | 'reveal' | 'over'

interface RevealedTile {
  tileId: number;
  ownerHost: boolean;
  reason: 'guessed-correct' | 'guessed-wrong-self';
}

export function Vinci({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true, soloMode = false,
}: VinciProps) {
  void soloMode

  const [seed, setSeed] = useState<number>(() => (isHost ? (Math.random() * 2 ** 31) | 0 : 0))
  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])

  const { hostHand, guestHand, stock } = useMemo(() => (
    seed !== 0 ? deal(seed) : { hostHand: [], guestHand: [], stock: [] }
  ), [seed])

  const [drawnStack, setDrawnStack] = useState<number[]>([]) // 스톡에서 드로우된 인덱스 카운터
  const [hostExtra, setHostExtra] = useState<Tile[]>([])
  const [guestExtra, setGuestExtra] = useState<Tile[]>([])
  const [heldTile, setHeldTile] = useState<Tile | null>(null) // 현재 턴의 손에 든 타일 (뽑은 사람 관점)
  const [heldOwnerHost, setHeldOwnerHost] = useState<boolean>(true)
  const [revealed, setRevealed] = useState<RevealedTile[]>([])
  const [turn, setTurn] = useState<'host' | 'guest'>('host')
  const [phase, setPhase] = useState<Phase>('draw')
  const [pickedTargetId, setPickedTargetId] = useState<number | null>(null)
  const [guessDraft, setGuessDraft] = useState<number | 'joker' | null>(null)
  const [winner, setWinner] = useState<'host' | 'guest' | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  void toast; void setToast

  const { myName, opponentName } = useRoleParticipants(players, isHost)
  const myOwner: 'host' | 'guest' = isHost ? 'host' : 'guest'
  const isMyTurn = turn === myOwner && !winner
  const canAct = isMyTurn && isOpponentOnline

  const myHand = myOwner === 'host' ? [...hostHand, ...hostExtra] : [...guestHand, ...guestExtra]
  const oppHand = myOwner === 'host' ? [...guestHand, ...guestExtra] : [...hostHand, ...hostExtra]
  const myHandSorted = sortTiles(myHand)
  const oppHandSorted = sortTiles(oppHand)

  const applyMatchReset = useCallback(() => {
    const next = isHost ? ((Math.random() * 2 ** 31) | 0) : 0
    setSeed(next)
    setDrawnStack([])
    setHostExtra([])
    setGuestExtra([])
    setHeldTile(null)
    setRevealed([])
    setTurn('host')
    setPhase('draw')
    setPickedTargetId(null)
    setGuessDraft(null)
    setWinner(null)
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

  useEffect(() => {
    if (isHost) return
    const t = setTimeout(() => {
      if (seedRef.current === 0) {
        sendMessage({
          type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
          payload: { actionType: 'VC_HELLO' },
        })
      }
    }, 400)
    return () => clearTimeout(t)
  }, [isHost, peerId, sendMessage])

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
      if (actionType === 'VC_INIT' && typeof hostScore === 'number') {
        seedRef.current = hostScore
        setSeed(hostScore)
        return
      }
      if (actionType === 'VC_DRAW' && gameData) {
        const d = gameData as { tileId: number; ownerHost: boolean }
        const tile = [...hostHand, ...guestHand, ...stock].find((t) => t.id === d.tileId)
        if (tile) {
          setHeldTile(tile)
          setHeldOwnerHost(d.ownerHost)
          setDrawnStack((prev) => [...prev, tile.id])
          setPhase('guess')
        }
        return
      }
      if (actionType === 'VC_GUESS' && gameData) {
        const d = gameData as { targetTileId: number; guessedValue: number | 'joker' }
        handleGuess(d.targetTileId, d.guessedValue, false)
        return
      }
      if (actionType === 'VC_STOP') {
        commitHiddenInsert()
        return
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  })

  function findTileValue(id: number): { color: string; value: number } | null {
    const t = [...hostHand, ...guestHand, ...stock, ...hostExtra, ...guestExtra].find((x) => x.id === id)
    if (!t) return null
    return { color: t.color, value: t.value }
  }

  function handleGuess(targetTileId: number, guessedValue: number | 'joker', broadcast: boolean) {
    const target = findTileValue(targetTileId)
    if (!target) return
    const isJokerGuess = guessedValue === 'joker'
    const correct = isJokerGuess ? target.color === 'joker' : (target.value === guessedValue && target.color !== 'joker')
    const held = heldTile
    if (correct) {
      // 상대 타일 공개
      setRevealed((prev) => [...prev, {
        tileId: targetTileId,
        ownerHost: heldOwnerHost ? !heldOwnerHost : true, // target 이 상대 소유 → held owner 반대
        reason: 'guessed-correct',
      }])
      // 승리 조건 · 상대 hand 전체 공개?
      const oppOwnerHost = !heldOwnerHost
      const oppHand2 = oppOwnerHost ? [...hostHand, ...hostExtra] : [...guestHand, ...guestExtra]
      const revealedIds = new Set([...revealed.map((r) => r.tileId), targetTileId])
      const allRevealed = oppHand2.every((t) => revealedIds.has(t.id))
      if (allRevealed) {
        setWinner(heldOwnerHost ? 'host' : 'guest')
        setPhase('over')
      } else {
        setPhase('continue') // 뽑은 사람이 계속/멈춤 선택
      }
    } else {
      // 뽑은 사람 타일 공개 → 자기 hand 에 앞면 삽입.
      if (held) {
        if (heldOwnerHost) setHostExtra((prev) => [...prev, held])
        else setGuestExtra((prev) => [...prev, held])
        setRevealed((prev) => [...prev, {
          tileId: held.id,
          ownerHost: heldOwnerHost,
          reason: 'guessed-wrong-self',
        }])
      }
      setHeldTile(null)
      setPickedTargetId(null)
      setGuessDraft(null)
      setPhase('draw')
      setTurn(heldOwnerHost ? 'guest' : 'host')
    }
    if (broadcast) {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'VC_GUESS', gameData: { targetTileId, guessedValue } },
      })
    }
  }

  function commitHiddenInsert() {
    // 손의 타일을 자기 hand 에 비공개로 삽입 (extra 로만 관리 · revealed 목록엔 없음)
    if (heldTile) {
      if (heldOwnerHost) setHostExtra((prev) => [...prev, heldTile])
      else setGuestExtra((prev) => [...prev, heldTile])
    }
    setHeldTile(null)
    setPickedTargetId(null)
    setGuessDraft(null)
    setPhase('draw')
    setTurn(heldOwnerHost ? 'guest' : 'host')
  }

  function doDraw() {
    if (!canAct || phase !== 'draw') return
    const remaining = stock.filter((t) => !drawnStack.includes(t.id))
    if (remaining.length === 0) {
      // 스톡 소진 → 그냥 추리로 진입 (heldTile null)
      setPhase('guess')
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'VC_DRAW', gameData: { tileId: -1, ownerHost: myOwner === 'host' } },
      })
      return
    }
    const t = remaining[remaining.length - 1] // top
    setHeldTile(t)
    setHeldOwnerHost(myOwner === 'host')
    setDrawnStack((prev) => [...prev, t.id])
    setPhase('guess')
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'VC_DRAW', gameData: { tileId: t.id, ownerHost: myOwner === 'host' } },
    })
  }

  function doGuess() {
    if (!canAct || pickedTargetId === null || guessDraft === null) return
    handleGuess(pickedTargetId, guessDraft, true)
  }

  function doStop() {
    if (!canAct || phase !== 'continue') return
    commitHiddenInsert()
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'VC_STOP' },
    })
  }

  function doContinue() {
    if (!canAct || phase !== 'continue') return
    setPickedTargetId(null)
    setGuessDraft(null)
    setPhase('guess')
  }

  const revealedIds = useMemo(() => new Set(revealed.map((r) => r.tileId)), [revealed])

  const outcome: 'win' | 'lose' | undefined = winner ? (winner === myOwner ? 'win' : 'lose') : undefined

  const turnText = winner
    ? outcome === 'win' ? '내 승리 · 상대 타일 전부 공개' : '패배 · 내 타일 전부 공개'
    : !isOpponentOnline ? '상대 연결 대기'
      : isMyTurn ? phase === 'draw' ? '내 턴 · 타일 뽑기'
        : phase === 'guess' ? '내 턴 · 상대 타일 지목 후 숫자 선언'
        : phase === 'continue' ? '정답! 계속 or 멈춤 선택'
        : '진행 중'
      : `${opponentName} 고민 중`

  const renderTileFace = (t: Tile) => (
    <span className="vc-tile-face">
      <span className="vc-tile-color">{t.color === 'black' ? '■' : t.color === 'white' ? '□' : '★'}</span>
      <span className="vc-tile-value">{t.color === 'joker' ? 'J' : t.value}</span>
    </span>
  )

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
        connectionLabel={`더미 ${stock.length - drawnStack.length + (heldTile ? 1 : 0)} · 내 손패 ${myHand.length} · 상대 ${oppHand.length}`}
        variant={winner ? 'idle' : canAct ? 'default' : 'idle'}
        isMyTurn={canAct}
      />

      {/* 상대 hand · 뒷면 · 공개된 것만 앞면 */}
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
                onClick={() => setPickedTargetId(t.id)}
              >
                {isRevealed ? renderTileFace(t) : <span className="vc-tile-back">?</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* 헬드 타일 (내가 방금 뽑음) */}
      {heldTile && heldOwnerHost === (myOwner === 'host') && (
        <div className="vc-held" aria-live="polite">
          <span className="vc-held-label">방금 뽑음 (나만 봄)</span>
          <span className={`vc-tile vc-tile--${heldTile.color} is-held`}>{renderTileFace(heldTile)}</span>
        </div>
      )}
      {heldTile && heldOwnerHost !== (myOwner === 'host') && (
        <div className="vc-held" aria-live="polite">
          <span className="vc-held-label">{opponentName} 이 뽑음</span>
          <span className="vc-tile is-held"><span className="vc-tile-back">?</span></span>
        </div>
      )}

      {/* 내 hand · 값 공개 */}
      <div className="vc-row vc-row--me">
        <span className="vc-row-label">내 타일 (오름차순 · 나만 봄)</span>
        <div className="vc-hand">
          {myHandSorted.map((t) => (
            <span
              key={t.id}
              className={`vc-tile vc-tile--${t.color} is-mine ${revealedIds.has(t.id) ? 'is-revealed' : ''}`}
            >{renderTileFace(t)}</span>
          ))}
        </div>
      </div>

      {/* 액션 */}
      {!winner && (
        <div className="vc-actions">
          {phase === 'draw' && (
            <button type="button" className="pixel-btn pixel-btn--primary" disabled={!canAct} onClick={doDraw}>
              타일 뽑기
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
              <button type="button" className="pixel-btn pixel-btn--secondary" disabled={!canAct} onClick={doStop}>멈춤 (비공개 보관)</button>
            </div>
          )}
        </div>
      )}

      {toast && <div className="vc-toast" role="status">{toast}</div>}

      <GamePlayerHud
        rows={players.map((p) => {
          const owner: 'host' | 'guest' = p.isHost ? 'host' : 'guest'
          const hand = owner === 'host' ? [...hostHand, ...hostExtra] : [...guestHand, ...guestExtra]
          const hidden = hand.filter((t) => !revealedIds.has(t.id)).length
          return {
            player: p,
            active: turn === owner && !winner,
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
