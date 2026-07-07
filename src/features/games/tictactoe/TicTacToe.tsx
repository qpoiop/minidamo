import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameParticipants } from '../../../components/common/GameParticipants'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'

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
type RoundResult = { symbol: 'O' | 'X'; line: readonly [number, number, number] } | { symbol: 'TIE' }

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
  for (const line of WINNING_LINES) {
    const [a, b, c] = line
    const v = board[a]
    if (v && v === board[b] && v === board[c]) return { symbol: v, line }
  }
  return board.every((v) => v !== null) ? { symbol: 'TIE' } : null
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
  const [currentTurnSymbol, setCurrentTurnSymbol] = useState<'O' | 'X'>('O')
  const [score, setScore] = useState<{ host: number; guest: number; ties: number }>({ host: 0, guest: 0, ties: 0 })
  const [currentRound, setCurrentRound] = useState<number>(1)
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [gameWinner, setGameWinner] = useState<string | null>(null)

  const mySymbol: CellValue = isHost ? 'O' : 'X'
  const isMyTurn = currentTurnSymbol === mySymbol && isOpponentOnline && !roundResult && !gameWinner

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
    setRoundResult(null)
  }, [])

  const applyMatchReset = useCallback(() => {
    if (endTimerRef.current) clearTimeout(endTimerRef.current)
    setScore({ host: 0, guest: 0, ties: 0 })
    setCurrentRound(1)
    setGameWinner(null)
    setBoard(initialBoard())
    setCurrentTurnSymbol('O')
    setRoundResult(null)
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
    (result: RoundResult) => {
      const prev = scoreRef.current
      let winHost = prev.host
      let winGuest = prev.guest
      let ties = prev.ties

      if (result.symbol === 'O') winHost += 1
      else if (result.symbol === 'X') winGuest += 1
      else ties += 1

      setScore({ host: winHost, guest: winGuest, ties })
      setRoundResult(result)

      const requiredWins = Math.ceil(maxRounds / 2)
      const isMaxRoundsReached = currentRoundRef.current >= maxRounds

      const scheduleNext = () => {
        endTimerRef.current = null
        let winner: string | null = null
        if (winHost >= requiredWins) winner = isHost ? myName : opponentName
        else if (winGuest >= requiredWins) winner = !isHost ? myName : opponentName
        else if (isMaxRoundsReached) {
          if (winHost > winGuest) winner = isHost ? myName : opponentName
          else if (winGuest > winHost) winner = !isHost ? myName : opponentName
          else winner = null // draw
        }

        if (winner !== null && (winHost >= requiredWins || winGuest >= requiredWins || isMaxRoundsReached)) {
          setGameWinner(winner)
        } else if (isMaxRoundsReached && winHost === winGuest) {
          setGameWinner('최종 무승부')
        } else {
          setCurrentRound((n) => n + 1)
          resetRound()
        }
      }
      endTimerRef.current = setTimeout(scheduleNext, ROUND_END_DELAY_MS)
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
        if (gameWinner || roundResult) return

        const next = [...boardRef.current]
        next[cellIdx] = symbol
        setBoard(next)
        setCurrentTurnSymbol(symbol === 'O' ? 'X' : 'O')

        const result = checkResult(next)
        if (result) finalizeRound(result)
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }

    window.addEventListener('p2p_message', handleP2PEvent)
    return () => window.removeEventListener('p2p_message', handleP2PEvent)
  }, [peerId, gameWinner, roundResult, finalizeRound, applyMatchReset])

  const handleCellClick = (idx: number) => {
    if (board[idx] !== null || !isMyTurn) return

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
    if (result) finalizeRound(result)
  }

  const winningLine: ReadonlySet<number> = useMemo(() => {
    if (!roundResult || roundResult.symbol === 'TIE') return new Set()
    return new Set(roundResult.line)
  }, [roundResult])

  const roundMsg = useMemo(() => {
    if (!roundResult) return null
    if (roundResult.symbol === 'TIE') return '비겼어요'
    const winnerIsHost = roundResult.symbol === 'O'
    const winnerName = winnerIsHost === isHost ? myName : opponentName
    return `${winnerName} 라운드 승리`
  }, [roundResult, isHost, myName, opponentName])

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

      <div className="turn-indicator" data-state={isMyTurn ? 'me' : 'opponent'}>
        {gameWinner
          ? '매치 종료'
          : roundResult
            ? '다음 라운드 준비 중…'
            : !isOpponentOnline
              ? '상대 연결 대기'
              : isMyTurn
                ? `${myName} 차례`
                : `${opponentName} 차례`}
      </div>

      <div className="game-board-region">
        {roundMsg && <div className="round-msg">{roundMsg}</div>}

        <div className="tictactoe-board">
          {board.map((cell, idx) => {
            const inWinLine = winningLine.has(idx)
            const disabled = cell !== null || !isMyTurn
            const cellClass = [
              'tictactoe-cell',
              cell === 'O' ? 'cell-o' : cell === 'X' ? 'cell-x' : '',
              disabled ? 'tictactoe-cell--disabled' : '',
              inWinLine ? 'tictactoe-cell--win' : '',
            ].filter(Boolean).join(' ')
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

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />

      {gameWinner && (
        <GameOverModal
          title="GAME OVER"
          winnerText={gameWinner}
          scoreSummary={[
            { label: `${isHost ? myName : opponentName}(O)`, value: score.host, highlight: score.host > score.guest },
            { label: `${!isHost ? myName : opponentName}(X)`, value: score.guest, highlight: score.guest > score.host },
            ...(score.ties > 0 ? [{ label: '무승부', value: score.ties }] : []),
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
