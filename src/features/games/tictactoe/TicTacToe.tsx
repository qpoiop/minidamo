import { useState, useEffect, useCallback, useRef } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameParticipants } from '../../../components/common/GameParticipants'
import { GameOverModal } from '../../../components/common/GameOverModal'

interface TicTacToeProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  maxRounds: number;
  isOpponentOnline?: boolean;
}

type CellValue = 'O' | 'X' | null
type RoundResult = 'O' | 'X' | 'TIE'

const WINNING_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const

const ROUND_END_DELAY_MS = 1800

function initialBoard(): CellValue[] {
  return Array<CellValue>(9).fill(null)
}

function checkResult(board: CellValue[]): RoundResult | null {
  for (const [a, b, c] of WINNING_LINES) {
    const v = board[a]
    if (v && v === board[b] && v === board[c]) return v
  }
  return board.every((v) => v !== null) ? 'TIE' : null
}

export function TicTacToe({
  players,
  peerId,
  isHost,
  sendMessage,
  onLobby,
  onChooseOther,
  onExit,
  maxRounds,
  isOpponentOnline = true,
}: TicTacToeProps) {
  const [board, setBoard] = useState<CellValue[]>(initialBoard)
  const [currentTurnSymbol, setCurrentTurnSymbol] = useState<CellValue>('O')
  const [score, setScore] = useState<{ host: number; guest: number; ties: number }>({ host: 0, guest: 0, ties: 0 })
  const [currentRound, setCurrentRound] = useState<number>(1)
  const [roundWinnerMsg, setRoundWinnerMsg] = useState<string | null>(null)
  const [gameWinner, setGameWinner] = useState<string | null>(null)

  const mySymbol: CellValue = isHost ? 'O' : 'X'
  const isMyTurn = currentTurnSymbol === mySymbol

  const myName = players.find((p) => p.id === peerId)?.name || '나'
  const opponentName = players.find((p) => p.id !== peerId)?.name || '상대방'
  const activePlayerId = players.find((p) => (p.isHost ? 'O' : 'X') === currentTurnSymbol)?.id

  const boardRef = useRef(board)
  useEffect(() => { boardRef.current = board }, [board])
  const scoreRef = useRef(score)
  useEffect(() => { scoreRef.current = score }, [score])
  const currentRoundRef = useRef(currentRound)
  useEffect(() => { currentRoundRef.current = currentRound }, [currentRound])
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current)
    }
  }, [])

  const resetRound = useCallback(() => {
    setBoard(initialBoard())
    setCurrentTurnSymbol('O')
    setRoundWinnerMsg(null)
  }, [])

  const applyMatchReset = useCallback(() => {
    if (endTimerRef.current) clearTimeout(endTimerRef.current)
    setScore({ host: 0, guest: 0, ties: 0 })
    setCurrentRound(1)
    setGameWinner(null)
    setBoard(initialBoard())
    setCurrentTurnSymbol('O')
    setRoundWinnerMsg(null)
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

  const finalizeRound = useCallback(
    (result: RoundResult, boardAfterMove: CellValue[]) => {
      const prev = scoreRef.current
      let winHost = prev.host
      let winGuest = prev.guest
      let ties = prev.ties
      let msg = ''

      if (result === 'O') {
        winHost += 1
        msg = isHost ? `${myName} 승리` : `${opponentName} 승리`
      } else if (result === 'X') {
        winGuest += 1
        msg = !isHost ? `${myName} 승리` : `${opponentName} 승리`
      } else {
        ties += 1
        msg = '비겼어요'
      }
      setScore({ host: winHost, guest: winGuest, ties })
      setRoundWinnerMsg(msg)

      const requiredWins = Math.ceil(maxRounds / 2)
      const isMaxRoundsReached = currentRoundRef.current >= maxRounds

      const scheduleNext = () => {
        endTimerRef.current = null
        let winner: string | null = null
        if (winHost >= requiredWins) {
          winner = isHost ? `${myName} 우승` : `${opponentName} 우승`
        } else if (winGuest >= requiredWins) {
          winner = !isHost ? `${myName} 우승` : `${opponentName} 우승`
        } else if (isMaxRoundsReached) {
          if (winHost > winGuest) {
            winner = isHost ? `${myName} 우승` : `${opponentName} 우승`
          } else if (winGuest > winHost) {
            winner = !isHost ? `${myName} 우승` : `${opponentName} 우승`
          } else {
            winner = '최종 무승부'
          }
        }
        if (winner) {
          setGameWinner(winner)
        } else {
          setCurrentRound((prev2) => prev2 + 1)
          resetRound()
        }
      }
      endTimerRef.current = setTimeout(scheduleNext, ROUND_END_DELAY_MS)

      void boardAfterMove
    },
    [isHost, maxRounds, myName, opponentName, resetRound],
  )

  useEffect(() => {
    const handleP2PEvent = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.senderId === peerId) return

      if (msg.type === 'GAME_ACTION') {
        const { cellIdx, symbol } = msg.payload
        if (typeof cellIdx !== 'number' || cellIdx < 0 || cellIdx > 8) return
        if (symbol !== 'O' && symbol !== 'X') return
        if (boardRef.current[cellIdx] !== null) return
        if (gameWinner || roundWinnerMsg) return

        const next = [...boardRef.current]
        next[cellIdx] = symbol
        setBoard(next)
        setCurrentTurnSymbol(symbol === 'O' ? 'X' : 'O')

        const result = checkResult(next)
        if (result) finalizeRound(result, next)
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }

    window.addEventListener('p2p_message', handleP2PEvent)
    return () => window.removeEventListener('p2p_message', handleP2PEvent)
  }, [peerId, gameWinner, roundWinnerMsg, finalizeRound, applyMatchReset])

  const handleCellClick = (idx: number) => {
    if (board[idx] !== null || !isMyTurn || gameWinner || roundWinnerMsg) return
    if (!isOpponentOnline) return

    const next = [...board]
    next[idx] = mySymbol
    setBoard(next)
    setCurrentTurnSymbol(mySymbol === 'O' ? 'X' : 'O')

    sendMessage({
      type: 'GAME_ACTION',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { cellIdx: idx, symbol: mySymbol },
    })

    const result = checkResult(next)
    if (result) finalizeRound(result, next)
  }

  const scoreText = isHost
    ? `${myName}(O) ${score.host} : ${score.guest} ${opponentName}(X)`
    : `${opponentName}(O) ${score.host} : ${score.guest} ${myName}(X)`

  return (
    <div className="game-screen">
      <div className="game-info-header">
        <span className="game-status-label">TICTACTOE {currentRound}/{maxRounds}</span>
        <span className="game-status-score">
          {scoreText}
          {score.ties > 0 && ` · 무 ${score.ties}`}
        </span>
      </div>

      <div className="game-board-region">
        {roundWinnerMsg && <div className="round-msg">{roundWinnerMsg}</div>}

        <div className="tictactoe-board">
          {board.map((cell, idx) => {
            const disabled = cell !== null || !isMyTurn || gameWinner !== null || roundWinnerMsg !== null || !isOpponentOnline
            const cellClass = [
              'tictactoe-cell',
              cell === 'O' ? 'cell-o' : cell === 'X' ? 'cell-x' : '',
              disabled ? 'tictactoe-cell--disabled' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div key={idx} className={cellClass} onClick={() => handleCellClick(idx)}>
                {cell ?? ''}
              </div>
            )
          })}
        </div>
      </div>

      <GameParticipants
        players={players}
        peerId={peerId}
        activePlayerId={activePlayerId}
        isOpponentOnline={isOpponentOnline}
        renderExtra={(player) => (
          <span className={`participant-symbol ${(player.isHost ? 'O' : 'X') === 'O' ? 'sym-o' : 'sym-x'}`}>
            {player.isHost ? 'O' : 'X'}
          </span>
        )}
      />

      <div className="game-footnote">같은 기호 3칸을 완성하세요</div>

      {gameWinner && (
        <GameOverModal
          title="GAME OVER"
          winnerText={gameWinner}
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
