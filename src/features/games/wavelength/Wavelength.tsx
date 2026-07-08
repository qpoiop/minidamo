import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { RegistryGuide } from '../common/RegistryGuide'
import { useRoleParticipants } from '../common/useRoleParticipants'
import { pickCard, pickTarget, scoreGuess, TOLERANCE_BANDS } from './cards'
import type { SpectrumCard, TolerancePreset } from './cards'
import './wavelength.css'

interface WavelengthProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  soloMode?: boolean;
  /** Match preset — encodes tolerance + target score. */
  matchOption?: number;
}

/** matchOption 1/2/3 → (tolerance, targetScore) preset. */
const WAVE_PRESETS: Record<number, { tolerance: TolerancePreset; targetScore: number; label: string }> = {
  1: { tolerance: 'default', targetScore: 12, label: '보통 · 12점' },
  2: { tolerance: 'strict',  targetScore: 15, label: '빡빡 · 15점' },
  3: { tolerance: 'loose',   targetScore: 20, label: '널널 · 20점' },
}

/** Round phases. host is 촉냥 on odd rounds, guest on even. */
type Phase =
  | 'clue-input'     // 촉냥 (clue giver) enters clue text
  | 'guessing'       // 추측자 drags the dial
  | 'reveal'         // dial locked, target revealed, score shown

export function Wavelength({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
  soloMode = false,
  matchOption = 1,
}: WavelengthProps) {
  const preset = WAVE_PRESETS[matchOption] ?? WAVE_PRESETS[1]
  const bands = TOLERANCE_BANDS[preset.tolerance]

  const [seed, setSeed] = useState<number>(() =>
    (isHost || soloMode) ? (Math.random() * 2 ** 31) | 0 : 0,
  )
  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])
  const seedBroadcastRef = useRef(false)

  const [round, setRound] = useState(1)
  const [phase, setPhase] = useState<Phase>('clue-input')
  const [guess, setGuess] = useState(50)
  const [clue, setClue] = useState('')
  const [scores, setScores] = useState<{ host: number; guest: number }>({ host: 0, guest: 0 })
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [committedClue, setCommittedClue] = useState('')  // what the guesser sees

  const { myName, opponentName } = useRoleParticipants(players, isHost)

  // Whose "촉냥" turn is it? host on odd rounds, guest on even.
  const clueGiverIsHost = round % 2 === 1
  const iAmClueGiver = clueGiverIsHost === isHost

  const card: SpectrumCard = pickCard(seed || 1, round)
  const target: number = pickTarget(seed || 1, round)

  // Reveal only to clue giver.
  const showTargetZone = phase === 'clue-input' && iAmClueGiver
  const showTargetInReveal = phase === 'reveal'

  const isMyTurn =
    phase === 'clue-input' ? iAmClueGiver
    : phase === 'guessing' ? !iAmClueGiver
    : true   // reveal is shared
  const canAct = isMyTurn && isOpponentOnline && !gameWinner
  void soloMode

  const applyMatchReset = useCallback(() => {
    const nextSeed = (isHost || soloMode) ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = nextSeed
    setSeed(nextSeed)
    setRound(1)
    setPhase('clue-input')
    setGuess(50)
    setClue('')
    setCommittedClue('')
    setScores({ host: 0, guest: 0 })
    setGameWinner(null)
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
          payload: { actionType: 'WAVE_SEED', hostScore: nextSeed },
        })
      }, 60)
    }
  }, [applyMatchReset, isHost, peerId, sendMessage])

  // Handshake: guest sends HELLO on mount, host replies with the seed.
  useEffect(() => {
    if (isHost) return
    if (!isOpponentOnline) return
    const send = () => sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'WAVE_HELLO' },
    })
    send()
    const t = setTimeout(() => { if (seedRef.current === 0) send() }, 1500)
    return () => clearTimeout(t)
  }, [isHost, isOpponentOnline, peerId, sendMessage])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      if (msg.type === 'GAME_ACTION') {
        const { actionType, hostScore, guestScore, x } = msg.payload
        if (actionType === 'WAVE_HELLO') {
          if (isHost) sendMessage({
            type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
            payload: { actionType: 'WAVE_SEED', hostScore: seedRef.current },
          })
          return
        }
        if (actionType === 'WAVE_SEED' && typeof hostScore === 'number') {
          if (seedRef.current === hostScore) return
          seedRef.current = hostScore
          setSeed(hostScore)
          return
        }
        if (actionType === 'WAVE_CLUE' && typeof msg.payload?.winner === 'string') {
          setCommittedClue(msg.payload.winner)
          setPhase('guessing')
          return
        }
        if (actionType === 'WAVE_GUESS' && typeof x === 'number') {
          setGuess(x)
          setPhase('reveal')
          return
        }
        if (actionType === 'WAVE_SCORE'
          && typeof hostScore === 'number'
          && typeof guestScore === 'number'
        ) {
          setScores({ host: hostScore, guest: guestScore })
          return
        }
        if (actionType === 'WAVE_NEXT' && typeof msg.payload?.cellIdx === 'number') {
          setRound(msg.payload.cellIdx)
          setPhase('clue-input')
          setGuess(50)
          setClue('')
          setCommittedClue('')
          return
        }
        if (actionType === 'WAVE_WIN' && typeof msg.payload?.winner === 'string') {
          setGameWinner(msg.payload.winner === 'host' ? (isHost ? myName : opponentName) : (isHost ? opponentName : myName))
          return
        }
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [isHost, applyMatchReset, myName, opponentName, peerId, sendMessage])

  const submitClue = () => {
    if (!clue.trim()) return
    setCommittedClue(clue.trim())
    setPhase('guessing')
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'WAVE_CLUE', winner: clue.trim() },
    })
  }

  const commitGuess = () => {
    setPhase('reveal')
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'WAVE_GUESS', x: guess },
    })
    // Score is computed by both sides (deterministic); loser announces
    // to keep the flow synced.
    const pts = scoreGuess(target, guess, bands)
    const nextScores = {
      host: scores.host + (clueGiverIsHost ? pts : pts),
      guest: scores.guest + (clueGiverIsHost ? pts : pts),
    }
    // In wavelength, both roles score the SAME points (co-op) — but
    // our 2-player variant is head-to-head, so the guesser gets the
    // points on their round.
    const guesserIsHost = !clueGiverIsHost
    const guesserPoints = pts
    const finalScores = guesserIsHost
      ? { host: scores.host + guesserPoints, guest: scores.guest }
      : { host: scores.host, guest: scores.guest + guesserPoints }
    setScores(finalScores)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'WAVE_SCORE', hostScore: finalScores.host, guestScore: finalScores.guest },
    })
    void nextScores
  }

  const nextRound = () => {
    // Check win condition first.
    if (scores.host >= preset.targetScore || scores.guest >= preset.targetScore) {
      const winner = scores.host >= preset.targetScore ? 'host' : 'guest'
      const winnerName = winner === 'host' ? (isHost ? myName : opponentName) : (isHost ? opponentName : myName)
      setGameWinner(winnerName)
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'WAVE_WIN', winner },
      })
      return
    }
    const next = round + 1
    setRound(next)
    setPhase('clue-input')
    setGuess(50)
    setClue('')
    setCommittedClue('')
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'WAVE_NEXT', cellIdx: next },
    })
  }

  // Dial drag — handles both touch and mouse.
  const barRef = useRef<HTMLDivElement | null>(null)
  const setGuessFromClientX = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    setGuess(Math.round(pct))
  }
  const draggingRef = useRef(false)
  const onBarPointerDown = (e: React.PointerEvent) => {
    if (phase !== 'guessing' || !canAct) return
    draggingRef.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setGuessFromClientX(e.clientX)
  }
  const onBarPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    setGuessFromClientX(e.clientX)
  }
  const onBarPointerUp = () => { draggingRef.current = false }

  const turnText = gameWinner
    ? '매치 종료'
    : !isOpponentOnline
      ? '상대 연결 대기'
      : phase === 'clue-input'
        ? iAmClueGiver ? '내 턴 · 단서 작성' : `${opponentName} · 단서 작성 중`
        : phase === 'guessing'
          ? iAmClueGiver ? `${opponentName} · 다이얼 조작 중` : '내 턴 · 다이얼 이동'
          : '채점 · 다음 라운드'

  const myScore = isHost ? scores.host : scores.guest
  const oppScore = isHost ? scores.guest : scores.host
  const pts = phase === 'reveal' ? scoreGuess(target, guess, bands) : 0

  return (
    <div className="game-screen">
      <GameHeader
        code="NYANGWAVE"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={`R${round} · 내 ${myScore} / 상대 ${oppScore} · 목표 ${preset.targetScore}`}
        variant={gameWinner ? 'idle' : canAct ? 'default' : 'idle'}
        isMyTurn={!!canAct}
      />

      <div className="wave-card">
        <div className="wave-card-topic">주제 · {card.topic}</div>
        <div className="wave-card-title">
          <span className="wave-card-low">{card.low}</span>
          <span className="wave-card-sep">↔</span>
          <span className="wave-card-high">{card.high}</span>
        </div>
      </div>

      <div className="wave-bar-wrap">
        <div
          ref={barRef}
          className="wave-bar"
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
        >
          {/* Target zone (visible only to clue giver, or all in reveal) */}
          {(showTargetZone || showTargetInReveal) && (
            <>
              <div
                className="wave-zone wave-zone--b2"
                style={{ left: `${target - bands.b2}%`, width: `${bands.b2 * 2}%` }}
              />
              <div
                className="wave-zone wave-zone--b3"
                style={{ left: `${target - bands.b3}%`, width: `${bands.b3 * 2}%` }}
              />
              <div
                className="wave-zone wave-zone--b4"
                style={{ left: `${target - bands.b4}%`, width: `${bands.b4 * 2}%` }}
              />
              <div
                className="wave-target-marker"
                style={{ left: `${target}%` }}
              />
            </>
          )}
          {/* Ticks */}
          <div className="wave-tick" style={{ left: '25%' }} />
          <div className="wave-tick" style={{ left: '50%' }} />
          <div className="wave-tick" style={{ left: '75%' }} />
          {/* Guess dial + value tag */}
          <div
            className={`wave-dial ${phase === 'reveal' ? 'is-locked' : ''}`}
            style={{ left: `${guess}%` }}
          >
            <span className="wave-dial-value">{guess}</span>
          </div>
        </div>
        <div className="wave-bar-labels">
          <span>0</span><span>50</span><span>100</span>
        </div>
      </div>

      {/* Phase-specific actions */}
      {phase === 'clue-input' && iAmClueGiver && (
        <div className="wave-action">
          <input
            type="text"
            className="wave-clue-input"
            value={clue}
            onChange={(e) => setClue(e.target.value.slice(0, 40))}
            placeholder="단서 한 줄 (숫자·양끝 단어 금지)"
            maxLength={40}
          />
          <button
            type="button"
            className="pixel-btn pixel-btn--primary wave-submit"
            disabled={!clue.trim()}
            onClick={submitClue}
          >제출</button>
        </div>
      )}
      {phase === 'clue-input' && !iAmClueGiver && (
        <div className="wave-hint">촉냥이 단서를 고민 중이에요.</div>
      )}
      {phase === 'guessing' && (
        <div className="wave-action">
          <div className="wave-clue-display">
            <span className="wave-clue-label">단서</span>
            <span className="wave-clue-text">"{committedClue || '…'}"</span>
          </div>
          {!iAmClueGiver && (
            <button
              type="button"
              className="pixel-btn pixel-btn--primary wave-submit"
              onClick={commitGuess}
            >확정</button>
          )}
        </div>
      )}
      {phase === 'reveal' && (
        <div className="wave-reveal">
          <div className="wave-reveal-row">
            <span>단서</span>
            <b>"{committedClue}"</b>
          </div>
          <div className="wave-reveal-row">
            <span>정답 지점</span>
            <b>{target}</b>
          </div>
          <div className="wave-reveal-row wave-reveal-row--score">
            <span>추측 오차 · 획득</span>
            <b>±{Math.abs(target - guess)} · <span className="wave-score-badge">+{pts}</span></b>
          </div>
          <button
            type="button"
            className="pixel-btn pixel-btn--primary wave-submit"
            onClick={nextRound}
          >다음 라운드</button>
        </div>
      )}

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.isHost === clueGiverIsHost,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{p.isHost ? scores.host : scores.guest}점</span>,
        }))}
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <RegistryGuide gameId="wavelength" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {gameWinner && (
        <GameOverModal
          title={gameWinner === myName ? 'YOU WIN' : 'YOU LOSE'}
          winnerText={`${gameWinner} 우승 · ${preset.targetScore}점 선착`}
          outcome={gameWinner === myName ? 'win' : 'lose'}
          scoreSummary={[
            { label: myName, value: `${myScore}점`, highlight: gameWinner === myName },
            { label: opponentName, value: `${oppScore}점`, highlight: gameWinner !== myName },
          ]}
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
