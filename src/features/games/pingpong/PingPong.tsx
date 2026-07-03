import { useEffect, useRef, useState, useCallback } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/usePeer'

interface PingPongProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  maxPoints: number; // 몇 점 승리제 (예: 5점)
}

export function PingPong({
  players,
  peerId,
  isHost,
  sendMessage,
  onLobby,
  onChooseOther,
  onExit,
  maxPoints
}: PingPongProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  
  // 가상 스테이지 해상도 (300 x 500 세로형 모델)
  const STAGE_WIDTH = 300
  const STAGE_HEIGHT = 500
  const PADDLE_WIDTH = 70
  const PADDLE_HEIGHT = 10
  const BALL_RADIUS = 7

  // 게임 상태 (로컬 상태)
  const [scores, setScores] = useState({ host: 0, guest: 0 })
  const [gameWinner, setGameWinner] = useState<string | null>(null)

  // 동적 좌표용 Ref (렌더 딜레이 없는 연산 위해 Ref 사용)
  const ballRef = useRef({ x: 150, y: 250, vx: 3, vy: 3 })
  const localPaddleX = useRef(115) // 내 패들 중앙 위치
  const remotePaddleX = useRef(115) // 상대 패들 중앙 위치

  // 플레이어 정보
  const myName = players.find((p) => p.id === peerId)?.name || '나'
  const opponentName = players.find((p) => p.id !== peerId)?.name || '상대방'

  // 매치 전체 리셋
  const handleRestartMatch = useCallback(() => {
    setScores({ host: 0, guest: 0 })
    setGameWinner(null)
    ballRef.current = { x: 150, y: 250, vx: 3, vy: 3 }
    localPaddleX.current = 115
    remotePaddleX.current = 115

    sendMessage({
      type: 'GAME_RESET',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { action: 'RESTART' }
    })
  }, [peerId, sendMessage])

  // P2P 메시지 수신 처리
  useEffect(() => {
    const handleP2PEvent = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (msg.senderId === peerId) return

      if (msg.type === 'GAME_ACTION') {
        const { actionType, x, ballX, ballY, hostScore, guestScore, winner } = msg.payload

        if (actionType === 'MOVE_PADDLE') {
          // 상대방 패들 X 좌표 갱신 (대칭이므로 뒤집어 줌)
          remotePaddleX.current = STAGE_WIDTH - x - PADDLE_WIDTH
        } else if (actionType === 'BALL_SYNC' && !isHost) {
          // 게스트인 경우 호스트가 연산한 공 위치 동기화 (좌표계 대칭 역전)
          ballRef.current.x = STAGE_WIDTH - ballX
          ballRef.current.y = STAGE_HEIGHT - ballY
          setScores({ host: hostScore, guest: guestScore })
          if (winner) {
            setGameWinner(winner === 'HOST' ? opponentName : myName)
          }
        }
      } else if (msg.type === 'GAME_RESET') {
        if (msg.payload?.action === 'RESTART') {
          setScores({ host: 0, guest: 0 })
          setGameWinner(null)
          ballRef.current = { x: 150, y: 250, vx: 3, vy: 3 }
          localPaddleX.current = 115
          remotePaddleX.current = 115
        }
      }
    }

    window.addEventListener('p2p_message', handleP2PEvent)
    return () => window.removeEventListener('p2p_message', handleP2PEvent)
  }, [peerId, isHost, opponentName, myName])

  // 모바일 드래그/마우스 스와이프 터치 이벤트 연동
  const handleTouchMove = (e: React.TouchEvent) => {
    if (gameWinner || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const touchX = e.touches[0].clientX - rect.left
    
    // 캔버스 크기 대비 가상 300px 비율 변환
    const ratio = STAGE_WIDTH / rect.width
    const x = touchX * ratio - PADDLE_WIDTH / 2
    
    // 경계 처리
    const newX = Math.max(0, Math.min(STAGE_WIDTH - PADDLE_WIDTH, x))
    localPaddleX.current = newX

    // 패들 위치 상대방에게 P2P 전송
    sendMessage({
      type: 'GAME_ACTION',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { actionType: 'MOVE_PADDLE', x: newX }
    })
  }

  // 마우스 이동 핸들러 (PC 테스트 지원)
  const handleMouseMove = (e: React.MouseEvent) => {
    if (gameWinner || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const ratio = STAGE_WIDTH / rect.width
    const x = mouseX * ratio - PADDLE_WIDTH / 2
    const newX = Math.max(0, Math.min(STAGE_WIDTH - PADDLE_WIDTH, x))
    localPaddleX.current = newX

    sendMessage({
      type: 'GAME_ACTION',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { actionType: 'MOVE_PADDLE', x: newX }
    })
  }

  // 물리 엔진 루프 및 Canvas 그리기 (호스트가 물리 권한 독점)
  useEffect(() => {
    let animId: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let currentHostScore = scores.host
    let currentGuestScore = scores.guest
    let finished = false

    const gameLoop = () => {
      if (gameWinner) return

      // --- 1. 물리 엔진 연산 (호스트만 수행) ---
      if (isHost && !finished) {
        const ball = ballRef.current
        ball.x += ball.vx
        ball.y += ball.vy

        // 벽 튕기기 (좌우)
        if (ball.x - BALL_RADIUS <= 0) {
          ball.x = BALL_RADIUS
          ball.vx *= -1
        } else if (ball.x + BALL_RADIUS >= STAGE_WIDTH) {
          ball.x = STAGE_WIDTH - BALL_RADIUS
          ball.vx *= -1
        }

        // 패들 충돌 연산 (상단 - 게스트 패들)
        if (
          ball.y - BALL_RADIUS <= PADDLE_HEIGHT + 12 &&
          ball.x >= remotePaddleX.current &&
          ball.x <= remotePaddleX.current + PADDLE_WIDTH &&
          ball.vy < 0
        ) {
          ball.vy *= -1.05 // 서서히 속도 증가
          ball.y = PADDLE_HEIGHT + 12 + BALL_RADIUS
        }

        // 패들 충돌 연산 (하단 - 내 패들)
        if (
          ball.y + BALL_RADIUS >= STAGE_HEIGHT - PADDLE_HEIGHT - 12 &&
          ball.x >= localPaddleX.current &&
          ball.x <= localPaddleX.current + PADDLE_WIDTH &&
          ball.vy > 0
        ) {
          ball.vy *= -1.05
          ball.y = STAGE_HEIGHT - PADDLE_HEIGHT - 12 - BALL_RADIUS
        }

        // 골인 판정 (상단 아웃 -> 호스트 득점)
        if (ball.y < 0) {
          currentHostScore++
          setScores({ host: currentHostScore, guest: currentGuestScore })
          ball.x = 150
          ball.y = 250
          ball.vx = (Math.random() > 0.5 ? 1 : -1) * 3
          ball.vy = 3
        }

        // 골인 판정 (하단 아웃 -> 게스트 득점)
        if (ball.y > STAGE_HEIGHT) {
          currentGuestScore++
          setScores({ host: currentHostScore, guest: currentGuestScore })
          ball.x = 150
          ball.y = 250
          ball.vx = (Math.random() > 0.5 ? 1 : -1) * 3
          ball.vy = -3
        }

        // 우승 완료 검증
        let matchWinner: string | null = null
        if (currentHostScore >= maxPoints) {
          matchWinner = 'HOST'
          finished = true
          setGameWinner(myName)
        } else if (currentGuestScore >= maxPoints) {
          matchWinner = 'GUEST'
          finished = true
          setGameWinner(opponentName)
        }

        // 게스트로 공 좌표 및 스코어 패킷 실시간 브로드캐스트
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
            winner: matchWinner
          }
        })
      }

      // --- 2. Canvas 렌더링 그리기 (공통) ---
      ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)

      // 중앙 네트선
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, STAGE_HEIGHT / 2)
      ctx.lineTo(STAGE_WIDTH, STAGE_HEIGHT / 2)
      ctx.stroke()
      ctx.setLineDash([])

      // 내 패들 그리기 (하단)
      const gradLocal = ctx.createLinearGradient(localPaddleX.current, 0, localPaddleX.current + PADDLE_WIDTH, 0)
      gradLocal.addColorStop(0, '#6366f1')
      gradLocal.addColorStop(1, '#818cf8')
      ctx.fillStyle = gradLocal
      ctx.shadowColor = 'rgba(99, 102, 241, 0.4)'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.roundRect(localPaddleX.current, STAGE_HEIGHT - PADDLE_HEIGHT - 12, PADDLE_WIDTH, PADDLE_HEIGHT, 5)
      ctx.fill()

      // 상대방 패들 그리기 (상단)
      const gradRemote = ctx.createLinearGradient(remotePaddleX.current, 0, remotePaddleX.current + PADDLE_WIDTH, 0)
      gradRemote.addColorStop(0, '#a855f7')
      gradRemote.addColorStop(1, '#c084fc')
      ctx.fillStyle = gradRemote
      ctx.shadowColor = 'rgba(168, 85, 247, 0.4)'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.roundRect(remotePaddleX.current, 12, PADDLE_WIDTH, PADDLE_HEIGHT, 5)
      ctx.fill()

      // 공 그리기
      ctx.fillStyle = '#f43f5e'
      ctx.shadowColor = 'rgba(244, 63, 94, 0.6)'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(ballRef.current.x, ballRef.current.y, BALL_RADIUS, 0, Math.PI * 2)
      ctx.fill()

      ctx.shadowBlur = 0 // 그림자 리셋

      animId = requestAnimationFrame(gameLoop)
    }

    animId = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(animId)
  }, [isHost, peerId, sendMessage, scores, maxPoints, gameWinner, myName, opponentName])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', justifyContent: 'space-between', height: '100%' }}>
      {/* 스코어보드 */}
      <div className="game-info-header">
        <span style={{ fontFamily: 'var(--font-title)', fontWeight: 600 }}>미니 탁구 (선제 {maxPoints}점승)</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {isHost ? `${myName} ${scores.host} : ${scores.guest} ${opponentName}` : `${opponentName} ${scores.host} : ${scores.guest} ${myName}`}
        </span>
      </div>

      {/* 게임 경기장 */}
      <div
        className="pingpong-stage"
        onTouchMove={handleTouchMove}
        onMouseMove={handleMouseMove}
      >
        <canvas
          ref={canvasRef}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>

      <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        경기장을 터치 드래그하여 패들을 조작하세요.
      </div>

      {/* 최종 게임 오버 매치 결과 */}
      {gameWinner && (
        <div className="gameover-overlay">
          <div className="gameover-card">
            <span style={{ fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--primary)', fontWeight: 600 }}>MATCH OVER</span>
            <div style={{ fontFamily: 'var(--font-title)', fontSize: '1.6rem', fontWeight: 700, margin: '0.6rem 0 1.2rem 0', color: 'white' }}>
              {gameWinner} 최종 우승!
            </div>
            
            <div className="modal-action-list">
              <button className="btn-primary" onClick={handleRestartMatch}>
                다시하기 (Restart)
              </button>
              <button className="btn-secondary" onClick={onLobby}>
                대기방으로 (Lobby)
              </button>
              <button className="btn-secondary" onClick={onChooseOther}>
                다른 게임 선택하기
              </button>
              <button className="btn-danger" onClick={onExit}>
                나가기 (Exit)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
