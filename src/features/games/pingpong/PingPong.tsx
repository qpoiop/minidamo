import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { GameGuideModal } from '../common/GameGuideModal'
import { useVisibility } from '../../../hooks/useVisibility'

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
}

// Stage in virtual coordinates — canvas scales to fit.
const STAGE_WIDTH = 300
const STAGE_HEIGHT = 500
const PADDLE_WIDTH = 70
const PADDLE_HEIGHT = 10
const PADDLE_MARGIN = 12
const BALL_RADIUS = 7
const INITIAL_SPEED = 3
const SPEED_MULTIPLIER = 1.05
const MAX_SPEED = 9
const PADDLE_INITIAL_X = (STAGE_WIDTH - PADDLE_WIDTH) / 2
const PADDLE_SEND_INTERVAL_MS = 25 // ~40 Hz cap so we don't flood the channel
const SERVE_DELAY_MS = 900          // pause after a score before the ball moves again

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
}: PingPongProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const visible = useVisibility()

  const [scores, setScores] = useState({ host: 0, guest: 0 })
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [serveCountdown, setServeCountdown] = useState<number>(0)
  const [guideOpen, setGuideOpen] = useState(false)

  const ballRef = useRef<BallState>({ ...BALL_INITIAL })
  const localPaddleX = useRef<number>(PADDLE_INITIAL_X)
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

  const myName = players.find((p) => p.id === peerId)?.name || '나'
  const opponentName = players.find((p) => p.id !== peerId)?.name || '상대방'

  const beginServe = useCallback(() => {
    serveUntilRef.current = Date.now() + SERVE_DELAY_MS
    setServeCountdown(SERVE_DELAY_MS)
  }, [])

  const applyMatchReset = useCallback(() => {
    setScores({ host: 0, guest: 0 })
    setGameWinner(null)
    ballRef.current = { ...BALL_INITIAL }
    localPaddleX.current = PADDLE_INITIAL_X
    remotePaddleX.current = PADDLE_INITIAL_X
    beginServe()
  }, [beginServe])

  const handleRestartMatch = useCallback(() => {
    applyMatchReset()
    sendMessage({
      type: 'GAME_RESET',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
  }, [applyMatchReset, peerId, sendMessage])

  // Start with a serve pause so both sides can steady the paddles.
  useEffect(() => { beginServe() }, [beginServe])

  // ---- P2P inbound -----------------------------------------------------
  useEffect(() => {
    const handleP2PEvent = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.senderId === peerId) return

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
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', handleP2PEvent)
    return () => window.removeEventListener('p2p_message', handleP2PEvent)
  }, [peerId, isHost, myName, opponentName, applyMatchReset, beginServe])

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
      localPaddleX.current = newX
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
      b.vx = (Math.random() > 0.5 ? 1 : -1) * INITIAL_SPEED
      b.vy = (goingUp ? -1 : 1) * INITIAL_SPEED
    }

    const capSpeed = (v: number) => clamp(v, -MAX_SPEED, MAX_SPEED)

    const step = () => {
      if (winnerRef.current) return

      const now = Date.now()
      const inServePause = now < serveUntilRef.current
      const countdownDisplay = Math.max(0, serveUntilRef.current - now)
      if (countdownDisplay !== serveCountdown) setServeCountdown(countdownDisplay)

      // Host runs authoritative physics only when the tab is visible AND
      // the opponent connection is healthy AND we aren't in a serve pause.
      if (isHost && !localWinnerDeclared && visibleRef.current && opponentOnlineRef.current && !inServePause) {
        const ball = ballRef.current
        ball.x += ball.vx
        ball.y += ball.vy

        if (ball.x - BALL_RADIUS <= 0) {
          ball.x = BALL_RADIUS
          ball.vx *= -1
        } else if (ball.x + BALL_RADIUS >= STAGE_WIDTH) {
          ball.x = STAGE_WIDTH - BALL_RADIUS
          ball.vx *= -1
        }

        // top paddle (opponent)
        if (
          ball.y - BALL_RADIUS <= PADDLE_HEIGHT + PADDLE_MARGIN &&
          ball.x >= remotePaddleX.current &&
          ball.x <= remotePaddleX.current + PADDLE_WIDTH &&
          ball.vy < 0
        ) {
          ball.vy = capSpeed(ball.vy * -SPEED_MULTIPLIER)
          ball.y = PADDLE_HEIGHT + PADDLE_MARGIN + BALL_RADIUS
        }
        // bottom paddle (me)
        if (
          ball.y + BALL_RADIUS >= STAGE_HEIGHT - PADDLE_HEIGHT - PADDLE_MARGIN &&
          ball.x >= localPaddleX.current &&
          ball.x <= localPaddleX.current + PADDLE_WIDTH &&
          ball.vy > 0
        ) {
          ball.vy = capSpeed(ball.vy * -SPEED_MULTIPLIER)
          ball.y = STAGE_HEIGHT - PADDLE_HEIGHT - PADDLE_MARGIN - BALL_RADIUS
        }

        if (ball.y < 0) {
          currentHostScore += 1
          setScores({ host: currentHostScore, guest: currentGuestScore })
          resetBall(false)
          serveUntilRef.current = Date.now() + SERVE_DELAY_MS
        } else if (ball.y > STAGE_HEIGHT) {
          currentGuestScore += 1
          setScores({ host: currentHostScore, guest: currentGuestScore })
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
      ? `SERVE ${Math.ceil(serveCountdown / 1000)}초`
      : !isOpponentOnline
        ? '상대 연결 대기'
        : '경기 진행 중'

  const scoreConn = `${isHost ? scores.host : scores.guest} : ${isHost ? scores.guest : scores.host}`

  return (
    <div className="game-screen">
      <GameHeader
        code="PINGPONG"
        playerCount={2}
        ruleTag={`선제 ${maxPoints}점`}
        onHelp={() => setGuideOpen(true)}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={isOpponentOnline ? `연결됨 · ${scoreConn}` : '재연결 중…'}
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

      <GameGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="미니 탁구 가이드"
        steps={[
          { title: '목표', desc: `상대 골대를 넘겨 선제 ${maxPoints}점 획득` },
          { title: '조작', desc: '경기장 하단을 드래그해 패들을 좌우로 움직여요.' },
          { title: '팁', desc: '득점 후 SERVE 카운트다운 동안 패들을 미리 이동해두면 유리해요.' },
        ]}
      />

      {gameWinner && (
        <GameOverModal
          title="GAME OVER"
          winnerText={`${gameWinner} 우승`}
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
