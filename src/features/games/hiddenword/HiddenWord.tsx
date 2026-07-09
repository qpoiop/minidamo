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
import { generateBoard, WORD_GROUPS } from './words'
import type { HiddenBoard } from './words'
import './hiddenword.css'

/** clueSoftCap = 라운드가 무한 반복되지 않도록, 각 편이 낼 수 있는
 * 단서 수 상한. 넘어가면 반드시 declare(정체 지목) 로 승부를 봐야
 * 하고, 안 하면 자동으로 지목한 것으로 간주. Side 4 라운드는 6개,
 * 5 라운드는 8개까지. */
export const HIDDENWORD_PRESETS: Record<number, { side: 4 | 5; rounds: 1 | 3 | 5; label: string; clueSoftCap: number }> = {
  4:  { side: 4, rounds: 1, label: '4×4 · 단판',            clueSoftCap: 6 },
  5:  { side: 5, rounds: 1, label: '5×5 · 단판',            clueSoftCap: 8 },
  43: { side: 4, rounds: 3, label: '4×4 · 3라운드 (2선승)',  clueSoftCap: 6 },
  53: { side: 5, rounds: 3, label: '5×5 · 3라운드 (2선승)',  clueSoftCap: 8 },
  45: { side: 4, rounds: 5, label: '4×4 · 5라운드 (3선승)',  clueSoftCap: 6 },
  55: { side: 5, rounds: 5, label: '5×5 · 5라운드 (3선승)',  clueSoftCap: 8 },
}

interface HiddenWordProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  soloMode?: boolean;
  /** matchOption 4 or 5 → board side. */
  matchOption?: number;
}

interface ClueEntry {
  byIsHost: boolean;
  /** Author's actual nickname captured at submit time. Prevents the
   * log row from renaming itself when solo/test mode toggles roles
   * (and therefore swaps `myName` / `opponentName` from the viewer's
   * perspective). Real multiplayer never swaps names so this doubles
   * as a stable historical record. */
  authorName: string;
  text: string;
  ts: number;
}

type EndReason =
  | 'declare-correct'
  | 'declare-wrong'
  | 'opp-declare-correct'
  | 'opp-declare-wrong'
  | null

export function HiddenWord({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
  soloMode = false,
  matchOption = 4,
}: HiddenWordProps) {
  // matchOption encodes both board size and match length:
  //   4  → 4×4 · 단판
  //   5  → 5×5 · 단판
  //   43 → 4×4 · 3라운드 (2선승)
  //   53 → 5×5 · 3라운드 (2선승)
  //   45 → 4×4 · 5라운드 (3선승)
  //   55 → 5×5 · 5라운드 (3선승)
  const preset = HIDDENWORD_PRESETS[matchOption] ?? HIDDENWORD_PRESETS[4]
  const side = preset.side
  const cellCount = side * side
  const winsNeeded = Math.ceil(preset.rounds / 2)

  const [seed, setSeed] = useState<number>(() =>
    (isHost || soloMode) ? (Math.random() * 2 ** 31) | 0 : 0,
  )
  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])
  const seedBroadcastRef = useRef(false)

  const board: HiddenBoard = seed !== 0
    ? generateBoard(seed, side)
    : { words: Array(cellCount).fill(''), hostGroupId: '', guestGroupId: '', themeIndexes: [], hostIdx: 0, guestIdx: 0, side }
  const boardReady = seed !== 0

  const [turnIsHost, setTurnIsHost] = useState(true)
  const [currentRound, setCurrentRound] = useState(1)
  const [roundScores, setRoundScores] = useState<{ host: number; guest: number }>({ host: 0, guest: 0 })
  const [clues, setClues] = useState<ClueEntry[]>([])
  const [clueInput, setClueInput] = useState('')
  const [declareIdx, setDeclareIdx] = useState<number | null>(null)
  const [mode, setMode] = useState<'clue' | 'declare'>('clue')
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [endReason, setEndReason] = useState<EndReason>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  const { myName, opponentName } = useRoleParticipants(players, isHost)

  // Per-role slots so solo/test-mode role toggle doesn't leak clue log
  // authorship or declare progress.
  const roleKey = isHost ? 'host' : 'guest'
  const [clueInputPerRole, setClueInputPerRole] = useState<Record<'host' | 'guest', string>>({ host: '', guest: '' })
  void clueInput
  void setClueInput
  const roleClueInput = clueInputPerRole[roleKey]
  const setRoleClueInput = (v: string) => setClueInputPerRole((p) => ({ ...p, [roleKey]: v }))

  const isMyTurn = turnIsHost === isHost && isOpponentOnline && !gameWinner
  const canAct = isMyTurn

  // Clue soft-cap tracking (per side). When my side has already
  // submitted `preset.clueSoftCap` clues this round, the clue input is
  // locked and only the 지목 button remains — forces resolution
  // instead of infinite clue spam.
  const myCluesThisRound = clues.filter((c) => c.byIsHost === isHost).length
  const clueSoftCap = preset.clueSoftCap
  const mustDeclare = canAct && myCluesThisRound >= clueSoftCap && mode === 'clue'
  void soloMode

  const myIdx = isHost ? board.hostIdx : board.guestIdx
  const oppIdx = isHost ? board.guestIdx : board.hostIdx

  const applyMatchReset = useCallback(() => {
    const nextSeed = (isHost || soloMode) ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = nextSeed
    setSeed(nextSeed)
    setTurnIsHost(true)
    setClues([])
    setClueInputPerRole({ host: '', guest: '' })
    setDeclareIdx(null)
    setMode('clue')
    setGameWinner(null)
    setEndReason(null)
    setRoundScores({ host: 0, guest: 0 })
    setCurrentRound(1)
    seedBroadcastRef.current = false
    return nextSeed
  }, [isHost, soloMode])

  const handleRestartMatch = useCallback(() => {
    const nextSeed = applyMatchReset()
    sendMessage({
      type: 'GAME_RESET', senderId: peerId, timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
    if (isHost) {
      setTimeout(() => {
        sendMessage({
          type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
          payload: { actionType: 'HW_SEED', hostScore: nextSeed },
        })
      }, 60)
    }
  }, [applyMatchReset, isHost, peerId, sendMessage])

  // Guest handshake — request seed on mount.
  useEffect(() => {
    if (isHost) return
    if (!isOpponentOnline) return
    const send = () => sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'HW_HELLO' },
    })
    send()
    const t = setTimeout(() => { if (seedRef.current === 0) send() }, 1500)
    return () => clearTimeout(t)
  }, [isHost, isOpponentOnline, peerId, sendMessage])

  // Inbound message router.
  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      if (msg.type === 'GAME_ACTION') {
        const { actionType, hostScore, cellIdx, winner } = msg.payload
        if (actionType === 'HW_HELLO') {
          if (isHost) sendMessage({
            type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
            payload: { actionType: 'HW_SEED', hostScore: seedRef.current },
          })
          return
        }
        if (actionType === 'HW_SEED' && typeof hostScore === 'number') {
          if (seedRef.current === hostScore) return
          seedRef.current = hostScore
          setSeed(hostScore)
          return
        }
        if (actionType === 'HW_CLUE' && typeof winner === 'string') {
          // Sender is the peer (their isHost = !isHost from our frame).
          // Capture their name from the current players list so the log
          // row keeps the stable authorship even when a solo/test-mode
          // toggle later re-labels the players array.
          const peerName = players.find((p) => p.isHost === !isHost)?.name ?? opponentName
          setClues((prev) => [...prev, { byIsHost: !isHost, authorName: peerName, text: winner, ts: Date.now() }])
          setTurnIsHost((v) => !v)
          return
        }
        if (actionType === 'HW_DECLARE' && typeof cellIdx === 'number') {
          // Opponent declared cellIdx as my identity. Correct if
          // cellIdx === myIdx.
          const myIdxNow = isHost ? board.hostIdx : board.guestIdx
          const correct = cellIdx === myIdxNow
          const oppRoundWinner: 'host' | 'guest' = correct
            ? (isHost ? 'guest' : 'host')
            : (isHost ? 'host' : 'guest')
          resolveRound(oppRoundWinner, correct ? 'opp-declare-correct' : 'opp-declare-wrong')
          return
        }
        if (actionType === 'HW_NEXT_ROUND' && typeof hostScore === 'number') {
          // Host initiates the next round with a fresh seed after both
          // peers acknowledge the current round result.
          startNextRound(hostScore)
          return
        }
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [isHost, applyMatchReset, board.hostIdx, board.guestIdx, myName, opponentName, peerId, sendMessage])

  const submitClue = () => {
    if (!canAct) return
    const text = roleClueInput.trim()
    if (!text) return
    setClues((prev) => [...prev, { byIsHost: isHost, authorName: myName, text, ts: Date.now() }])
    setRoleClueInput('')
    setTurnIsHost((v) => !v)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'HW_CLUE', winner: text },
    })
  }

  const openDeclare = () => {
    if (!canAct) return
    setMode('declare')
    setDeclareIdx(null)
  }
  const cancelDeclare = () => {
    setMode('clue')
    setDeclareIdx(null)
  }

  // Resolve a single round's outcome. Increments the round-score,
  // decides whether the whole match is over (winsNeeded reached) or
  // whether we should roll into the next round with a fresh seed.
  // `winnerRole` is the SIDE that won this round.
  const resolveRound = useCallback((winnerRole: 'host' | 'guest', reason: EndReason) => {
    setRoundScores((prev) => {
      const next = {
        host:  prev.host  + (winnerRole === 'host'  ? 1 : 0),
        guest: prev.guest + (winnerRole === 'guest' ? 1 : 0),
      }
      const matchOver = next.host >= winsNeeded || next.guest >= winsNeeded
      if (matchOver) {
        const winnerName = winnerRole === 'host'
          ? (isHost ? myName : opponentName)
          : (isHost ? opponentName : myName)
        setEndReason(reason)
        setGameWinner(winnerName)
      } else {
        // Show the round outcome briefly, then the host will fire
        // HW_NEXT_ROUND with a fresh seed to advance both peers.
        setEndReason(reason)
        if (isHost) {
          window.setTimeout(() => {
            const nextSeed = (Math.random() * 2 ** 31) | 0
            sendMessage({
              type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
              payload: { actionType: 'HW_NEXT_ROUND', hostScore: nextSeed },
            })
            startNextRound(nextSeed)
          }, 1400)
        }
      }
      return next
    })
    setDeclareIdx(null)
    setMode('clue')
  }, [isHost, myName, opponentName, peerId, sendMessage, winsNeeded])

  const startNextRound = useCallback((nextSeed: number) => {
    seedRef.current = nextSeed
    setSeed(nextSeed)
    setTurnIsHost(true)
    setClues([])
    setClueInputPerRole({ host: '', guest: '' })
    setDeclareIdx(null)
    setMode('clue')
    setEndReason(null)
    setCurrentRound((r) => r + 1)
  }, [])

  const commitDeclare = () => {
    if (declareIdx == null) return
    const correct = declareIdx === oppIdx
    const myRole: 'host' | 'guest' = isHost ? 'host' : 'guest'
    const oppRole: 'host' | 'guest' = isHost ? 'guest' : 'host'
    const roundWinner: 'host' | 'guest' = correct ? myRole : oppRole
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'HW_DECLARE', cellIdx: declareIdx },
    })
    resolveRound(roundWinner, correct ? 'declare-correct' : 'declare-wrong')
  }

  // Show only my own theme (host or guest side), not both — surface
  // the pair only in the game-over reveal.
  const myGroupId = isHost ? board.hostGroupId : board.guestGroupId
  const themeName = WORD_GROUPS.find((g) => g.id === myGroupId)?.theme ?? ''

  const turnText = gameWinner
    ? '매치 종료'
    : !isOpponentOnline
      ? '상대 연결 대기'
      : isMyTurn
        ? mode === 'declare' ? '내 지목 · 카드 선택' : '내 턴 · 단서 또는 지목'
        : `${opponentName} 턴 · 대기`

  const iWon = gameWinner === myName
  const eyebrow =
    endReason === 'declare-correct' ? '정체 지목 성공'
    : endReason === 'declare-wrong' ? '정체 지목 실패'
    : endReason === 'opp-declare-correct' ? `${opponentName}의 지목 성공`
    : endReason === 'opp-declare-wrong' ? `${opponentName}의 지목 실패`
    : '매치 종료'
  const note =
    endReason === 'declare-correct' ? `${myName}이(가) ${opponentName}의 정체를 정확히 지목했어요.`
    : endReason === 'declare-wrong' ? `${myName}이(가) 오답을 지목해 즉시 패배.`
    : endReason === 'opp-declare-correct' ? `${opponentName}이(가) 내 정체를 지목했어요.`
    : endReason === 'opp-declare-wrong' ? `${opponentName}이(가) 오답을 지목해 자동 패배 → 나의 승.`
    : ''

  return (
    <div className="game-screen" data-my-turn={isMyTurn && !gameWinner ? '1' : '0'}>
      <GameHeader
        code="HIDDENWORD"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={
          boardReady
            ? `내 단어: ${board.words[myIdx]} · ${turnText}`
            : turnText
        }
        connectionLabel={
          preset.rounds > 1
            ? `R${currentRound}/${preset.rounds} · 내 ${isHost ? roundScores.host : roundScores.guest} : 상대 ${isHost ? roundScores.guest : roundScores.host} · 내 유사군 ${themeName || '…'}`
            : `내 유사군 · ${themeName || '…'} · 단서 ${clues.length}`
        }
        variant={gameWinner ? 'idle' : canAct ? 'default' : 'idle'}
        isMyTurn={canAct}
      />

      {boardReady && clues.length === 0 && !gameWinner && (
        <div className="hw-intro">
          <b>{myName}</b>의 단어는 <b className="hw-intro-word">{board.words[myIdx]}</b>입니다.
          <div className="hw-intro-sub">단어를 노출하는 표현을 피하면서 상대에게 힌트를 흘려요.</div>
        </div>
      )}

      {boardReady ? (
        <div
          className={`hw-board hw-board--side-${side}`}
          style={{ gridTemplateColumns: `repeat(${side}, 1fr)` }}
        >
          {board.words.map((w, i) => {
            const isMe = i === myIdx
            const isTheme = board.themeIndexes.includes(i)
            const isSelected = mode === 'declare' && declareIdx === i
            return (
              <button
                key={i}
                type="button"
                className={[
                  'hw-tile',
                  isTheme ? 'is-theme' : '',
                  isMe ? 'is-me' : '',
                  isSelected ? 'is-selected' : '',
                  mode === 'declare' ? 'is-picking' : '',
                ].filter(Boolean).join(' ')}
                disabled={mode !== 'declare' || !canAct || isMe}
                onClick={() => {
                  if (mode === 'declare' && !isMe) setDeclareIdx(i)
                }}
              >
                {w}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="hw-loading">보드 동기화 중…</div>
      )}

      <button
        type="button"
        className="hw-log-strip"
        onClick={() => setLogOpen(true)}
        aria-label="단서 로그 열기"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M16 4v3h3" />
          <path d="M8 11h8M8 14h8M8 17h5" />
        </svg>
        단서 로그
        <span className="hw-log-strip-badge hw-log-strip-badge--me">
          {clues.filter((c) => c.byIsHost === isHost).length}
        </span>
        <span className="hw-log-strip-badge hw-log-strip-badge--opp">
          {clues.filter((c) => c.byIsHost !== isHost).length}
        </span>
      </button>

      {!gameWinner && mode === 'clue' && (
        <>
          {mustDeclare && (
            <div className="hw-must-declare">
              단서 {clueSoftCap}개를 모두 사용했어요 · 지목으로 승부를 봐야 해요
            </div>
          )}
          <div className="hw-actions">
            <input
              type="text"
              className="hw-clue-input"
              value={roleClueInput}
              onChange={(e) => setRoleClueInput(e.target.value.slice(0, 40))}
              placeholder={
                mustDeclare ? `단서 한도 도달 (${clueSoftCap}/${clueSoftCap})`
                : canAct ? `내 카드에 맞는 단서 (${myCluesThisRound}/${clueSoftCap})`
                : '상대 턴'
              }
              disabled={!canAct || mustDeclare}
              maxLength={40}
            />
            <button
              type="button"
              className="pixel-btn pixel-btn--primary hw-btn"
              disabled={!canAct || !roleClueInput.trim() || mustDeclare}
              onClick={submitClue}
            >단서 제출</button>
            <button
              type="button"
              className={`pixel-btn hw-btn ${mustDeclare ? 'pixel-btn--primary' : 'pixel-btn--danger'}`}
              disabled={!canAct}
              onClick={openDeclare}
            >지목</button>
          </div>
        </>
      )}
      {!gameWinner && mode === 'declare' && (
        <div className="hw-actions">
          <div className="hw-declare-hint">상대의 정체 카드를 골라 확정</div>
          <button
            type="button"
            className="pixel-btn pixel-btn--ghost hw-btn"
            onClick={cancelDeclare}
          >취소</button>
          <button
            type="button"
            className="pixel-btn pixel-btn--danger hw-btn"
            disabled={declareIdx == null}
            onClick={commitDeclare}
          >확정</button>
        </div>
      )}

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.isHost === turnIsHost,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{p.isHost === isHost ? '나' : '상대'}</span>,
        }))}
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <TurnTransitionToast isMyTurn={isMyTurn} opponentName={opponentName} suppress={!!gameWinner} />
      <RegistryGuide gameId="hiddenword" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {logOpen && (
        <div className="hw-log-overlay" onClick={() => setLogOpen(false)} role="dialog" aria-modal="true">
          <div className="hw-log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hw-log-modal-head">
              <span className="hw-log-modal-title">단서 로그 · {clues.length}</span>
              <button type="button" className="hw-log-modal-close" onClick={() => setLogOpen(false)} aria-label="닫기">✕</button>
            </div>
            <div className="hw-log-modal-body">
              {clues.length === 0 && <div className="hw-log-empty">아직 단서가 없어요.</div>}
              {clues.map((c, i) => (
                <div key={i} className={`hw-log-row hw-log-row--${c.byIsHost === isHost ? 'me' : 'opp'}`}>
                  <span className="hw-log-who">{c.authorName}</span>
                  <span className="hw-log-text">"{c.text}"</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {gameWinner && (
        <GameOverModal
          title={iWon ? 'YOU WIN' : 'YOU LOSE'}
          winnerText={eyebrow}
          outcome={iWon ? 'win' : 'lose'}
          scoreSummary={[
            { label: myName, value: `단서 ${clues.filter((c) => c.byIsHost === isHost).length}회`, highlight: iWon },
            { label: opponentName, value: `단서 ${clues.filter((c) => c.byIsHost !== isHost).length}회`, highlight: !iWon },
          ]}
          note={note}
          onRestart={handleRestartMatch}
          onLobby={onLobby}
          onChooseOther={onChooseOther}
          onExit={onExit}
          restartDisabled={!isOpponentOnline}
          restartHint={!isOpponentOnline ? '상대방 재연결 대기 중' : undefined}
        />
      )}
    </div>
  )
}
