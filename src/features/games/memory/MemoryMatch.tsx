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
import { useEffectsFire } from '../../../effects/EffectsProvider'
import { PALETTE } from '../../../styles/palette'

interface MemoryMatchProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  reconnecting?: boolean;
  soloMode?: boolean;
  /** 카드 쌍 수 (현재 8 고정) */
  matchOption?: number;
  /** 라운드 수 (1 / 3 / 5) */
  matchOption2?: number;
}

/** 라운드 프리셋. 2-axis 옵션 (카드 쌍 · 라운드) 분리 이후 matchOption
 *  = pairs (8), matchOption2 = rounds (1/3/5) 로 개별 전달. Preset
 *  테이블은 rounds 값을 그대로 키로 사용. */
export const MEMORY_PRESETS: Record<number, { rounds: 1 | 3 | 5; label: string }> = {
  1: { rounds: 1, label: '8쌍 · 단판' },
  3: { rounds: 3, label: '8쌍 · 3라운드 (2선승)' },
  5: { rounds: 5, label: '8쌍 · 5라운드 (3선승)' },
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
  reconnecting = false,
  soloMode = false,
  matchOption = 8,
  matchOption2,
}: MemoryMatchProps) {
  const roundsKey = matchOption2 ?? 1
  const preset = MEMORY_PRESETS[roundsKey] ?? MEMORY_PRESETS[1]
  const winsNeeded = Math.ceil(preset.rounds / 2)
  void matchOption   // pairs · 현재 8 고정
  const [currentRound, setCurrentRound] = useState(1)
  const [roundScores, setRoundScores] = useState<{ host: number; guest: number }>({ host: 0, guest: 0 })
  // Host generates initial seed on mount; guest waits for the peer's
  // BOARD_SEED. In solo/test mode there is no peer, so guest self-seeds
  // deterministically like the host to avoid an eternal "보드 동기화 중…".
  const [seed, setSeed] = useState<number>(() =>
    (isHost || soloMode) ? (Math.random() * 2 ** 31) | 0 : 0,
  )
  const [tiles, setTiles] = useState<TileState[]>(() =>
    (isHost || soloMode) ? initialTiles(seed) : [],
  )
  const [pickedIndexes, setPickedIndexes] = useState<number[]>([])
  // Turn state stored as a role bool. Bug avoided: peerId is the room
  // id on both sides, so `turnHostId === peerId` matched on both peers
  // when turnHostId held the host's player.id — the guest incorrectly
  // thought it was their turn from move 1 until the second event
  // self-corrected. See ARCHITECTURE §3.1.
  const [turnIsHost, setTurnIsHost] = useState<boolean>(true)
  const [score, setScore] = useState<{ host: number; guest: number }>({ host: 0, guest: 0 })
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  // Board reveal preview: show every card face-up for PREVIEW_MS then
  // flip them all down. Starts as soon as the tiles array is populated.
  const [previewActive, setPreviewActive] = useState(false)
  const PREVIEW_MS = 2000

  const flipBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 60ms 라운드 완료 감지 + 1400ms 다음 라운드 예약 timer. unmount 시
  // setState-on-unmounted 방지용 정리 대상.
  const roundOverCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextRoundTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (flipBackTimer.current) clearTimeout(flipBackTimer.current)
    if (roundOverCheckTimer.current) clearTimeout(roundOverCheckTimer.current)
    if (nextRoundTimer.current) clearTimeout(nextRoundTimer.current)
  }, [])

  // Trigger preview any time a full board becomes available (initial +
  // after every match reset). Deterministic on both sides — both peers
  // see the preview at the same time relative to their own board load.
  // Runs in solo/test mode too: TestMode keeps one shared instance across
  // role toggles (the game key excludes myRole), so the tester's role
  // switch no longer remounts and the preview does not spuriously replay
  // — deps (tiles.length, seed) are unchanged by a role toggle.
  useEffect(() => {
    if (tiles.length !== TILE_COUNT) return
    setPreviewActive(true)
    const t = setTimeout(() => setPreviewActive(false), PREVIEW_MS)
    return () => clearTimeout(t)
  }, [tiles.length, seed])

  const { myName, opponentName } = useRoleParticipants(players, isHost)
  // Turn enforced across the board. Solo/test-mode testers switch
  // role via the TestMode toolbar to act as the other side.
  const isMyTurn = turnIsHost === isHost && isOpponentOnline && !gameWinner
  void soloMode

  // Broadcast seed once for hosts (guest needs it to render).
  const seedBroadcastRef = useRef(false)
  // HELLO handshake — guest sends on mount, host responds with seed.
  // No burst; retry once if seed still absent after 1.5s.
  const sendSeed = useCallback(() => {
    if (!isHost) return
    seedBroadcastRef.current = true
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BOARD_SEED', hostScore: seed, guestScore: 0 },
    })
  }, [isHost, peerId, seed, sendMessage])

  useEffect(() => {
    if (isHost) return
    if (!isOpponentOnline) return
    const sendHello = () => sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BOARD_HELLO' },
    })
    sendHello()
    const retry = setTimeout(() => {
      if (tilesRef.current.length === TILE_COUNT) return
      sendHello()
    }, 1500)
    return () => clearTimeout(retry)
  }, [isHost, isOpponentOnline, peerId, sendMessage])

  const applyMatchReset = useCallback((): number => {
    if (flipBackTimer.current) clearTimeout(flipBackTimer.current)
    const nextSeed = (isHost || soloMode) ? ((Math.random() * 2 ** 31) | 0) : 0
    setSeed(nextSeed)
    setTiles((isHost || soloMode) ? initialTiles(nextSeed) : [])
    setPickedIndexes([])
    setTurnIsHost(true)
    setScore({ host: 0, guest: 0 })
    setRoundScores({ host: 0, guest: 0 })
    setCurrentRound(1)
    setGameWinner(null)
    seedBroadcastRef.current = false
    return nextSeed
  }, [isHost, soloMode])

  const startNextRound = useCallback((nextSeed: number) => {
    if (flipBackTimer.current) clearTimeout(flipBackTimer.current)
    setSeed(nextSeed)
    setTiles(initialTiles(nextSeed))
    setPickedIndexes([])
    setTurnIsHost(true)
    setScore({ host: 0, guest: 0 })
    setCurrentRound((r) => r + 1)
  }, [])

  const onHostPostReset = useCallback((nextSeed: number) => {
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BOARD_SEED', hostScore: nextSeed, guestScore: 0 },
    })
    seedBroadcastRef.current = true
  }, [sendMessage, peerId])
  const { handleRestartMatch } = useMatchRestart({ applyMatchReset, sendMessage, peerId, isHost, onHostPostReset })

  const fire = useEffectsFire()

  const turnIsHostRef = useRef(turnIsHost)
  useEffect(() => { turnIsHostRef.current = turnIsHost }, [turnIsHost])

  const applyReveal = useCallback((idx: number, byIsHost: boolean) => {
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
        setTimeout(() => resolveTwoPicks(next[0], next[1], byIsHost), 50)
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resolveTwoPicks = useCallback((a: number, b: number, byIsHost: boolean) => {
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
      // Celebrate — spark burst at the midpoint of the matched pair.
      // Uses the shared effects layer, so it renders on top of the board
      // without touching the canvas layout.
      requestAnimationFrame(() => {
        const nodes = document.querySelectorAll<HTMLElement>('.memory-tile')
        const rA = nodes[a]?.getBoundingClientRect()
        const rB = nodes[b]?.getBoundingClientRect()
        if (rA && rB) {
          const cx = (rA.left + rA.right + rB.left + rB.right) / 4
          const cy = (rA.top + rA.bottom + rB.top + rB.bottom) / 4
          fire('spark-burst', { x: cx, y: cy, count: 22, color: PALETTE.fgAccent })
        }
      })
      const hostP = players.find((p) => p.isHost)
      // Score by ROLE (isHost), not by peer id. Previous version keyed
      // off `byPlayerId === hostP.id` but the guest's outbound peerId
      // equals the roomId (same as host's slot id), so a guest match
      // was being attributed to the host on the host's screen.
      setScore((prev) => ({
        host:  prev.host  + (byIsHost ? 1 : 0),
        guest: prev.guest + (byIsHost ? 0 : 1),
      }))
      setPickedIndexes([])
      // Same player goes again — turn stays.
      // Check round-over (all matched) — advance round score.
      if (roundOverCheckTimer.current) clearTimeout(roundOverCheckTimer.current)
      roundOverCheckTimer.current = setTimeout(() => {
        roundOverCheckTimer.current = null
        const allMatched = tilesRef.current.every((x) => x.matched)
        if (!allMatched) return
        const s = scoreRef.current
        const hostName = hostP?.name ?? (isHost ? myName : opponentName)
        const guestName = players.find((p) => !p.isHost)?.name
          ?? (isHost ? opponentName : myName)
        // Round winner by pair-count.
        const roundWinnerRole: 'host' | 'guest' | 'tie' =
          s.host > s.guest ? 'host'
          : s.guest > s.host ? 'guest'
          : 'tie'
        setRoundScores((prev) => {
          const next = {
            host:  prev.host  + (roundWinnerRole === 'host'  ? 1 : 0),
            guest: prev.guest + (roundWinnerRole === 'guest' ? 1 : 0),
          }
          const matchOver =
            next.host  >= winsNeeded ||
            next.guest >= winsNeeded ||
            preset.rounds === 1 ||
            (currentRound + 1 > preset.rounds)
          if (matchOver) {
            if (next.host > next.guest) setGameWinner(hostName)
            else if (next.guest > next.host) setGameWinner(guestName)
            else if (roundWinnerRole === 'host') setGameWinner(hostName)
            else if (roundWinnerRole === 'guest') setGameWinner(guestName)
            else setGameWinner('무승부')
          } else if (isHost) {
            // Host schedules a fresh round after a 1.4 s reveal beat.
            if (nextRoundTimer.current) clearTimeout(nextRoundTimer.current)
            nextRoundTimer.current = setTimeout(() => {
              nextRoundTimer.current = null
              const nextSeed = (Math.random() * 2 ** 31) | 0
              sendMessage({
                type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
                payload: { actionType: 'MEMORY_NEXT_ROUND', hostScore: nextSeed },
              })
              startNextRound(nextSeed)
            }, 1400)
          }
          return next
        })
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
        // Mismatch = turn hands over. Match keeps turn (§3.3).
        setTurnIsHost((v) => !v)
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
        if (actionType === 'BOARD_HELLO') {
          if (isHost) sendSeed()
          return
        }
        if (actionType === 'BOARD_SEED' && typeof hostScore === 'number') {
          if (tilesRef.current.length === TILE_COUNT && hostScore === seed) return
          setSeed(hostScore)
          setTiles(initialTiles(hostScore))
        } else if (actionType === 'FLIP' && typeof cellIdx === 'number') {
          // Sender's role at time of send = turn owner at time of send.
          // turnIsHostRef.current lags by react commit but the two FLIPs
          // come from the same turn, so using the ref at receipt matches
          // the intended attribution.
          applyReveal(cellIdx, turnIsHostRef.current)
        } else if (actionType === 'MEMORY_NEXT_ROUND' && typeof hostScore === 'number') {
          startNextRound(hostScore)
        }
      }
      // GAME_RESET · RESTART handled by useMatchRestart listener.
    }
    window.addEventListener('p2p_message', handleP2PEvent)
    return () => window.removeEventListener('p2p_message', handleP2PEvent)
  }, [peerId, applyReveal, isHost, sendSeed, seed])

  const handleTileClick = (idx: number) => {
    if (!isMyTurn) return
    if (tiles[idx]?.matched || tiles[idx]?.revealed) return
    if (pickedIndexes.length >= 2) return
    applyReveal(idx, isHost)
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
    <div className="game-screen" data-my-turn={isMyTurn && !gameWinner ? '1' : '0'}>
      <GameHeader
        code="PAIR MATCH"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={
          isOpponentOnline
            ? preset.rounds > 1
              ? `R${currentRound}/${preset.rounds} · 내 ${isHost ? roundScores.host : roundScores.guest} : 상대 ${isHost ? roundScores.guest : roundScores.host} · ${scoreConn}`
              : `${scoreConn}`
            : '재연결 중…'
        }
        variant={isMyTurn ? 'default' : 'idle'}
        isMyTurn={isMyTurn}
      />

      <div className="game-board-region">
        <div className={`memory-board ${previewActive ? 'memory-board--preview' : ''}`}>
          {boardReady
            ? tiles.map((tile, idx) => {
                const isFace = previewActive || tile.revealed || tile.matched
                const disabled = previewActive || !isMyTurn || tile.matched || tile.revealed || pickedIndexes.length >= 2
                const cls = [
                  'card-flip memory-tile',
                  isFace ? 'is-face' : '',
                  tile.matched ? 'is-matched' : '',
                  disabled ? 'is-disabled' : '',
                ].filter(Boolean).join(' ')
                return (
                  <div
                    key={idx}
                    className={cls}
                    onClick={previewActive ? undefined : () => handleTileClick(idx)}
                  >
                    <div className="card-flip-inner">
                      <div className="card-flip-face card-flip-face--back">?</div>
                      <div className="card-flip-face card-flip-face--front">{tile.symbol}</div>
                    </div>
                  </div>
                )
              })
            : <div className="memory-board-loading">보드 동기화 중…</div>
          }
        </div>
      </div>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.isHost === turnIsHost,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{scoreLabel(p.isHost ? score.host : score.guest)}</span>,
        }))}
        hint="맞추면 한 번 더! 많이 가진 쪽 승리"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} reconnecting={reconnecting} onExit={onExit} />
      <TurnTransitionToast isMyTurn={isMyTurn} opponentName={opponentName} suppress={!!gameWinner || previewActive} />

      <RegistryGuide gameId="memory" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {gameWinner && (
        <GameOverModal
          title={gameWinner === myName ? 'YOU WIN' : gameWinner === '무승부' ? '무승부' : 'YOU LOSE'}
          winnerText={gameWinner === '무승부' ? '무승부' : `${gameWinner} 우승`}
          outcome={gameWinner === myName ? 'win' : gameWinner === '무승부' ? 'draw' : 'lose'}
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
