import { useEffect, useRef, useState, useCallback } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/usePeer'
import { GameParticipants } from '../../../components/common/GameParticipants'
import { GameOverModal } from '../../../components/common/GameOverModal'

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
const BALL_INITIAL: BallState = {
  x: STAGE_WIDTH / 2,
  y: STAGE_HEIGHT / 2,
  vx: INITIAL_SPEED,
  vy: INITIAL_SPEED,
}

interface BallState { x: number; y: number; vx: number; vy: number }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Canvas paints imperatively — reads CSS custom properties so the palette
 * follows the active [data-theme]. Fallbacks used only if styles are not
 * yet computed (very early paint) so canvas never renders transparent.
 */
const CANVAS_PALETTE_KEYS = {
  paddleLocal: '--accent-primary',
  paddleRemote: '--accent-secondary',
  ball: '--fg-accent',
  net: '--border-soft',
  field: '--bg-surface',
} as const

const CANVAS_PALETTE_FALLBACK: Record<keyof typeof CANVAS_PALETTE_KEYS, string> = {
  paddleLocal: 'lime',
  paddleRemote: 'olive',
  ball: 'yellow',
  net: 'darkgreen',
  field: 'black',
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

  const [scores, setScores] = useState({ host: 0, guest: 0 })
  const [gameWinner, setGameWinner] = useState<string | null>(null)

  const ballRef = useRef<BallState>({ ...BALL_INITIAL })
  const localPaddleX = useRef<number>(PADDLE_INITIAL_X)
  const remotePaddleX = useRef<number>(PADDLE_INITIAL_X)
  const scoresRef = useRef(scores)
  useEffect(() => { scoresRef.current = scores }, [scores])
  const winnerRef = useRef<string | null>(null)
  useEffect(() => { winnerRef.current = gameWinner }, [gameWinner])

  const myName = players.find((p) => p.id === peerId)?.name || '나'
  const opponentName = players.find((p) => p.id !== peerId)?.name || '상대방'

  const applyMatchReset = useCallback(() => {
    setScores({ host: 0, guest: 0 })
    setGameWinner(null)
    ballRef.current = { ...BALL_INITIAL }
    localPaddleX.current = PADDLE_INITIAL_X
    remotePaddleX.current = PADDLE_INITIAL_X
  }, [])

  const handleRestartMatch = useCallback(() => {
    applyMatchReset()
    sendMessage({
      type: 'GAME_RESET',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
  }, [applyMatchReset, peerId, sendMessage])

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
  }, [peerId, isHost, myName, opponentName, applyMatchReset])

  const updatePaddleFromClient = useCallback(
    (clientX: number) => {
      if (winnerRef.current || !canvasRef.current) return
      if (!isOpponentOnline) return
      const rect = canvasRef.current.getBoundingClientRect()
      if (rect.width === 0) return
      const relX = clientX - rect.left
      const ratio = STAGE_WIDTH / rect.width
      const targetX = relX * ratio - PADDLE_WIDTH / 2
      const newX = clamp(targetX, 0, STAGE_WIDTH - PADDLE_WIDTH)
      localPaddleX.current = newX
      sendMessage({
        type: 'GAME_ACTION',
        senderId: peerId,
        timestamp: Date.now(),
        payload: { actionType: 'MOVE_PADDLE', x: newX },
      })
    },
    [isOpponentOnline, peerId, sendMessage],
  )

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return
    updatePaddleFromClient(e.touches[0].clientX)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    updatePaddleFromClient(e.clientX)
  }

  useEffect(() => {
    let animId: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let currentHostScore = scoresRef.current.host
    let currentGuestScore = scoresRef.current.guest
    let localWinnerDeclared = false

    const themePalette = readCanvasPalette(document.documentElement)

    const resetBall = (goingUp: boolean) => {
      const b = ballRef.current
      b.x = STAGE_WIDTH / 2
      b.y = STAGE_HEIGHT / 2
      b.vx = (Math.random() > 0.5 ? 1 : -1) * INITIAL_SPEED
      b.vy = (goingUp ? -1 : 1) * INITIAL_SPEED
    }

    const capSpeed = (v: number) => clamp(v, -MAX_SPEED, MAX_SPEED)

    const gameLoop = () => {
      if (winnerRef.current) return

      if (isHost && !localWinnerDeclared) {
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
        } else if (ball.y > STAGE_HEIGHT) {
          currentGuestScore += 1
          setScores({ host: currentHostScore, guest: currentGuestScore })
          resetBall(true)
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

        sendMessage({
          type: 'GAME_ACTION',
          senderId: peerId,
          timestamp: Date.now(),
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

      animId = requestAnimationFrame(gameLoop)
    }

    animId = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(animId)
  }, [isHost, peerId, sendMessage, maxPoints, myName, opponentName])

  return (
    <div className="game-screen">
      <div className="game-info-header">
        <span className="game-status-label">PINGPONG · 선제 {maxPoints}점</span>
        <span className="game-status-score">
          {isHost
            ? `${myName} ${scores.host} : ${scores.guest} ${opponentName}`
            : `${opponentName} ${scores.host} : ${scores.guest} ${myName}`}
        </span>
      </div>

      <div
        className="pingpong-stage"
        onTouchMove={handleTouchMove}
        onMouseMove={handleMouseMove}
      >
        <canvas
          ref={canvasRef}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          className="pingpong-canvas"
        />
      </div>

      <GameParticipants
        players={players}
        peerId={peerId}
        isOpponentOnline={isOpponentOnline}
      />

      <div className="game-footnote">경기장을 드래그해 패들 조작</div>

      {gameWinner && (
        <GameOverModal
          title="GAME OVER"
          winnerText={`${gameWinner} 우승`}
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
