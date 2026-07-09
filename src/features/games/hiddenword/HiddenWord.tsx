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
import { generateBoard } from './words'
import type { HiddenBoard, HiddenKind } from './words'
import './hiddenword.css'

/**
 * 냥말 블러핑 · v2 룰 (코드네임형 협동).
 *
 * 매 라운드 역할 교대. 매치 승리는 목표 점수 달성 · 매치 패배는 함정
 * 지목 시 즉시. 점수는 공유 (양쪽 동일).
 *
 * matchOption  = board side (3 / 4)
 * matchOption2 = 목표 점수 (라운드 수 값 재활용 · 1 / 3 / 5 정답)
 */
export const HIDDENWORD_PRESETS: Record<string, { side: 3 | 4; targetScore: number; label: string }> = {
  '3-1': { side: 3, targetScore: 1, label: '3×3 · 1 정답' },
  '3-3': { side: 3, targetScore: 3, label: '3×3 · 3 정답' },
  '3-5': { side: 3, targetScore: 5, label: '3×3 · 5 정답' },
  '4-1': { side: 4, targetScore: 1, label: '4×4 · 1 정답' },
  '4-3': { side: 4, targetScore: 3, label: '4×4 · 3 정답' },
  '4-5': { side: 4, targetScore: 5, label: '4×4 · 5 정답' },
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
  matchOption?: number;
  matchOption2?: number;
}

type Phase = 'clue' | 'guess' | 'reveal'
type RoundOutcome = 'correct' | 'normal' | 'trap'

interface RoundLogEntry {
  round: number;
  clueGiverName: string;
  guesserName: string;
  clue: string;
  pickedWord: string;
  outcome: RoundOutcome;
}

export function HiddenWord({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
  soloMode = false,
  matchOption = 4,
  matchOption2 = 3,
}: HiddenWordProps) {
  const presetKey = `${matchOption}-${matchOption2}`
  const preset = HIDDENWORD_PRESETS[presetKey] ?? HIDDENWORD_PRESETS['4-3']
  const side = preset.side
  const cellCount = side * side
  const targetScore = preset.targetScore

  const [seed, setSeed] = useState<number>(() =>
    (isHost || soloMode) ? (Math.random() * 2 ** 31) | 0 : 0,
  )
  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])

  const board: HiddenBoard = seed !== 0
    ? generateBoard(seed, side)
    : { words: Array(cellCount).fill(''), kinds: Array(cellCount).fill('normal') as HiddenKind[], correctIdx: 0, trapIndices: [], side }
  const boardReady = seed !== 0

  // 출제자 · 홀수 라운드 = host, 짝수 = guest (교대).
  const [currentRound, setCurrentRound] = useState(1)
  const clueGiverIsHost = currentRound % 2 === 1
  const iAmClueGiver = clueGiverIsHost === isHost

  const [phase, setPhase] = useState<Phase>('clue')
  const [clueText, setClueText] = useState('')
  const [committedClue, setCommittedClue] = useState('')
  const [pickedIdx, setPickedIdx] = useState<number | null>(null)
  const [lastOutcome, setLastOutcome] = useState<RoundOutcome | null>(null)

  const [sharedScore, setSharedScore] = useState(0)
  const [roundLog, setRoundLog] = useState<RoundLogEntry[]>([])

  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [gameOverKind, setGameOverKind] = useState<'win' | 'trap' | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  const { myName, opponentName } = useRoleParticipants(players, isHost)

  const isMyTurn = boardReady && !gameWinner && (
    (phase === 'clue' && iAmClueGiver) ||
    (phase === 'guess' && !iAmClueGiver)
  )
  const canAct = isMyTurn && isOpponentOnline
  void soloMode

  // ---- 매치 리셋 & 다음 라운드 ----------------------------------------
  const applyMatchReset = useCallback(() => {
    const nextSeed = (isHost || soloMode) ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = nextSeed
    setSeed(nextSeed)
    setCurrentRound(1)
    setPhase('clue')
    setClueText('')
    setCommittedClue('')
    setPickedIdx(null)
    setLastOutcome(null)
    setSharedScore(0)
    setRoundLog([])
    setGameWinner(null)
    setGameOverKind(null)
    return nextSeed
  }, [isHost, soloMode])

  const onHostPostReset = useCallback((nextSeed: number) => {
    setTimeout(() => {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'HW_SEED', hostScore: nextSeed },
      })
    }, 60)
  }, [sendMessage, peerId])
  const { handleRestartMatch } = useMatchRestart({ applyMatchReset, sendMessage, peerId, isHost, onHostPostReset })

  const startNextRound = useCallback((nextSeed: number) => {
    seedRef.current = nextSeed
    setSeed(nextSeed)
    setPhase('clue')
    setClueText('')
    setCommittedClue('')
    setPickedIdx(null)
    setLastOutcome(null)
    setCurrentRound((r) => r + 1)
  }, [])

  // ---- Guest handshake -----------------------------------------------
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

  // ---- 라운드 결과 처리 -----------------------------------------------
  const resolveRound = useCallback((idx: number, outcome: RoundOutcome, clueUsed: string) => {
    const pickedWord = board.words[idx] ?? ''
    const clueGiverName = clueGiverIsHost === isHost ? myName : opponentName
    const guesserName = clueGiverIsHost === isHost ? opponentName : myName
    setRoundLog((prev) => [...prev, {
      round: currentRound,
      clueGiverName,
      guesserName,
      clue: clueUsed,
      pickedWord,
      outcome,
    }])
    setPickedIdx(idx)
    setLastOutcome(outcome)
    setPhase('reveal')

    if (outcome === 'trap') {
      setGameOverKind('trap')
      setGameWinner('매치 실패')
      return
    }
    const nextScore = sharedScore + (outcome === 'correct' ? 1 : 0)
    setSharedScore(nextScore)
    if (nextScore >= targetScore) {
      setGameOverKind('win')
      setGameWinner('협동 성공')
      return
    }
    // 다음 라운드로. host 가 새 seed 발행.
    if (isHost) {
      window.setTimeout(() => {
        const nextSeed = (Math.random() * 2 ** 31) | 0
        sendMessage({
          type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
          payload: { actionType: 'HW_NEXT_ROUND', hostScore: nextSeed },
        })
        startNextRound(nextSeed)
      }, 1600)
    }
  }, [board.words, clueGiverIsHost, isHost, myName, opponentName, currentRound, sharedScore, targetScore, peerId, sendMessage, startNextRound])

  // ---- Inbound 라우터 -------------------------------------------------
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
          // 출제자가 단서 제출 → guess phase 로 진입.
          setCommittedClue(winner)
          setPhase('guess')
          return
        }
        if (actionType === 'HW_PICK' && typeof cellIdx === 'number') {
          // 맞추는 사람이 카드 지목. 카드 종류는 seed 로부터 결정론적
          // 이라 양쪽 다 같은 결과 계산.
          const kind = board.kinds[cellIdx] ?? 'normal'
          resolveRound(cellIdx, kind, committedClue)
          return
        }
        if (actionType === 'HW_NEXT_ROUND' && typeof hostScore === 'number') {
          startNextRound(hostScore)
          return
        }
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [isHost, board.kinds, peerId, sendMessage, committedClue, resolveRound, startNextRound])

  // ---- 액션 ---------------------------------------------------------
  const submitClue = () => {
    if (!canAct || phase !== 'clue' || !iAmClueGiver) return
    const text = clueText.trim()
    if (!text) return
    setCommittedClue(text)
    setPhase('guess')
    setClueText('')
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'HW_CLUE', winner: text },
    })
  }

  const pickCard = (idx: number) => {
    if (!canAct || phase !== 'guess' || iAmClueGiver) return
    const kind = board.kinds[idx] ?? 'normal'
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'HW_PICK', cellIdx: idx },
    })
    resolveRound(idx, kind, committedClue)
  }

  // ---- 렌더 헬퍼 ----------------------------------------------------
  const turnText = gameWinner
    ? '매치 종료'
    : !isOpponentOnline
      ? '상대 연결 대기'
      : phase === 'clue'
        ? iAmClueGiver ? '내 턴 · 단서 작성' : `${opponentName} 단서 작성 중`
        : phase === 'guess'
          ? iAmClueGiver ? `${opponentName} 지목 중` : '내 턴 · 카드 지목'
          : phase === 'reveal'
            ? '결과 공개'
            : ''

  const revealAllKinds = phase === 'reveal' || !!gameWinner

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
        turnText={turnText}
        connectionLabel={
          `공유 점수 ${sharedScore}/${targetScore} · R${currentRound} · ${iAmClueGiver ? '출제자' : '맞추는 사람'}`
        }
        variant={gameWinner ? 'idle' : canAct ? 'default' : 'idle'}
        isMyTurn={canAct}
      />

      {/* 페이즈 안내 배너 */}
      {boardReady && !gameWinner && (
        <div className={`hw-guide ${iAmClueGiver ? 'hw-guide--host' : ''}`}>
          {phase === 'clue' && iAmClueGiver && (
            <>
              <div className="hw-guide-title">당신은 출제자입니다</div>
              <div className="hw-guide-body">
                <b>정답 카드</b>(라임)를 맞추게 유도할 한 줄 단서를 제출하세요. <b>함정 카드</b>(빨강)를 짚으면 즉시 매치 패배.
              </div>
            </>
          )}
          {phase === 'clue' && !iAmClueGiver && (
            <>
              <div className="hw-guide-title">당신은 맞추는 사람입니다</div>
              <div className="hw-guide-body">
                출제자가 단서를 작성 중입니다. 카드 위치를 미리 살펴보세요.
              </div>
            </>
          )}
          {phase === 'guess' && !iAmClueGiver && (
            <>
              <div className="hw-guide-title">당신은 맞추는 사람입니다</div>
              <div className="hw-guide-body">
                단서 <b>"{committedClue}"</b> · 이 단어를 표현할 만한 카드를 골라 지목하세요.
              </div>
            </>
          )}
          {phase === 'guess' && iAmClueGiver && (
            <>
              <div className="hw-guide-title">당신은 출제자입니다</div>
              <div className="hw-guide-body">
                {opponentName} 이(가) 카드를 고르고 있습니다.
              </div>
            </>
          )}
          {phase === 'reveal' && lastOutcome && (
            <div className="hw-guide-body">
              {lastOutcome === 'correct' && <>정답 카드! <b>+1점</b> · 곧 다음 라운드로.</>}
              {lastOutcome === 'normal' && <>일반 카드였어요. 점수 변동 없이 다음 라운드로.</>}
              {lastOutcome === 'trap' && <b>함정 카드! 매치 즉시 종료 · 둘 다 패배.</b>}
            </div>
          )}
        </div>
      )}

      {boardReady ? (
        <div
          className={`hw-board hw-board--side-${side}`}
          style={{ gridTemplateColumns: `repeat(${side}, 1fr)` }}
        >
          {board.words.map((w, i) => {
            const kind = board.kinds[i]
            const showKind = iAmClueGiver || revealAllKinds
            const isPicked = pickedIdx === i
            return (
              <button
                key={i}
                type="button"
                className={[
                  'hw-tile',
                  showKind ? `hw-tile--${kind}` : '',
                  isPicked ? 'is-picked' : '',
                  phase === 'guess' && !iAmClueGiver ? 'is-picking' : '',
                ].filter(Boolean).join(' ')}
                disabled={phase !== 'guess' || iAmClueGiver || !canAct || !!gameWinner}
                onClick={() => pickCard(i)}
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
        aria-label="라운드 기록 열기"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M16 4v3h3" />
          <path d="M8 11h8M8 14h8M8 17h5" />
        </svg>
        라운드 기록 · {roundLog.length}
      </button>

      {!gameWinner && phase === 'clue' && iAmClueGiver && (
        <div className="hw-actions">
          <input
            type="text"
            className="hw-clue-input"
            value={clueText}
            onChange={(e) => setClueText(e.target.value.slice(0, 40))}
            placeholder="정답 카드를 겨냥한 한 줄 단서"
            maxLength={40}
            disabled={!canAct}
          />
          <button
            type="button"
            className="pixel-btn pixel-btn--primary hw-btn"
            disabled={!canAct || !clueText.trim()}
            onClick={submitClue}
          >단서 제출</button>
        </div>
      )}

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: iAmClueGiver ? p.isHost === isHost : p.isHost !== isHost,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{p.isHost === clueGiverIsHost ? '출제' : '지목'}</span>,
        }))}
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <TurnTransitionToast isMyTurn={isMyTurn} opponentName={opponentName} suppress={!!gameWinner} />
      <RegistryGuide gameId="hiddenword" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {logOpen && (
        <div className="hw-log-overlay" onClick={() => setLogOpen(false)} role="dialog" aria-modal="true">
          <div className="hw-log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hw-log-modal-head">
              <span className="hw-log-modal-title">라운드 기록 · {roundLog.length}</span>
              <button type="button" className="hw-log-modal-close" onClick={() => setLogOpen(false)} aria-label="닫기">✕</button>
            </div>
            <div className="hw-log-modal-body">
              {roundLog.length === 0 && <div className="hw-log-empty">아직 라운드 기록이 없어요.</div>}
              {roundLog.map((r, i) => (
                <div key={i} className={`hw-log-row hw-log-row--${r.outcome}`}>
                  <span className="hw-log-who">R{r.round} · {r.clueGiverName} → {r.guesserName}</span>
                  <span className="hw-log-text">"{r.clue}" → <b>{r.pickedWord}</b> ({r.outcome === 'correct' ? '정답' : r.outcome === 'trap' ? '함정' : '일반'})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {gameWinner && (
        <GameOverModal
          title={gameOverKind === 'win' ? 'YOU WIN' : 'YOU LOSE'}
          winnerText={gameOverKind === 'win' ? '협동 성공' : '함정 카드'}
          outcome={gameOverKind === 'win' ? 'win' : 'lose'}
          scoreSummary={[
            { label: '공유 점수', value: `${sharedScore} / ${targetScore}`, highlight: gameOverKind === 'win' },
            { label: '라운드', value: `${currentRound}`, highlight: false },
          ]}
          note={
            gameOverKind === 'win'
              ? '함정을 피하고 목표 점수를 달성했어요.'
              : `${roundLog[roundLog.length - 1]?.guesserName ?? '누군가'} 이(가) 함정 카드를 짚었어요.`
          }
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
