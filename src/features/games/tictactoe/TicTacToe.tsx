import { useState, useEffect, useCallback } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/usePeer'

interface TicTacToeProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  maxRounds: number;
}

export function TicTacToe({
  players,
  peerId,
  isHost,
  sendMessage,
  onLobby,
  onChooseOther,
  onExit,
  maxRounds
}: TicTacToeProps) {
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null))
  const [currentTurnSymbol, setCurrentTurnSymbol] = useState<string>('O') // O가 선공
  const [score, setScore] = useState<{ host: number; guest: number; ties: number }>({ host: 0, guest: 0, ties: 0 })
  const [currentRound, setCurrentRound] = useState<number>(1)
  const [roundWinnerMsg, setRoundWinnerMsg] = useState<string | null>(null)
  const [gameWinner, setGameWinner] = useState<string | null>(null)

  const mySymbol = isHost ? 'O' : 'X'
  const opponentSymbol = isHost ? 'X' : 'O'
  const isMyTurn = currentTurnSymbol === mySymbol

  // 상대방 이름 조회
  const myName = players.find((p) => p.id === peerId)?.name || '나'
  const opponentName = players.find((p) => p.id !== peerId)?.name || '상대방'

  // 승리 조건 검사
  const checkWin = useCallback((b: (string | null)[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // 가로
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // 세로
      [0, 4, 8], [2, 4, 6]             // 대각선
    ]
    for (const [a, bIndex, c] of lines) {
      if (b[a] && b[a] === b[bIndex] && b[a] === b[c]) {
        return b[a]
      }
    }
    return b.includes(null) ? null : 'TIE'
  }, [])

  // 새로운 라운드 세팅
  const resetRound = useCallback(() => {
    setBoard(Array(9).fill(null))
    setCurrentTurnSymbol('O') // 다음 판도 호스트 선공
    setRoundWinnerMsg(null)
  }, [])

  // 전체 매치 리셋 (다시하기)
  const handleRestartMatch = useCallback(() => {
    setScore({ host: 0, guest: 0, ties: 0 })
    setCurrentRound(1)
    setGameWinner(null)
    resetRound()

    // 상대방에게 다시하기 전송
    sendMessage({
      type: 'GAME_RESET',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { action: 'RESTART' }
    })
  }, [peerId, sendMessage, resetRound])

  // P2P 수신 이벤트 핸들러 연동
  useEffect(() => {
    // 부모 App에서 수신되는 패킷 이벤트를 받기 위해 이벤트 버스 세팅
    const handleP2PEvent = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (msg.senderId === peerId) return // 내가 보낸 건 패스

      if (msg.type === 'GAME_ACTION') {
        const { cellIdx, symbol } = msg.payload
        const newBoard = [...board]
        newBoard[cellIdx] = symbol
        setBoard(newBoard)

        // 턴 전환
        const nextSymbol = symbol === 'O' ? 'X' : 'O'
        setCurrentTurnSymbol(nextSymbol)

        // 승패 검사
        const result = checkWin(newBoard)
        if (result) {
          handleRoundEnd(result)
        }
      } else if (msg.type === 'GAME_RESET') {
        if (msg.payload?.action === 'RESTART') {
          // 상대방이 리스타트 요청 시 상태 초기화
          setScore({ host: 0, guest: 0, ties: 0 })
          setCurrentRound(1)
          setGameWinner(null)
          setBoard(Array(9).fill(null))
          setCurrentTurnSymbol('O')
          setRoundWinnerMsg(null)
        }
      }
    }

    window.addEventListener('p2p_message', handleP2PEvent)
    return () => window.removeEventListener('p2p_message', handleP2PEvent)
  }, [board, checkWin, peerId])

  // 라운드 종료 처리
  const handleRoundEnd = (result: string) => {
    let winHost = score.host
    let winGuest = score.guest
    let ties = score.ties
    let msg = ''

    if (result === 'O') {
      winHost++
      msg = isHost ? `${myName} 승리! 🎉` : `${opponentName} 승리!`
    } else if (result === 'X') {
      winGuest++
      msg = !isHost ? `${myName} 승리! 🎉` : `${opponentName} 승리!`
    } else {
      ties++
      msg = '비겼습니다! 🤝'
    }

    setScore({ host: winHost, guest: winGuest, ties })
    setRoundWinnerMsg(msg)

    // 판수 최종 판단
    const requiredWins = Math.ceil(maxRounds / 2)
    const hostWonMatch = winHost >= requiredWins
    const guestWonMatch = winGuest >= requiredWins
    const isMaxRoundsReached = currentRound >= maxRounds

    setTimeout(() => {
      if (hostWonMatch) {
        setGameWinner(isHost ? '우승 완료! 🏆' : `${opponentName} 최종 우승!`)
      } else if (guestWonMatch) {
        setGameWinner(!isHost ? '우승 완료! 🏆' : `${opponentName} 최종 우승!`)
      } else if (isMaxRoundsReached) {
        // 모든 라운드 종료 시 스코어 비교
        if (winHost > winGuest) {
          setGameWinner(isHost ? '우승 완료! 🏆' : `${opponentName} 최종 우승!`)
        } else if (winGuest > winHost) {
          setGameWinner(!isHost ? '우승 완료! 🏆' : `${opponentName} 최종 우승!`)
        } else {
          setGameWinner('최종 무승부! 🤝')
        }
      } else {
        // 다음 라운드로 이동
        setCurrentRound((prev) => prev + 1)
        resetRound()
      }
    }, 2000)
  }

  // 그리드 셀 터치 시 플레이
  const handleCellClick = (idx: number) => {
    if (board[idx] || !isMyTurn || gameWinner || roundWinnerMsg) return

    const newBoard = [...board]
    newBoard[idx] = mySymbol
    setBoard(newBoard)

    // 턴 전환
    const nextSymbol = mySymbol === 'O' ? 'X' : 'O'
    setCurrentTurnSymbol(nextSymbol)

    // 상대방에게 액션 패킷 전송
    sendMessage({
      type: 'GAME_ACTION',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { cellIdx: idx, symbol: mySymbol }
    })

    // 승패 검사
    const result = checkWin(newBoard)
    if (result) {
      handleRoundEnd(result)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', justifyContent: 'space-between' }}>
      {/* 게임 헤더 스코어보드 */}
      <div className="game-info-header">
        <span style={{ fontFamily: 'var(--font-title)', fontWeight: 600 }}>틱택토 ({currentRound}/{maxRounds}판)</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {isHost ? `${myName}(O) ${score.host} : ${score.guest} ${opponentName}(X)` : `${opponentName}(O) ${score.host} : ${score.guest} ${myName}(X)`}
          {score.ties > 0 && ` (무: ${score.ties})`}
        </span>
      </div>

      {/* 게임판 */}
      <div>
        <div style={{ textAlign: 'center', margin: '0.5rem 0' }}>
          {roundWinnerMsg ? (
            <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '1.1rem' }}>{roundWinnerMsg}</span>
          ) : isMyTurn ? (
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>내 차례입니다! ({mySymbol})</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>상대방 턴 대기 중... ({opponentSymbol})</span>
          )}
        </div>

        <div className="tictactoe-board">
          {board.map((cell, idx) => (
            <div
              key={idx}
              className={`tictactoe-cell ${cell === 'O' ? 'cell-o' : cell === 'X' ? 'cell-x' : ''}`}
              onClick={() => handleCellClick(idx)}
            >
              {cell}
            </div>
          ))}
        </div>
      </div>

      {/* 임시 하단 패널 */}
      <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        같은 줄 3칸을 완성하세요.
      </div>

      {/* 게임 최종 종료 모달 (결과 화면 4대 필수 선택 메뉴) */}
      {gameWinner && (
        <div className="gameover-overlay">
          <div className="gameover-card">
            <span style={{ fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--primary)', fontWeight: 600 }}>MATCH OVER</span>
            <div style={{ fontFamily: 'var(--font-title)', fontSize: '1.6rem', fontWeight: 700, margin: '0.6rem 0 1.2rem 0', color: 'white' }}>
              {gameWinner}
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
