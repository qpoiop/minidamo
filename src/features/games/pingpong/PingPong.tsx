import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { RegistryGuide } from '../common/RegistryGuide'
import { useVisibility } from '../../../hooks/useVisibility'
import { useRoleParticipants } from '../common/useRoleParticipants'
import { useMatchRestart } from '../common/useMatchRestart'

interface PingPongProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  maxPoints: number;
  isOpponentOnline?: boolean;
  soloMode?: boolean;
}

// Stage in virtual coordinates — canvas scales to fit.
const STAGE_WIDTH = 300
const STAGE_HEIGHT = 500
const PADDLE_WIDTH = 78
const PADDLE_HEIGHT = 12
const PADDLE_MARGIN = 14
const BALL_RADIUS = 7
const INITIAL_SPEED = 1.8            // slower serve — user reported ball was too fast
const SPEED_MULTIPLIER = 1.055       // per-hit speed bump — noticeable rally ramp
const MAX_SPEED = 20                 // hard cap · user asked ceiling raised so long rallies get spicy
const MAX_BOUNCE_ANGLE = Math.PI / 3 // 60° — how sharp a hit can leave the paddle
const PADDLE_ENGLISH = 0.35          // fraction of paddle velocity transferred to ball vx
const PADDLE_LERP = 0.42             // smoothing factor for local paddle to target
const PADDLE_INITIAL_X = (STAGE_WIDTH - PADDLE_WIDTH) / 2
const PADDLE_SEND_INTERVAL_MS = 25   // ~40 Hz cap so we don't flood the channel
const SERVE_DELAY_MS = 3000          // 3s countdown so the paddle can be repositioned before the ball serves

interface BallState { x: number; y: number; vx: number; vy: number }

const BALL_INITIAL: BallState = {
  x: STAGE_WIDTH / 2,
  y: STAGE_HEIGHT / 2,
  vx: INITIAL_SPEED,
  vy: INITIAL_SPEED,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const CANVAS_PALETTE_KEYS = {
  paddleLocal: '--accent-primary',
  paddleRemote: '--accent-secondary',
  ball: '--fg-accent',
  net: '--border-soft',
  field: '--bg-surface',
  serveBanner: '--fg-accent',
} as const

const CANVAS_PALETTE_FALLBACK: Record<keyof typeof CANVAS_PALETTE_KEYS, string> = {
  paddleLocal: 'lime',
  paddleRemote: 'olive',
  ball: 'yellow',
  net: 'darkgreen',
  field: 'black',
  serveBanner: 'yellow',
}

function readCanvasPalette(el: HTMLElement | null): Record<keyof typeof CANVAS_PALETTE_KEYS, string> {
  const styles = getComputedStyle(el ?? document.documentElement)
  const out = {} as Record<keyof typeof CANVAS_PALETTE_KEYS, string>
  ;(Object.keys(CANVAS_PALETTE_KEYS) as Array<keyof typeof CANVAS_PALETTE_KEYS>).forEach((k) => {
    out[k] = styles.getPropertyValue(CANVAS_PALETTE_KEYS[k]).trim() || CANVAS_PALETTE_FALLBACK[k]
  })
  return out
}

export function PingPong({
  players,
  peerId,
  isHost,
  sendMessage,
  onLobby,
  onChooseOther,
  onExit,
  maxPoints,
  isOpponentOnline = true,
  soloMode = false,
}: PingPongProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const visible = useVisibility()

  const [scores, setScores] = useState({ host: 0, guest: 0 })
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [serveCountdown, setServeCountdown] = useState<number>(0)
  const [guideOpen, setGuideOpen] = useState(false)
  const [rally, setRally] = useState(0)
  const rallyRef = useRef(0)

  const ballRef = useRef<BallState>({ ...BALL_INITIAL })
  const localPaddleX = useRef<number>(PADDLE_INITIAL_X)
  const paddleTargetXRef = useRef<number>(PADDLE_INITIAL_X)
  const remotePaddleX = useRef<number>(PADDLE_INITIAL_X)
  const scoresRef = useRef(scores)
  useEffect(() => { scoresRef.current = scores }, [scores])
  const winnerRef = useRef<string | null>(null)
  useEffect(() => { winnerRef.current = gameWinner }, [gameWinner])
  const serveUntilRef = useRef<number>(0)
  const lastPaddleSendRef = useRef<number>(0)
  const visibleRef = useRef<boolean>(visible)
  useEffect(() => { visibleRef.current = visible }, [visible])
  const opponentOnlineRef = useRef<boolean>(isOpponentOnline)
  useEffect(() => { opponentOnlineRef.current = isOpponentOnline }, [isOpponentOnline])

  const { myName, opponentName } = useRoleParticipants(players, isHost)

  const beginServe = useCallback(() => {
    serveUntilRef.current = Date.now() + SERVE_DELAY_MS
    setServeCountdown(SERVE_DELAY_MS)
  }, [])

  const applyMatchReset = useCallback(() => {
    setScores({ host: 0, guest: 0 })
    rallyRef.current = 0
    setRally(0)
    setGameWinner(null)
    ballRef.current = { ...BALL_INITIAL }
    localPaddleX.current = PADDLE_INITIAL_X
    paddleTargetXRef.current = PADDLE_INITIAL_X
    remotePaddleX.current = PADDLE_INITIAL_X
    beginServe()
  }, [beginServe])

  const { handleRestartMatch } = useMatchRestart({ applyMatchReset, sendMessage, peerId })

  // Start with a serve pause so both sides can steady the paddles.
  useEffect(() => { beginServe() }, [beginServe])

  // ---- P2P inbound -----------------------------------------------------
  useEffect(() => {
    const handleP2PEvent = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      // NOTE: no self-filter — dispatchInbound only fires for RECEIVED messages;
      // peerId (roomId) is identical on both sides so the old senderId===peerId
      // check was actually dropping every remote GAME_ACTION.

      if (msg.type === 'GAME_ACTION') {
        const { actionType, x, ballX, ballY, hostScore, guestScore, winner } = msg.payload

        if (actionType === 'MOVE_PADDLE' && typeof x === 'number') {
          remotePaddleX.current = clamp(STAGE_WIDTH - x - PADDLE_WIDTH, 0, STAGE_WIDTH - PADDLE_WIDTH)
        } else if (actionType === 'BALL_SYNC' && !isHost) {
          if (typeof ballX === 'number' && typeof ballY === 'number') {
            ballRef.current.x = STAGE_WIDTH - ballX
            ballRef.current.y = STAGE_HEIGHT - ballY
          }
          if (typeof hostScore === 'number' && typeof guestScore === 'number') {
            const prev = scoresRef.current
            if (hostScore !== prev.host || guestScore !== prev.guest) {
              // Score just changed on host — give the guest the same serve pause.
              beginServe()
            }
            setScores({ host: hostScore, guest: guestScore })
          }
          if (winner === 'HOST') setGameWinner(opponentName)
          else if (winner === 'GUEST') setGameWinner(myName)
        }
      }
      // GAME_RESET · RESTART handled by useMatchRestart listener.
    }
    window.addEventListener('p2p_message', handleP2PEvent)
    return () => window.removeEventListener('p2p_message', handleP2PEvent)
  }, [peerId, isHost, myName, opponentName, beginServe])

  // ---- Paddle input (throttled) ----------------------------------------
  const updatePaddleFromClient = useCallback(
    (clientX: number) => {
      if (winnerRef.current || !canvasRef.current) return
      if (!opponentOnlineRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      if (rect.width === 0) return
      const relX = clientX - rect.left
      const ratio = STAGE_WIDTH / rect.width
      const targetX = relX * ratio - PADDLE_WIDTH / 2
      const newX = clamp(targetX, 0, STAGE_WIDTH - PADDLE_WIDTH)
      // Input sets a target; the step loop lerps localPaddleX toward it.
      paddleTargetXRef.current = newX
      const now = Date.now()
      if (now - lastPaddleSendRef.current < PADDLE_SEND_INTERVAL_MS) return
      lastPaddleSendRef.current = now
      sendMessage({
        type: 'GAME_ACTION',
        senderId: peerId,
        timestamp: now,
        payload: { actionType: 'MOVE_PADDLE', x: newX },
      })
    },
    [peerId, sendMessage],
  )

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return
    updatePaddleFromClient(e.touches[0].clientX)
  }
  const handleMouseMove = (e: React.MouseEvent) => updatePaddleFromClient(e.clientX)

  // ---- Physics + render loop -------------------------------------------
  useEffect(() => {
    let animId: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let currentHostScore = scoresRef.current.host
    let currentGuestScore = scoresRef.current.guest
    let localWinnerDeclared = false
    let lastSyncSentAt = 0
    const SYNC_INTERVAL_MS = 20 // 50 Hz ball sync

    const themePalette = readCanvasPalette(document.documentElement)

    const resetBall = (goingUp: boolean) => {
      const b = ballRef.current
      b.x = STAGE_WIDTH / 2
      b.y = STAGE_HEIGHT / 2
      // Serve launches at a shallow angle so the very first exchange is
      // reactable instead of instantly diving into a corner.
      const jitter = (Math.random() - 0.5) * 0.6
      b.vx = jitter * INITIAL_SPEED
      b.vy = (goingUp ? -1 : 1) * INITIAL_SPEED
    }

    const capSpeedVec = (vx: number, vy: number) => {
      const s = Math.hypot(vx, vy)
      if (s <= MAX_SPEED) return { vx, vy }
      const k = MAX_SPEED / s
      return { vx: vx * k, vy: vy * k }
    }

    // Track paddle velocities so we can transfer some english to the ball
    // on impact (spec: "impact zones + friction consideration").
    let lastLocalPaddleX = localPaddleX.current
    let lastRemotePaddleX = remotePaddleX.current
    let localPaddleVx = 0
    let remotePaddleVx = 0

    const reflectOffPaddle = (
      ball: BallState,
      paddleX: number,
      paddleVx: number,
      isTop: boolean,
    ) => {
      // Where along the paddle was the hit? -1 (far left) → 0 (centre) → +1 (far right).
      const hitOffset = ((ball.x - (paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2))
      const normalized = clamp(hitOffset, -1, 1)
      // Bounce angle = normalized × maxAngle. Vertical component keeps
      // the current speed magnitude (with the small paddle-hit boost).
      const speed = Math.hypot(ball.vx, ball.vy) * SPEED_MULTIPLIER
      const angle = normalized * MAX_BOUNCE_ANGLE
      const dir = isTop ? 1 : -1     // top paddle sends ball downward
      let vx = speed * Math.sin(angle)
      let vy = dir * speed * Math.cos(angle)
      // English: paddle's own motion nudges the ball horizontally.
      vx += paddleVx * PADDLE_ENGLISH
      const capped = capSpeedVec(vx, vy)
      ball.vx = capped.vx
      ball.vy = capped.vy
      // Rally counter — bumps on every paddle contact. Displayed in
      // the HUD so the speed-up beat is legible.
      rallyRef.current += 1
      setRally(rallyRef.current)
    }

    let lastFrameTs = performance.now()
    const step = () => {
      if (winnerRef.current) return

      const now = Date.now()
      const inServePause = now < serveUntilRef.current
      const countdownDisplay = Math.max(0, serveUntilRef.current - now)
      if (countdownDisplay !== serveCountdown) setServeCountdown(countdownDisplay)

      // dt-based physics so ball speed feels identical on 60/120 Hz
      // screens instead of scaling with the refresh rate. Baseline is
      // 60 fps (1000/60 ≈ 16.67ms).
      const nowTs = performance.now()
      const dtMs = Math.min(48, nowTs - lastFrameTs)  // clamp large gaps (tab restore)
      lastFrameTs = nowTs
      const dtScale = dtMs / (1000 / 60)

      // Smooth the local paddle toward its target position — makes the
      // drag feel more physical instead of instantaneous snap.
      const targetX = paddleTargetXRef.current ?? localPaddleX.current
      const smoothed = localPaddleX.current + (targetX - localPaddleX.current) * PADDLE_LERP
      localPaddleX.current = smoothed

      // Track paddle velocities (delta between frames) so `english`
      // (english = spin transferred by a moving paddle) works.
      localPaddleVx = (localPaddleX.current - lastLocalPaddleX)
      remotePaddleVx = (remotePaddleX.current - lastRemotePaddleX)
      lastLocalPaddleX = localPaddleX.current
      lastRemotePaddleX = remotePaddleX.current

      // Host runs authoritative physics only when the tab is visible AND
      // the opponent connection is healthy AND we aren't in a serve pause.
      // In solo/test mode there is no remote authority, so the guest view
      // also runs physics locally — otherwise the ball never moves after
      // switching the tester's role to guest.
      if ((isHost || soloMode) && !localWinnerDeclared && visibleRef.current && opponentOnlineRef.current && !inServePause) {
        const ball = ballRef.current
        ball.x += ball.vx * dtScale
        ball.y += ball.vy * dtScale

        if (ball.x - BALL_RADIUS <= 0) {
          ball.x = BALL_RADIUS
          ball.vx = Math.abs(ball.vx)
        } else if (ball.x + BALL_RADIUS >= STAGE_WIDTH) {
          ball.x = STAGE_WIDTH - BALL_RADIUS
          ball.vx = -Math.abs(ball.vx)
        }

        // Impact zone expanded: paddle counts as hit if the ball's centre
        // is within [paddleX - BALL_RADIUS, paddleX + PADDLE_WIDTH + BALL_RADIUS]
        // and the ball crosses the paddle plane in the correct direction.
        const topPaddlePlane = PADDLE_MARGIN + PADDLE_HEIGHT
        const bottomPaddlePlane = STAGE_HEIGHT - PADDLE_MARGIN - PADDLE_HEIGHT

        // top paddle (opponent)
        if (
          ball.y - BALL_RADIUS <= topPaddlePlane &&
          ball.x >= remotePaddleX.current - BALL_RADIUS &&
          ball.x <= remotePaddleX.current + PADDLE_WIDTH + BALL_RADIUS &&
          ball.vy < 0
        ) {
          ball.y = topPaddlePlane + BALL_RADIUS
          reflectOffPaddle(ball, remotePaddleX.current, remotePaddleVx, true)
        }
        // bottom paddle (me)
        if (
          ball.y + BALL_RADIUS >= bottomPaddlePlane &&
          ball.x >= localPaddleX.current - BALL_RADIUS &&
          ball.x <= localPaddleX.current + PADDLE_WIDTH + BALL_RADIUS &&
          ball.vy > 0
        ) {
          ball.y = bottomPaddlePlane - BALL_RADIUS
          reflectOffPaddle(ball, localPaddleX.current, localPaddleVx, false)
        }

        if (ball.y < 0) {
          currentHostScore += 1
          setScores({ host: currentHostScore, guest: currentGuestScore })
          rallyRef.current = 0
          setRally(0)
          resetBall(false)
          serveUntilRef.current = Date.now() + SERVE_DELAY_MS
        } else if (ball.y > STAGE_HEIGHT) {
          currentGuestScore += 1
          setScores({ host: currentHostScore, guest: currentGuestScore })
          rallyRef.current = 0
          setRally(0)
          resetBall(true)
          serveUntilRef.current = Date.now() + SERVE_DELAY_MS
        }

        let matchWinner: 'HOST' | 'GUEST' | null = null
        if (currentHostScore >= maxPoints) {
          matchWinner = 'HOST'
          localWinnerDeclared = true
          setGameWinner(myName)
        } else if (currentGuestScore >= maxPoints) {
          matchWinner = 'GUEST'
          localWinnerDeclared = true
          setGameWinner(opponentName)
        }

        if (now - lastSyncSentAt >= SYNC_INTERVAL_MS || matchWinner) {
          lastSyncSentAt = now
          sendMessage({
            type: 'GAME_ACTION',
            senderId: peerId,
            timestamp: now,
            payload: {
              actionType: 'BALL_SYNC',
              ballX: ball.x,
              ballY: ball.y,
              hostScore: currentHostScore,
              guestScore: currentGuestScore,
              winner: matchWinner,
            },
          })
        }
      }

      // Painting always runs so the paddle you're dragging stays alive
      // even when the sim itself is paused.
      ctx.fillStyle = themePalette.field
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)

      ctx.strokeStyle = themePalette.net
      ctx.lineWidth = 2
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(0, STAGE_HEIGHT / 2)
      ctx.lineTo(STAGE_WIDTH, STAGE_HEIGHT / 2)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = themePalette.paddleLocal
      ctx.fillRect(localPaddleX.current, STAGE_HEIGHT - PADDLE_HEIGHT - PADDLE_MARGIN, PADDLE_WIDTH, PADDLE_HEIGHT)

      ctx.fillStyle = themePalette.paddleRemote
      ctx.fillRect(remotePaddleX.current, PADDLE_MARGIN, PADDLE_WIDTH, PADDLE_HEIGHT)

      ctx.fillStyle = themePalette.ball
      ctx.fillRect(
        Math.floor(ballRef.current.x - BALL_RADIUS),
        Math.floor(ballRef.current.y - BALL_RADIUS),
        BALL_RADIUS * 2,
        BALL_RADIUS * 2,
      )

      // Serve banner overlay
      if (countdownDisplay > 0) {
        const secs = Math.ceil(countdownDisplay / 1000)
        ctx.fillStyle = themePalette.serveBanner
        ctx.font = 'bold 22px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`SERVE ${secs}`, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - 32)
      }

      animId = requestAnimationFrame(step)
    }

    animId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, peerId, sendMessage, maxPoints, myName, opponentName])

  const turnText = gameWinner
    ? '매치 종료'
    : serveCountdown > 0
      ? `서브 준비 ${Math.ceil(serveCountdown / 1000)}s`
      : !isOpponentOnline
        ? '상대 연결 대기'
        : '경기 진행 중'

  // Current ball speed — display as an integer so the HUD chip stays
  // legible while the ball accelerates through the 5.5% per-hit ramp.
  const ballSpeed = Math.round(
    Math.hypot(ballRef.current.vx, ballRef.current.vy),
  )
  const scoreConn = [
    `${isHost ? scores.host : scores.guest} : ${isHost ? scores.guest : scores.host}`,
    rally > 0 ? `랠리 ${rally}` : null,
    ballSpeed > 0 ? `속도 ${ballSpeed}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="game-screen">
      <GameHeader
        code="PINGPONG"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={isOpponentOnline ? scoreConn : '재연결 중…'}
        variant={serveCountdown > 0 ? 'serve' : isOpponentOnline ? 'default' : 'idle'}
      />

      <div className="pingpong-stage" onTouchMove={handleTouchMove} onMouseMove={handleMouseMove}>
        <canvas ref={canvasRef} width={STAGE_WIDTH} height={STAGE_HEIGHT} className="pingpong-canvas" />
      </div>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.id === peerId,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{p.isHost ? scores.host : scores.guest}</span>,
        }))}
        hint="경기장을 드래그해 패들 조작"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />

      <RegistryGuide gameId="pingpong" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {gameWinner && (
        <GameOverModal
          title={gameWinner === myName ? 'YOU WIN' : 'YOU LOSE'}
          winnerText={`${gameWinner} 우승`}
          outcome={gameWinner === myName ? 'win' : 'lose'}
          scoreSummary={[
            { label: isHost ? myName : opponentName, value: scores.host, highlight: scores.host > scores.guest },
            { label: !isHost ? myName : opponentName, value: scores.guest, highlight: scores.guest > scores.host },
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
