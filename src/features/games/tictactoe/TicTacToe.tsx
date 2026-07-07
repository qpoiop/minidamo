import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { GameGuideModal } from '../common/GameGuideModal'
import { useEffectsFire } from '../../../effects/EffectsProvider'
import { RoundBanner } from '../../../components/common/RoundBanner'

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

const ROUND_END_DELAY_MS = 900

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
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  maxRounds, isOpponentOnline = true,
}: TicTacToeProps) {
  const [board, setBoard] = useState<CellValue[]>(initialBoard)
  const [currentTurnSymbol, setCurrentTurnSymbol] = useState<'O' | 'X'>('O')
  const [score, setScore] = useState<{ host: number; guest: number; ties: number }>({ host: 0, guest: 0, ties: 0 })
  const [currentRound, setCurrentRound] = useState<number>(1)
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const fire = useEffectsFire()
  const boardElRef = useRef<HTMLDivElement | null>(null)
  const [showBanner, setShowBanner] = useState<{ round: number; winner: string | null } | null>(null)

  const mySymbol: CellValue = isHost ? 'O' : 'X'
  const opponentSymbol: CellValue = isHost ? 'X' : 'O'
  const isMyTurn = currentTurnSymbol === mySymbol && isOpponentOnline && !roundResult && !gameWinner

  const myName = players.find((p) => p.id === peerId)?.name || '나'
  const opponentName = players.find((p) => p.id !== peerId)?.name || '상대방'

  const boardRef = useRef(board)
  useEffect(() => { boardRef.current = board }, [board])
  const scoreRef = useRef(score)
  useEffect(() => { scoreRef.current = score }, [score])
  const currentRoundRef = useRef(currentRound)
  useEffect(() => { currentRoundRef.current = currentRound }, [currentRound])
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (endTimerRef.current) clearTimeout(endTimerRef.current) }
  }, [])

  // Track who starts the next round. Loser of the previous round starts;
  // on a tie we alternate. Match-start defaults to 'O' (host).
  const nextStarterRef = useRef<'O' | 'X'>('O')

  const resetRound = useCallback(() => {
    setBoard(initialBoard())
    setCurrentTurnSymbol(nextStarterRef.current)
    setRoundResult(null)
  }, [])

  const applyMatchReset = useCallback(() => {
    if (endTimerRef.current) clearTimeout(endTimerRef.current)
    nextStarterRef.current = 'O'
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
      type: 'GAME_RESET', senderId: peerId, timestamp: Date.now(),
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
      // Loser starts next round; tie flips starter. Committed here so
      // both peers derive the same value (finalizeRound runs on both).
      if (result.symbol === 'O') nextStarterRef.current = 'X'
      else if (result.symbol === 'X') nextStarterRef.current = 'O'
      else nextStarterRef.current = nextStarterRef.current === 'O' ? 'X' : 'O'
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
          else winner = null
        }
        if (winner !== null && (winHost >= requiredWins || winGuest >= requiredWins || isMaxRoundsReached)) {
          setGameWinner(winner)
        } else if (isMaxRoundsReached && winHost === winGuest) {
          setGameWinner('최종 무승부')
        } else {
          const nextRound = currentRoundRef.current + 1
          // Announce the next round with a shared banner. The banner
          // dismisses itself after 1.4s and then we advance state.
          const prevWinnerName = result.symbol === 'TIE'
            ? null
            : (result.symbol === 'O' ? (isHost ? myName : opponentName) : (!isHost ? myName : opponentName))
          setShowBanner({ round: nextRound, winner: prevWinnerName })
        }
      }
      endTimerRef.current = setTimeout(scheduleNext, ROUND_END_DELAY_MS)
    },
    [isHost, maxRounds, myName, opponentName, resetRound],
  )

  useEffect(() => {
    const handleP2PEvent = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      // NOTE: no self-filter — dispatchInbound only fires for RECEIVED messages;
      // peerId (roomId) is identical on both sides so the old senderId===peerId
      // check was actually dropping every remote GAME_ACTION.
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
        // Mirror the placement burst locally so both peers see the effect.
        const el = boardElRef.current?.querySelectorAll<HTMLElement>('.tictactoe-cell')[cellIdx]
        if (el) {
          const r = el.getBoundingClientRect()
          fire('spark-burst', {
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            count: 14,
            color: symbol === 'O' ? '#c7e06a' : '#0a260a',
          })
        }
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
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { cellIdx: idx, symbol: mySymbol },
    })
    // Pixel-shard spark burst at the placed cell — placement feedback
    // beyond just the scale-in keyframe.
    const el = boardElRef.current?.querySelectorAll<HTMLElement>('.tictactoe-cell')[idx]
    if (el) {
      const r = el.getBoundingClientRect()
      fire('spark-burst', {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        count: 14,
        color: mySymbol === 'O' ? '#c7e06a' : '#0a260a',
      })
    }
    const result = checkResult(next)
    if (result) finalizeRound(result)
  }

  const winningLine: ReadonlySet<number> = useMemo(() => {
    if (!roundResult || roundResult.symbol === 'TIE') return new Set()
    return new Set(roundResult.line)
  }, [roundResult])

  // When a round ends with a win, sweep a metallic line across the 3
  // winning cells. Sample cell centres from the DOM so the effect always
  // matches the current board layout.
  useEffect(() => {
    if (!roundResult || roundResult.symbol === 'TIE') return
    const root = boardElRef.current
    if (!root) return
    const cells = root.querySelectorAll<HTMLElement>('.tictactoe-cell')
    const pts = roundResult.line.map((idx) => {
      const el = cells[idx]
      if (!el) return { x: 0, y: 0 }
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    fire('metallic-line', { targetPoints: pts, color: '#c7e06a' })
    fire('spark-burst', { x: pts[1].x, y: pts[1].y, count: 24 })
  }, [roundResult, fire])

  const turnText = gameWinner
    ? '매치 종료'
    : roundResult
      ? '다음 라운드 준비 중…'
      : !isOpponentOnline
        ? '상대 연결 대기'
        : isMyTurn
          ? `내 턴 · ${mySymbol}`
          : `상대 턴 · ${opponentSymbol}`

  const scoreConn = `${isHost ? score.host : score.guest} : ${isHost ? score.guest : score.host}`

  return (
    <div className="game-screen">
      <GameHeader
        code="TICTACTOE"
        playerCount={2}
        ruleTag={`${maxRounds}판 ${Math.ceil(maxRounds / 2)}선승`}
        onHelp={() => setGuideOpen(true)}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={isOpponentOnline ? `연결됨 · ${scoreConn}` : '재연결 중…'}
        variant={isMyTurn ? 'default' : 'idle'}
      />

      <div className="game-board-region">
        {/* Round result banner is now the shared RoundBanner overlay below. */}
        <div className="tictactoe-board" ref={boardElRef}>
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

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: (p.isHost ? 'O' : 'X') === currentTurnSymbol,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{p.isHost ? 'O' : 'X'}</span>,
        }))}
        hint="같은 기호 3칸을 완성하세요"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />

      <GameGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="틱택토 가이드"
        steps={[
          { title: '목표', desc: '3×3 칸 중 같은 기호 3칸을 가로/세로/대각선으로 완성' },
          { title: '규칙', desc: `${maxRounds}판 ${Math.ceil(maxRounds / 2)}선승. 무승부는 다음 라운드로.` },
          { title: '조작', desc: '내 턴에 빈 칸을 탭하면 기호가 놓여요.' },
        ]}
      />

      {showBanner && (
        <RoundBanner
          round={showBanner.round}
          totalRounds={maxRounds}
          previousWinnerName={showBanner.winner}
          onDismiss={() => {
            setShowBanner(null)
            setCurrentRound((n) => n + 1)
            resetRound()
          }}
        />
      )}

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
