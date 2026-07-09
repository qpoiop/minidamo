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
  /** Tolerance preset id (0..3) — mapped by TOLERANCE_INDEX_TO_PRESET. */
  matchOption?: number;
  /** Target score for win — read directly (8/10/12/15/20). Defaults to
   *  the tolerance's paired default when omitted. */
  matchOption2?: number;
}

/** Tolerance preset selected by primary dropdown. */
const TOLERANCE_INDEX_TO_PRESET: Record<number, TolerancePreset> = {
  0: 'razor',
  1: 'default',
  2: 'strict',
  3: 'loose',
}
/** Fallback target if the lobby didn't pass one (legacy path).
 *  · 사용자 요청 · 승리 점수 3/5/7 로 축소. 이전 8-20 스케일은 라운
 *    드 당 3 점 획득 정책과 결합해 매치가 너무 짧아짐. */
const DEFAULT_TARGET_BY_TOL: Record<TolerancePreset, number> = {
  razor:   3,
  default: 5,
  strict:  5,
  loose:   7,
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
  matchOption2,
}: WavelengthProps) {
  const tolerance: TolerancePreset = TOLERANCE_INDEX_TO_PRESET[matchOption] ?? 'default'
  const targetScore = matchOption2 ?? DEFAULT_TARGET_BY_TOL[tolerance]
  const preset = { tolerance, targetScore, label: `${tolerance} · ${targetScore}점` }
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
  // Guesser can request a second clue once per round. Consuming it
  // returns the turn to the clue giver; guessing phase resumes when
  // the new clue is committed.
  const [clueReRequestsLeft, setClueReRequestsLeft] = useState(1)

  const { myName, opponentName } = useRoleParticipants(players, isHost)

  // Whose "촉냥" turn is it? host on odd rounds, guest on even.
  const clueGiverIsHost = round % 2 === 1
  const iAmClueGiver = clueGiverIsHost === isHost

  const card: SpectrumCard = pickCard(seed || 1, round)
  const target: number = pickTarget(seed || 1, round)

  // ---- 게이지 표시 규칙 (재정의) --------------------------------------
  // 이전 구현은 촉냥의 clue-input 단계에 정답 위치에 dial 을 pin 해
  // 놨는데 사용자가 "핸들 바가 뭘 하란건지 모르겠다" 라고 지적. 촉냥
  // 은 정답을 이미 알고 있고 조작할 필요가 없으므로 dial 을 아예 숨김.
  //
  // 정답 존 (스트라이프) — 촉냥의 clue-input 단계 + 전체의 reveal 단계.
  //   추측자에게는 clue-input · guessing 단계 모두에서 숨김.
  const showTargetZone = (phase === 'clue-input' && iAmClueGiver) || phase === 'reveal'
  // Dial 상세:
  //   · clue-input · 촉냥       → dial 숨김. 정답은 상단 카드 헤더의
  //                                TARGET 표시에서 확인.
  //   · clue-input · 추측자     → dial 표시 · 드래그 가능하지만 숫자
  //                                readout 은 숨김 (미리 익숙해지는 용).
  //   · guessing                 → 두 쪽 모두 dial 표시. 추측자만 조작
  //                                가능하고 숫자 readout 도 노출.
  //                                촉냥은 실시간으로 추측자 위치 관찰만.
  //   · reveal                   → 확정된 guess 위치에 dial 고정 + 숫자.
  // 사용자 요구 재정의: 추측자의 clue-input 단계에도 dial 은 표시
  // 하되 조작 불가 + 수치는 표시. Guessing 단계 이전엔 조작 락.
  const showDial =
    (phase === 'clue-input' && !iAmClueGiver) ||
    phase === 'guessing' ||
    phase === 'reveal'
  const dialPos: number | null = showDial ? guess : null
  // Dial 조작 가능 여부. clue-input 추측자 = 대기라 조작 X. guessing
  // 추측자만 조작 가능.
  // 사용자 재요청: clue-input 단계 · 추측자에게도 dial 조작 허용.
  // 미리 대략 위치 잡아두고 guessing 단계 시작하면 정교하게 맞추는
  // 흐름. Guessing 단계에도 물론 조작.
  const dialInteractive = !iAmClueGiver && (phase === 'clue-input' || phase === 'guessing')
  const dialLocked = !dialInteractive
  // 이전엔 clue-input 추측자에서 숫자를 숨겼지만, 사용자 재요청:
  // "핸들러 위치에 해당하는 수치도 보여야 해". 이제 항상 노출.

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
    setClueReRequestsLeft(1)
    setScores({ host: 0, guest: 0 })
    setGameWinner(null)
    seedBroadcastRef.current = false
    return nextSeed
  }, [isHost, soloMode])

  const onHostPostReset = useCallback((nextSeed: number) => {
    setTimeout(() => {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'WAVE_SEED', hostScore: nextSeed },
      })
    }, 60)
  }, [sendMessage, peerId])
  const { handleRestartMatch } = useMatchRestart({ applyMatchReset, sendMessage, peerId, isHost, onHostPostReset, hostRestartRoute: onLobby })

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
          setClueReRequestsLeft(1)
          return
        }
        if (actionType === 'WAVE_RECLUE') {
          // Guesser asked for another clue. Return the turn to the
          // clue giver; keep the current dial position + committed
          // clue log so both sides can compare the new hint.
          setPhase('clue-input')
          setClue('')
          setCommittedClue('')
          return
        }
        if (actionType === 'WAVE_WIN' && typeof msg.payload?.winner === 'string') {
          setGameWinner(msg.payload.winner === 'host' ? (isHost ? myName : opponentName) : (isHost ? opponentName : myName))
          return
        }
      }
      // GAME_RESET · RESTART handled by useMatchRestart listener.
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [isHost, myName, opponentName, peerId, sendMessage])

  const submitClue = () => {
    if (!clue.trim()) return
    setCommittedClue(clue.trim())
    setPhase('guessing')
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'WAVE_CLUE', winner: clue.trim() },
    })
  }

  const requestReclue = () => {
    if (clueReRequestsLeft <= 0) return
    if (phase !== 'guessing') return
    setClueReRequestsLeft((n) => n - 1)
    setPhase('clue-input')
    setCommittedClue('')
    setClue('')
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'WAVE_RECLUE' },
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
    // 조작 가능 phase 는 guessing (본격 제출용) + clue-input · 추측
    // 자 (예비 위치 잡기). Guide 배너에서 안내함.
    if (!dialInteractive) return
    if (!isOpponentOnline || gameWinner) return
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
    <div className="game-screen" data-my-turn={canAct && !gameWinner ? '1' : '0'}>
      <GameHeader
        code="WAVELENGTH"
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

      {/* 진행 단계 rail — 최상단, GameTurnStrip 바로 아래. 이전에 카드
       * + 게이지 사이에 두었더니 위치가 애매하다는 피드백. 이제 화면
       * 상단에 세로 컴팩트 pill 스트립으로 배치. */}
      <div className="wave-phase-strip" aria-label="라운드 진행 단계">
        {(['clue-input', 'guessing', 'reveal'] as const).map((p, i) => {
          const labels = ['단서', '다이얼', '결과'] as const
          const isActive = phase === p
          const done = (
            (p === 'clue-input' && (phase === 'guessing' || phase === 'reveal')) ||
            (p === 'guessing'   &&  phase === 'reveal')
          )
          return (
            <div
              key={p}
              className={`wave-phase-tab ${isActive ? 'is-active' : done ? 'is-done' : ''}`}
            >
              <span className="wave-phase-tab-num">{i + 1}</span>
              <span className="wave-phase-tab-label">{labels[i]}</span>
            </div>
          )
        })}
      </div>

      <div className={`wave-card wave-card--${card.kind}`}>
        {card.kind === 'indicator' && (
          <div className="wave-card-topic">
            <span className="wave-card-topic-tag">주제</span>
            <span className="wave-card-topic-subject">{card.subject}</span>
            <span className="wave-card-topic-sep">·</span>
            <span className="wave-card-topic-axis">{card.axis}</span>
          </div>
        )}
        {card.kind === 'concept' && (
          <div className="wave-card-topic">
            <span className="wave-card-topic-tag">유형</span>
            <span className="wave-card-topic-subject">개념형</span>
            <span className="wave-card-topic-sep">·</span>
            <span className="wave-card-topic-axis">그 지점의 느낌을 자유 단서로</span>
          </div>
        )}
        <div className="wave-card-title">
          <span className="wave-card-axis-group">
            <span className="wave-card-low">{card.low}</span>
            <span className="wave-card-sep">↔</span>
            <span className="wave-card-high">{card.high}</span>
          </span>
          {/* 표현지점 pill · 출제자 clue-input 단계에만 노출.
           * 시안 반영: "우측에는 표현지점 49 뭐 이런식으로 보여주게해". */}
          {phase === 'clue-input' && iAmClueGiver && (
            <span className="wave-card-target-pill">표현지점 {target}</span>
          )}
        </div>
      </div>

      <div className="wave-bar-wrap">
       <div className="wave-bar-inner">
        {/* Axis 라벨 — 게이지 좌우 끝에 카드의 low/high 축을 노출.
         * 시안: 게이지 위쪽 좌우 코너에 `흔하다` / `희귀하다`. 이렇게
         * 붙여야 게이지 색상 그라디언트와 축의 인과관계가 명확해짐.
         * 카드에 있던 low ↔ high 는 카드 블록 안에 이미 있으니 여기선
         * 게이지 즉시 옆에 재노출. */}
        <div className="wave-bar-axis">
          <span className="wave-bar-axis-low">{card.low}</span>
          <span className="wave-bar-axis-high">{card.high}</span>
        </div>
        <div
          ref={barRef}
          className="wave-bar"
          data-interactive={dialInteractive ? '1' : '0'}
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
        >
          {/* 적중 존 + 마커 — 출제자의 clue-input 이거나 reveal 일 때만
           * 표시. 추측자에게는 clue-input · guessing 단계 모두에서 숨
           * 김 (정답이 새면 게임이 성립 안 됨).
           * 채점 정책 단순화: 단일 밴드 (b4) 만 노출. 오차 안 = 1점,
           * 밖 = 0점. */}
          {showTargetZone && (
            <>
              <div
                className="wave-zone wave-zone--b4"
                style={{ left: `${target - bands.b4}%`, width: `${bands.b4 * 2}%` }}
              />
              <div className="wave-target-marker" style={{ left: `${target}%` }} />
              {/* 정답 수치 pill — 출제자에게 정답 위치를 명시. Reveal
               * 단계에도 노출해서 최종 결과 시각화. */}
              <div className="wave-target-value" style={{ left: `${target}%` }}>
                {phase === 'reveal' ? `정답 ${target}` : `목표 ${target}`}
              </div>
            </>
          )}
          {/* Ticks */}
          <div className="wave-tick" style={{ left: '25%' }} />
          <div className="wave-tick" style={{ left: '50%' }} />
          <div className="wave-tick" style={{ left: '75%' }} />
          {/* Dial · 상하로 살짝 튀어나온 얇은 세로 라인 스타일.
           *   · clue-input 촉냥       → dial 없음
           *   · clue-input 추측자     → dial 표시 · 조작 X · 수치 표시
           *   · guessing              → dial 표시 · 조작 O · 수치 표시
           *   · reveal                → dial 표시 · 확정 위치 + 수치 */}
          {dialPos != null && (
            <div
              className={`wave-dial ${dialLocked ? 'is-locked' : 'is-interactive'} ${phase === 'reveal' ? 'is-reveal' : ''}`}
              style={{ left: `${dialPos}%` }}
              aria-label={`다이얼 ${dialPos}`}
            >
              <span className="wave-dial-value">
                {phase === 'reveal' ? `내 답 ${dialPos}` : dialPos}
              </span>
            </div>
          )}
        </div>
        {/* 눈금 라벨 · 0/50/100 + 표시 대상 수치. 출제자 clue-input
         * 단계 · reveal 단계에서 target 값을 라임 하이라이트로 그
         * 위치에 절대 포지션. 시안: "0 50 100 표시한 거처럼 하이라
         * 이트 컬러로 49 이것도 표시하고". */}
        <div className="wave-bar-labels">
          <span>0</span><span>50</span><span>100</span>
          {showTargetZone && target !== 0 && target !== 50 && target !== 100 && (
            <span className="wave-bar-labels-target" style={{ left: `${target}%` }}>
              {target}
            </span>
          )}
        </div>
       </div>
      </div>

      {phase === 'clue-input' && iAmClueGiver && (
        <div className="wave-guide wave-guide--host-only">
          <div className="wave-guide-title">당신은 출제자입니다</div>
          <div className="wave-guide-body">
            정답 지점 <b>{target}</b> 을 유추할 수 있는 단서를 <b>주제에 맞는 표현</b>으로 제출하세요.
          </div>
        </div>
      )}
      {phase === 'clue-input' && !iAmClueGiver && (
        <div className="wave-guide">
          <div className="wave-guide-title">당신은 추측자입니다</div>
          <div className="wave-guide-body">
            출제자가 정답 지점을 표현하고 있어요. 차례가 오면 단서를 보고 표현 지점을 추측해 게이지를 이동해 주세요. 지금도 다이얼을 미리 만져서 위치를 잡아 둘 수 있어요.
          </div>
        </div>
      )}
      {phase === 'guessing' && !iAmClueGiver && (
        <div className="wave-guide">
          <div className="wave-guide-title">당신은 추측자입니다</div>
          <div className="wave-guide-body">
            출제자의 단서를 보고 표현 지점을 추측해서 다이얼을 이동시키고 확정을 눌러 제출하세요.
            {clueReRequestsLeft > 0 && ' 단서가 애매하면 재요청 가능합니다.'}
          </div>
        </div>
      )}
      {phase === 'guessing' && iAmClueGiver && (
        <div className="wave-guide">
          <div className="wave-guide-title">당신은 출제자입니다</div>
          <div className="wave-guide-body">
            {opponentName} 이(가) 다이얼을 이동 중이에요. 실시간 위치가 게이지에 표시돼요.
          </div>
        </div>
      )}
      {/* Reveal 단계 스코어 카드 — 시안: 노랑 라인 explainer 는 애매하
       * 다는 피드백. 대신 이 자리에 padded 카드로 세 값을 그리드
       * 배치. */}
      {phase === 'reveal' && (
        <div className="wave-guide wave-guide--reveal">
          <div className="wave-reveal-grid">
            <div className="wave-reveal-cell">
              <span className="wave-reveal-cell-label">정답</span>
              <span className="wave-reveal-cell-value">{target}</span>
            </div>
            <div className="wave-reveal-cell">
              <span className="wave-reveal-cell-label">내 답</span>
              <span className="wave-reveal-cell-value">{guess}</span>
            </div>
            <div className="wave-reveal-cell">
              <span className="wave-reveal-cell-label">오차</span>
              <span className="wave-reveal-cell-value">{Math.abs(target - guess)}</span>
            </div>
            <div className={`wave-reveal-cell wave-reveal-cell--score wave-reveal-cell--score-${pts}`}>
              <span className="wave-reveal-cell-label">이번 점수</span>
              <span className="wave-reveal-cell-value">+{pts}</span>
            </div>
          </div>
        </div>
      )}
      {phase === 'clue-input' && iAmClueGiver && (
        <div className="wave-action">
          <input
            type="text"
            className="wave-clue-input"
            value={clue}
            onChange={(e) => setClue(e.target.value.slice(0, 40))}
            placeholder="주제에 맞는 한 줄 단서"
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
      {phase === 'guessing' && (
        <div className="wave-action">
          <div className="wave-clue-display">
            <span className="wave-clue-label">단서</span>
            <span className="wave-clue-text">"{committedClue || '…'}"</span>
          </div>
          {!iAmClueGiver && (
            <>
              <button
                type="button"
                className="pixel-btn pixel-btn--ghost wave-submit"
                onClick={requestReclue}
                disabled={clueReRequestsLeft <= 0}
                title={clueReRequestsLeft <= 0 ? '이번 라운드에 이미 사용' : '출제자에게 단서 한 번 더 요청'}
              >단서 재요청 · {clueReRequestsLeft}</button>
              <button
                type="button"
                className="pixel-btn pixel-btn--primary wave-submit"
                onClick={commitGuess}
              >확정</button>
            </>
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
      <TurnTransitionToast
        isMyTurn={!!isMyTurn}
        opponentName={opponentName}
        suppress={!!gameWinner || phase === 'reveal'}
        mineText={
          phase === 'clue-input' ? '내 턴 · 단서 작성'
          : phase === 'guessing' ? '내 턴 · 다이얼 조작'
          : '내 턴'
        }
        oppText={(opp) => phase === 'clue-input'
          ? `${opp} · 단서 작성 중`
          : phase === 'guessing'
            ? `${opp} · 다이얼 조작 중`
            : `${opp} 턴`
        }
      />
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
