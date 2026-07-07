import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { GameGuideModal } from '../common/GameGuideModal'

interface MemoryMatchProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
}

// 4×4 = 16 tiles = 8 pairs. Symbols from arcade icon set (glyphs).
const SYMBOLS = ['♥', '★', '◆', '⚡', '☀', '✿', '☯', '☾'] as const
const PAIRS_TOTAL = SYMBOLS.length
const FLIP_BACK_DELAY_MS = 1100
const TILE_COUNT = PAIRS_TOTAL * 2

interface TileState {
  symbol: string;
  revealed: boolean;
  matched: boolean;
}

/**
 * Deterministic shuffle using a seeded LCG so host + guest generate the
 * same board without exchanging every tile position — host broadcasts the
 * seed with GAME_ACTION type=BOARD_SEED at match start.
 */
function shuffleFromSeed(seed: number): string[] {
  const pool = SYMBOLS.flatMap((s) => [s, s]) as string[]
  // Mulberry32
  let a = seed | 0
  for (let i = pool.length - 1; i > 0; i--) {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    const j = Math.floor(r * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

function initialTiles(seed: number): TileState[] {
  return shuffleFromSeed(seed).map((sym) => ({ symbol: sym, revealed: false, matched: false }))
}

export function MemoryMatch({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
}: MemoryMatchProps) {
  // Host generates initial seed on mount; if we're guest we wait for it.
  const [seed, setSeed] = useState<number>(() => (isHost ? (Math.random() * 2 ** 31) | 0 : 0))
  const [tiles, setTiles] = useState<TileState[]>(() => (isHost ? initialTiles(seed) : []))
  const [pickedIndexes, setPickedIndexes] = useState<number[]>([])
  const [turnHostId, setTurnHostId] = useState<string>(() => {
    const host = players.find((p) => p.isHost)
    return host?.id ?? ''
  })
  const [score, setScore] = useState<{ host: number; guest: number }>({ host: 0, guest: 0 })
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  const flipBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (flipBackTimer.current) clearTimeout(flipBackTimer.current) }, [])

  const myPlayerId = peerId
  const opponent = players.find((p) => p.id !== peerId)
  const me = players.find((p) => p.id === peerId)
  const isMyTurn = turnHostId === myPlayerId && isOpponentOnline && !gameWinner
  const myName = me?.name ?? '나'
  const opponentName = opponent?.name ?? '상대방'

  // Broadcast seed once for hosts (guest needs it to render).
  const seedBroadcastRef = useRef(false)
  useEffect(() => {
    if (!isHost || seedBroadcastRef.current) return
    if (!isOpponentOnline) return
    seedBroadcastRef.current = true
    // Burst-broadcast: same race guard as Mosun — guest listener may
    // attach after host's initial send. setSeed on the guest is
    // idempotent for same value.
    const payload = { actionType: 'BOARD_SEED', hostScore: seed, guestScore: 0 }
    const send = () => sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(), payload,
    })
    send()
    const t1 = setTimeout(send, 500)
    const t2 = setTimeout(send, 1400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [isHost, isOpponentOnline, peerId, seed, sendMessage])

  const applyMatchReset = useCallback(() => {
    if (flipBackTimer.current) clearTimeout(flipBackTimer.current)
    const nextSeed = isHost ? ((Math.random() * 2 ** 31) | 0) : seed
    setSeed(nextSeed)
    setTiles(nextSeed === 0 && !isHost ? [] : initialTiles(nextSeed))
    setPickedIndexes([])
    const host = players.find((p) => p.isHost)
    setTurnHostId(host?.id ?? '')
    setScore({ host: 0, guest: 0 })
    setGameWinner(null)
    seedBroadcastRef.current = false
  }, [isHost, seed, players])

  const handleRestartMatch = useCallback(() => {
    applyMatchReset()
    sendMessage({
      type: 'GAME_RESET', senderId: peerId, timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
  }, [applyMatchReset, peerId, sendMessage])

  const applyReveal = useCallback((idx: number, byPlayerId: string) => {
    setTiles((prev) => {
      if (prev[idx]?.matched || prev[idx]?.revealed) return prev
      const next = prev.slice()
      next[idx] = { ...next[idx], revealed: true }
      return next
    })
    setPickedIndexes((prev) => {
      if (prev.length >= 2) return prev
      const next = [...prev, idx]
      if (next.length === 2) {
        // Evaluate after the reveal renders
        setTimeout(() => resolveTwoPicks(next[0], next[1], byPlayerId), 50)
      }
      return next
    })
  }, [/* resolveTwoPicks referenced below via ref */])

  const resolveTwoPicks = useCallback((a: number, b: number, byPlayerId: string) => {
    const t = tilesRef.current
    if (!t[a] || !t[b]) return
    const isMatch = t[a].symbol === t[b].symbol
    if (isMatch) {
      setTiles((prev) => {
        const next = prev.slice()
        next[a] = { ...next[a], matched: true }
        next[b] = { ...next[b], matched: true }
        return next
      })
      const hostP = players.find((p) => p.isHost)
      const isHostWinner = hostP?.id === byPlayerId
      setScore((prev) => ({
        host: prev.host + (isHostWinner ? 1 : 0),
        guest: prev.guest + (isHostWinner ? 0 : 1),
      }))
      setPickedIndexes([])
      // Same player goes again — turn stays.
      // Check win condition
      setTimeout(() => {
        const allMatched = tilesRef.current.every((x) => x.matched)
        if (allMatched) {
          const s = scoreRef.current
          if (s.host > s.guest) setGameWinner(hostP ? hostP.name : '방장')
          else if (s.guest > s.host) {
            const guestP = players.find((p) => !p.isHost)
            setGameWinner(guestP ? guestP.name : '참가자')
          } else setGameWinner('무승부')
        }
      }, 60)
    } else {
      // Not a match — flip back after delay, hand turn to other side
      flipBackTimer.current = setTimeout(() => {
        setTiles((prev) => {
          const next = prev.slice()
          if (next[a]) next[a] = { ...next[a], revealed: false }
          if (next[b]) next[b] = { ...next[b], revealed: false }
          return next
        })
        setPickedIndexes([])
        setTurnHostId((cur) => {
          const other = players.find((p) => p.id !== cur)
          return other?.id ?? cur
        })
      }, FLIP_BACK_DELAY_MS)
    }
  }, [players])

  const tilesRef = useRef(tiles)
  useEffect(() => { tilesRef.current = tiles }, [tiles])
  const scoreRef = useRef(score)
  useEffect(() => { scoreRef.current = score }, [score])

  useEffect(() => {
    const handleP2PEvent = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      // NOTE: no self-filter — dispatchInbound only fires for RECEIVED messages;
      // peerId (roomId) is identical on both sides so the old senderId===peerId
      // check was actually dropping every remote GAME_ACTION.
      if (msg.type === 'GAME_ACTION') {
        const { actionType, cellIdx, hostScore } = msg.payload
        if (actionType === 'BOARD_SEED' && typeof hostScore === 'number') {
          setSeed(hostScore)
          setTiles(initialTiles(hostScore))
        } else if (actionType === 'FLIP' && typeof cellIdx === 'number') {
          applyReveal(cellIdx, msg.senderId)
        }
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', handleP2PEvent)
    return () => window.removeEventListener('p2p_message', handleP2PEvent)
  }, [peerId, applyReveal, applyMatchReset])

  const handleTileClick = (idx: number) => {
    if (!isMyTurn) return
    if (tiles[idx]?.matched || tiles[idx]?.revealed) return
    if (pickedIndexes.length >= 2) return
    applyReveal(idx, myPlayerId)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'FLIP', cellIdx: idx },
    })
  }

  const turnText = gameWinner
    ? '매치 종료'
    : !isOpponentOnline
      ? '상대 연결 대기'
      : isMyTurn
        ? '내 턴 · 2장 뒤집기'
        : `${opponentName} 턴`

  const scoreConn = `${isHost ? score.host : score.guest} : ${isHost ? score.guest : score.host}`

  const scoreLabel = (n: number) => `${n}쌍`
  const boardReady = tiles.length === TILE_COUNT

  return (
    <div className="game-screen">
      <GameHeader
        code="PAIR MATCH"
        playerCount={2}
        ruleTag={`${PAIRS_TOTAL}쌍`}
        onHelp={() => setGuideOpen(true)}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={isOpponentOnline ? `연결됨 · ${scoreConn}` : '재연결 중…'}
        variant={isMyTurn ? 'default' : 'idle'}
      />

      <div className="game-board-region">
        <div className="memory-board">
          {boardReady
            ? tiles.map((tile, idx) => {
                const disabled = !isMyTurn || tile.matched || tile.revealed || pickedIndexes.length >= 2
                const cls = [
                  'memory-tile',
                  tile.revealed || tile.matched ? 'memory-tile--face' : 'memory-tile--back',
                  tile.matched ? 'memory-tile--matched' : '',
                  disabled ? 'memory-tile--disabled' : '',
                ].filter(Boolean).join(' ')
                return (
                  <div key={idx} className={cls} onClick={() => handleTileClick(idx)}>
                    {tile.revealed || tile.matched ? tile.symbol : '?'}
                  </div>
                )
              })
            : <div className="memory-board-loading">보드 동기화 중…</div>}
        </div>
      </div>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.id === turnHostId,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{scoreLabel(p.isHost ? score.host : score.guest)}</span>,
        }))}
        hint="맞추면 한 번 더! 많이 가진 쪽 승리"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />

      <GameGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="메모리 매치 가이드"
        steps={[
          { title: '목표', desc: `${PAIRS_TOTAL}쌍 중 많이 맞춘 쪽 승리` },
          { title: '규칙', desc: '내 턴에 카드 2장 뒤집기. 같으면 획득 + 한 번 더. 다르면 상대 턴.' },
          { title: '팁', desc: '상대가 뒤집은 카드를 기억해 두면 유리해요.' },
        ]}
      />

      {gameWinner && (
        <GameOverModal
          title="GAME OVER"
          winnerText={`${gameWinner} 우승`}
          scoreSummary={[
            { label: myName, value: isHost ? score.host : score.guest, highlight: (isHost ? score.host : score.guest) > (isHost ? score.guest : score.host) },
            { label: opponentName, value: isHost ? score.guest : score.host, highlight: (isHost ? score.guest : score.host) > (isHost ? score.host : score.guest) },
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
