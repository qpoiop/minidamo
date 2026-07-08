import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { EscapeGameOver } from './EscapeGameOver'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { RegistryGuide } from '../common/RegistryGuide'
import { useEffectsFire } from '../../../effects/EffectsProvider'
import {
  drawSprite, BUDDY_OV, burstParticles, drawParticles, stepParticles,
} from '../common/sprites'
import type { Particle, PaletteKey } from '../common/sprites'

interface EscapeProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
}

/**
 * 냥탈출 — 2인 협동 미로 (spec §1b).
 *
 * Both players spawn in the same seeded maze on opposite corners. They
 * navigate independently but share:
 *   - the monster (host authoritative — only host runs the wander AI
 *     and broadcasts MAZE_MON every ~200 ms)
 *   - the key state (whoever touches it triggers MAZE_KEY; both then
 *     record hasKey = true)
 *   - the exit door (pre-computed from seed, revealed once met + hasKey)
 *
 * Meet check: each side broadcasts its own position every ~200 ms via
 * MAZE_POS, tracks the opponent's known cell, and flips `met` when the
 * two cells fall within Manhattan-distance 1.
 *
 * Vision-eye pickup is intentionally local — each cat carries its own
 * FOV buff.
 */

const N = 41
const VIS_MS_BONUS = 15000
const MATCH_LIMIT_SEC = 300
const POS_BROADCAST_MS = 200

interface Entity {
  gx: number; gy: number;
  fx: number; fy: number;
  tx: number; ty: number;
  moving: boolean;
  want?: [number, number] | null;
  dir?: [number, number];
  t?: number;
}

interface EscapeState {
  g: number[][];              // 0 = floor, 1 = wall
  seen: boolean[][];
  tile: number; tileT: number;
  vr: number; vrT: number;
  visMs: number;
  parts: Particle[];
  state: 'play' | 'win' | 'lost';
  p: Entity;                  // my cat
  opp: Entity;                // opponent cat (position mirrored via P2P)
  oppKnown: boolean;          // opponent broadcast at least one position
  mon: Entity;                // monster
  key: { gx: number; gy: number } | null;
  vision: { gx: number; gy: number } | null;
  exit: { gx: number; gy: number };  // pre-computed, hidden until met + hasKey
  met: boolean;
  hasKey: boolean;
  stun: number;
  start: number;
}

/* ------------------------------------------------------------------
 * Maze generation (seeded DFS backtracker)
 * ------------------------------------------------------------------ */

function generateMaze(seed: number): number[][] {
  const g = Array.from({ length: N }, () => new Array<number>(N).fill(1))
  let s = seed | 0
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const st: Array<[number, number]> = [[1, 1]]
  g[1][1] = 0
  while (st.length) {
    const [x, y] = st[st.length - 1]
    const dr: Array<[number, number]> = [[2, 0], [-2, 0], [0, 2], [0, -2]]
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      const t = dr[i]; dr[i] = dr[j]; dr[j] = t
    }
    let mv = false
    for (const [dx, dy] of dr) {
      const nx = x + dx, ny = y + dy
      if (nx > 0 && nx < N - 1 && ny > 0 && ny < N - 1 && g[ny][nx] === 1) {
        g[ny][nx] = 0
        g[y + dy / 2][x + dx / 2] = 0
        st.push([nx, ny])
        mv = true
        break
      }
    }
    if (!mv) st.pop()
  }
  return g
}

function pickFloor(g: number[][], seed: number, minX: number, minY: number): { gx: number; gy: number } {
  let s = seed | 0
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
  for (let i = 0; i < 400; i++) {
    const x = 1 + 2 * Math.floor(rnd() * (N / 2 - 1))
    const y = 1 + 2 * Math.floor(rnd() * (N / 2 - 1))
    if (g[y] && g[y][x] === 0 && (x > minX || y > minY)) return { gx: x, gy: y }
  }
  return { gx: N - 2, gy: N - 2 }
}

function makeEntity(gx: number, gy: number): Entity {
  return {
    gx, gy, fx: gx, fy: gy, tx: gx, ty: gy,
    moving: false, want: null,
    dir: [0, -1], t: 0,
  }
}

function initialState(seed: number, isHost: boolean): EscapeState {
  const g = generateMaze(seed)
  const seen = Array.from({ length: N }, () => new Array<boolean>(N).fill(false))
  // Spawn: host bottom-right, guest top-left (opposite corners → co-op
  // benefits from meeting up).
  const mySpawn: [number, number] = isHost ? [1, 1] : [N - 2, N - 2]
  const oppSpawn: [number, number] = isHost ? [N - 2, N - 2] : [1, 1]
  const p = makeEntity(mySpawn[0], mySpawn[1])
  const opp = makeEntity(oppSpawn[0], oppSpawn[1])
  const mon = makeEntity(1, 9)
  const key = pickFloor(g, seed ^ 0xa1, 14, 14)
  const vision = pickFloor(g, seed ^ 0xb2, 8, 8)
  // Exit deterministic from seed — both peers agree.
  const exit = pickFloor(g, seed ^ 0xc3, 20, 20)
  return {
    g, seen,
    tile: 27, tileT: 27, vr: 2.7, vrT: 2.7, visMs: 0,
    parts: [], state: 'play',
    p, opp, oppKnown: false, mon,
    key, vision, exit,
    met: false, hasKey: false, stun: 0,
    start: performance.now(),
  }
}

/* ------------------------------------------------------------------
 * Movement helpers
 * ------------------------------------------------------------------ */

function tryStep(g: number[][], ent: Entity): void {
  if (!ent.moving && ent.want) {
    const [dx, dy] = ent.want
    const nx = ent.gx + dx, ny = ent.gy + dy
    if (g[ny] && g[ny][nx] === 0) {
      ent.tx = nx; ent.ty = ny; ent.moving = true
    }
  }
}

function moveEnt(ent: Entity, sp: number): boolean {
  if (!ent.moving) return false
  ent.fx += (ent.tx - ent.fx) * sp
  ent.fy += (ent.ty - ent.fy) * sp
  if (Math.abs(ent.tx - ent.fx) < 0.02 && Math.abs(ent.ty - ent.fy) < 0.02) {
    ent.fx = ent.tx; ent.fy = ent.ty
    ent.gx = ent.tx; ent.gy = ent.ty
    ent.moving = false
    return true
  }
  return false
}

function wander(g: number[][], ent: Entity, dt: number): void {
  ent.t = (ent.t ?? 0) - dt
  if (!ent.moving) {
    const openInDir = ent.dir && g[ent.gy + ent.dir[1]] && g[ent.gy + ent.dir[1]][ent.gx + ent.dir[0]] === 0
    if ((ent.t ?? 0) <= 0 || !openInDir) {
      const opts: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .filter((d) => g[ent.gy + d[1]] && g[ent.gy + d[1]][ent.gx + d[0]] === 0) as Array<[number, number]>
      if (opts.length) {
        ent.dir = opts[Math.floor(Math.random() * opts.length)]
        ent.t = 400 + Math.random() * 900
      }
    }
    const d = ent.dir ?? [0, -1]
    const nx = ent.gx + d[0], ny = ent.gy + d[1]
    if (g[ny] && g[ny][nx] === 0) { ent.tx = nx; ent.ty = ny; ent.moving = true }
  }
}

/* ------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------ */

const STAGE_W = 260
const STAGE_H = 320

export function Escape({
  players, peerId, isHost, sendMessage,
  onExit,
  isOpponentOnline = true,
}: EscapeProps) {
  const [guideOpen, setGuideOpen] = useState(false)
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [seed, setSeed] = useState<number>(() => (isHost ? (Math.random() * 2 ** 31) | 0 : 0))
  const [ready, setReady] = useState(false)
  const [timerLabel, setTimerLabel] = useState('5:00')
  const [flags, setFlags] = useState<{ met: boolean; hasKey: boolean }>({ met: false, hasKey: false })
  const fire = useEffectsFire()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<EscapeState | null>(null)
  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])
  const lastPosBroadcastRef = useRef(0)
  const lastMonBroadcastRef = useRef(0)
  const keyClaimedRef = useRef(false)

  // ---- Match reset --------------------------------------------------------
  const applyMatchReset = useCallback(() => {
    const nextSeed = isHost ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = nextSeed
    setSeed(nextSeed)
    stateRef.current = isHost ? initialState(nextSeed, true) : null
    setReady(isHost)
    setGameWinner(null)
    setFlags({ met: false, hasKey: false })
    setTimerLabel(`${Math.floor(MATCH_LIMIT_SEC / 60)}:${String(MATCH_LIMIT_SEC % 60).padStart(2, '0')}`)
    keyClaimedRef.current = false
    lastPosBroadcastRef.current = 0
    lastMonBroadcastRef.current = 0
  }, [isHost])

  // ---- HELLO handshake ----------------------------------------------------
  const sendSeed = useCallback(() => {
    if (!isHost) return
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'MAZE_SEED', hostScore: seedRef.current },
    })
  }, [isHost, peerId, sendMessage])

  useEffect(() => {
    if (isHost) return
    if (!isOpponentOnline) return
    const sendHello = () => sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'MAZE_HELLO' },
    })
    sendHello()
    const retry = setTimeout(() => { if (!ready) sendHello() }, 1500)
    return () => clearTimeout(retry)
  }, [isHost, isOpponentOnline, peerId, ready, sendMessage])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      if (msg.type === 'GAME_ACTION') {
        const { actionType, hostScore, guestScore, ballX, ballY } = msg.payload
        if (actionType === 'MAZE_HELLO') {
          if (isHost) sendSeed()
          return
        }
        if (actionType === 'MAZE_SEED' && typeof hostScore === 'number') {
          if (hostScore === seedRef.current && stateRef.current) return
          seedRef.current = hostScore
          setSeed(hostScore)
          stateRef.current = initialState(hostScore, isHost)
          setReady(true)
          return
        }
        // Position mirror — opponent x=gx, y=gy in cells.
        if (actionType === 'MAZE_POS' && stateRef.current) {
          const st = stateRef.current
          if (typeof ballX === 'number' && typeof ballY === 'number') {
            st.opp.gx = ballX; st.opp.gy = ballY
            st.opp.tx = ballX; st.opp.ty = ballY
            // Smooth-follow the visual position toward the received cell.
            st.oppKnown = true
          }
          return
        }
        // Host authoritative monster position.
        if (actionType === 'MAZE_MON' && !isHost && stateRef.current) {
          const st = stateRef.current
          if (typeof ballX === 'number' && typeof ballY === 'number') {
            st.mon.gx = ballX; st.mon.gy = ballY
            st.mon.tx = ballX; st.mon.ty = ballY
          }
          return
        }
        if (actionType === 'MAZE_KEY' && stateRef.current) {
          const st = stateRef.current
          if (!st.hasKey) {
            st.hasKey = true
            st.key = null
            setFlags((f) => ({ ...f, hasKey: true }))
            fire('spark-burst', { x: window.innerWidth / 2, y: window.innerHeight / 2, count: 22, color: '#e0c34a' })
          }
          return
        }
        if (actionType === 'MAZE_WIN') {
          if (stateRef.current) stateRef.current.state = 'win'
          setGameWinner('탈출 성공')
          return
        }
        // Legacy no-op field, kept for schema future-proofing.
        if (actionType === 'MAZE_NOOP') return
        void guestScore
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [isHost, sendSeed, applyMatchReset, fire])

  // Host self-init
  useEffect(() => {
    if (!isHost) return
    if (ready) return
    stateRef.current = initialState(seed, true)
    setReady(true)
  }, [isHost, ready, seed])

  const handleRestartMatch = useCallback(() => {
    applyMatchReset()
    sendMessage({
      type: 'GAME_RESET', senderId: peerId, timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
    if (isHost) {
      const nextSeed = seedRef.current
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'MAZE_SEED', hostScore: nextSeed },
      })
    }
  }, [applyMatchReset, peerId, sendMessage, isHost])

  // ---- Input --------------------------------------------------------------
  const setWant = useCallback((d: [number, number] | null) => {
    const st = stateRef.current
    if (!st) return
    st.p.want = d
  }, [])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'arrowup' || k === 'w') setWant([0, -1])
      else if (k === 'arrowdown' || k === 's') setWant([0, 1])
      else if (k === 'arrowleft' || k === 'a') setWant([-1, 0])
      else if (k === 'arrowright' || k === 'd') setWant([1, 0])
    }
    const ku = () => setWant(null)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [setWant])

  // ---- Game loop ----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const parent = canvas.parentElement
      const parentW = parent?.clientWidth ?? STAGE_W
      const parentH = parent?.clientHeight ?? STAGE_H
      const aspect = STAGE_W / STAGE_H
      let cssW = parentW
      let cssH = cssW / aspect
      if (cssH > parentH) { cssH = parentH; cssW = cssH * aspect }
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
      const scale = (cssW / STAGE_W) * dpr
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.imageSmoothingEnabled = false
    }
    resize()
    window.addEventListener('resize', resize)

    let last = performance.now()
    let raf = 0
    const step = (t: number) => {
      const dt = Math.min(50, t - last)
      last = t
      const st = stateRef.current
      if (!st) {
        ctx.fillStyle = '#0f380f'
        ctx.fillRect(0, 0, STAGE_W, STAGE_H)
        ctx.fillStyle = '#c7e06a'
        ctx.font = '10px "Press Start 2P", monospace'
        ctx.textAlign = 'center'
        ctx.fillText('MAZE SYNC…', STAGE_W / 2, STAGE_H / 2)
        raf = requestAnimationFrame(step)
        return
      }
      // Smooth tile / view radius toward targets.
      st.tile += (st.tileT - st.tile) * 0.1
      st.vr += (st.vrT - st.vr) * 0.1
      if (st.visMs > 0) {
        st.visMs -= dt
        if (st.visMs <= 0) { st.vrT = 2.7; st.tileT = 27 }
      }
      if (st.state === 'play') {
        if (st.stun > 0) {
          st.stun -= dt
        } else {
          tryStep(st.g, st.p)
          if (moveEnt(st.p, 0.3)) {
            // On grid-align event, run pickups + broadcast.
            onEnter(st, fire, peerId, sendMessage, setFlags, keyClaimedRef, isOpponentOnline, () => {
              sendMessage({
                type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
                payload: { actionType: 'MAZE_WIN' },
              })
              setGameWinner('탈출 성공')
            })
          }
        }
        // Opponent visual smoothing.
        st.opp.fx += (st.opp.gx - st.opp.fx) * 0.25
        st.opp.fy += (st.opp.gy - st.opp.fy) * 0.25
        // Monster: host wanders, guest just tweens toward the mirrored cell.
        if (isHost) {
          wander(st.g, st.mon, dt * 0.7)
          moveEnt(st.mon, 0.16)
        } else {
          st.mon.fx += (st.mon.gx - st.mon.fx) * 0.16
          st.mon.fy += (st.mon.gy - st.mon.fy) * 0.16
        }
        // Local monster stun check
        if (st.stun <= 0 && Math.abs(st.p.fx - st.mon.fx) < 0.6 && Math.abs(st.p.fy - st.mon.fy) < 0.6) {
          st.stun = 2000
        }
        // Meet check (opponent-as-buddy)
        if (!st.met && st.oppKnown) {
          if (Math.abs(st.p.gx - st.opp.gx) + Math.abs(st.p.gy - st.opp.gy) <= 1) {
            st.met = true
            setFlags((f) => ({ ...f, met: true }))
          }
        }
        // Broadcast own position (5 Hz).
        const now = performance.now()
        if (isOpponentOnline && now - lastPosBroadcastRef.current > POS_BROADCAST_MS) {
          lastPosBroadcastRef.current = now
          sendMessage({
            type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
            payload: { actionType: 'MAZE_POS', ballX: st.p.gx, ballY: st.p.gy },
          })
        }
        if (isHost && isOpponentOnline && now - lastMonBroadcastRef.current > POS_BROADCAST_MS) {
          lastMonBroadcastRef.current = now
          sendMessage({
            type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
            payload: { actionType: 'MAZE_MON', ballX: st.mon.gx, ballY: st.mon.gy },
          })
        }
        // Timer
        const rem = Math.max(0, MATCH_LIMIT_SEC - (performance.now() - st.start) / 1000)
        const mm = Math.floor(rem / 60)
        const ss = String(Math.floor(rem % 60)).padStart(2, '0')
        setTimerLabel(`${mm}:${ss}`)
        if (rem <= 0) {
          st.state = 'lost'
          setGameWinner('실패')
        }
      } else if (st.state === 'win') {
        stepParticles(st.parts, STAGE_W, STAGE_H)
        if (st.parts.length < 30 && Math.random() < 0.3) burstParticles(st.parts, STAGE_W / 2, STAGE_H * 0.35, 10, true)
      }
      render(ctx, st)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [fire, peerId, sendMessage, isHost, isOpponentOnline])

  return (
    <div className="game-screen">
      <GameHeader code="ESCAPE" playerCount={2} ruleTag="협동" onHelp={() => setGuideOpen(true)} />
      <GameTurnStrip
        turnText={timerLabel}
        connectionLabel={`${flags.met ? '✓' : '·'} 합류  ${flags.hasKey ? '✓' : '·'} 열쇠`}
        variant="default"
      />

      <div className="game-board-region escape-board-region">
        <canvas ref={canvasRef} className="escape-canvas" aria-label="냥탈출 게임 화면" />
        <div className="escape-controls">
          <button
            type="button"
            className="escape-btn escape-btn--up"
            onPointerDown={() => setWant([0, -1])}
            onPointerUp={() => setWant(null)}
            onPointerLeave={() => setWant(null)}
            aria-label="위"
          >▲</button>
          <button
            type="button"
            className="escape-btn escape-btn--left"
            onPointerDown={() => setWant([-1, 0])}
            onPointerUp={() => setWant(null)}
            onPointerLeave={() => setWant(null)}
            aria-label="왼쪽"
          >◀</button>
          <button
            type="button"
            className="escape-btn escape-btn--right"
            onPointerDown={() => setWant([1, 0])}
            onPointerUp={() => setWant(null)}
            onPointerLeave={() => setWant(null)}
            aria-label="오른쪽"
          >▶</button>
          <button
            type="button"
            className="escape-btn escape-btn--down"
            onPointerDown={() => setWant([0, 1])}
            onPointerUp={() => setWant(null)}
            onPointerLeave={() => setWant(null)}
            aria-label="아래"
          >▼</button>
        </div>
      </div>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: true,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{flags.hasKey ? '🗝' : '—'}</span>,
        }))}
        hint="친구·열쇠·출구 순서로 만나요"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <RegistryGuide gameId="escape" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {gameWinner && (
        <EscapeGameOver
          outcome={gameWinner === '실패' ? 'timeout' : 'win'}
          timeUsed={timerLabel}
          onRestart={handleRestartMatch}
          onExit={onExit}
          restartDisabled={!isOpponentOnline}
          restartHint={!isOpponentOnline ? '상대방 재연결 대기 중' : undefined}
        />
      )}
    </div>
  )
}

function onEnter(
  st: EscapeState,
  fire: ReturnType<typeof useEffectsFire>,
  peerId: string,
  sendMessage: (msg: P2PMessage) => void,
  setFlags: React.Dispatch<React.SetStateAction<{ met: boolean; hasKey: boolean }>>,
  keyClaimedRef: React.MutableRefObject<boolean>,
  isOpponentOnline: boolean,
  onWin: () => void,
): void {
  const p = st.p
  if (st.key && !st.hasKey && p.gx === st.key.gx && p.gy === st.key.gy) {
    st.hasKey = true
    st.key = null
    setFlags((f) => ({ ...f, hasKey: true }))
    fire('spark-burst', { x: window.innerWidth / 2, y: window.innerHeight / 2, count: 22, color: '#e0c34a' })
    if (!keyClaimedRef.current && isOpponentOnline) {
      keyClaimedRef.current = true
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'MAZE_KEY' },
      })
    }
  }
  if (st.vision && p.gx === st.vision.gx && p.gy === st.vision.gy) {
    st.vision = null
    st.vrT = 4.7; st.tileT = 18; st.visMs = VIS_MS_BONUS
  }
  // Exit is revealed only once both cooperated: met + hasKey.
  const exitReady = st.met && st.hasKey
  if (exitReady && p.gx === st.exit.gx && p.gy === st.exit.gy) {
    st.state = 'win'
    burstParticles(st.parts, STAGE_W / 2, STAGE_H * 0.4, 40, true)
    onWin()
  }
}

/* ------------------------------------------------------------------
 * Renderer
 * ------------------------------------------------------------------ */

function render(ctx: CanvasRenderingContext2D, st: EscapeState): void {
  const p = st.p
  const tile = st.tile
  const W = STAGE_W, H = STAGE_H
  const cx = W / 2, cy = H / 2
  ctx.fillStyle = '#05100a'
  ctx.fillRect(0, 0, W, H)
  const range = Math.ceil(Math.max(W, H) / 2 / tile) + 1
  for (let ty = Math.floor(p.fy - range); ty <= Math.ceil(p.fy + range); ty++) {
    for (let tx = Math.floor(p.fx - range); tx <= Math.ceil(p.fx + range); tx++) {
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue
      const d = Math.hypot(tx - p.fx, ty - p.fy)
      const vis = d <= st.vr
      if (vis) st.seen[ty][tx] = true
      else if (!st.seen[ty][tx]) continue
      const X = (tx - p.fx) * tile + cx - tile / 2
      const Y = (ty - p.fy) * tile + cy - tile / 2
      const wall = st.g[ty][tx] === 1
      const T = Math.ceil(tile)
      if (wall) {
        ctx.fillStyle = vis ? '#33511b' : '#20340f'
        ctx.fillRect(X, Y, T, T)
        ctx.fillStyle = vis ? '#4a7326' : '#2a441a'
        ctx.fillRect(X, Y, T, Math.max(2, tile * 0.2))
      } else {
        ctx.fillStyle = vis ? '#0f380f' : '#0b230b'
        ctx.fillRect(X, Y, T, T)
      }
      if (!vis) {
        ctx.fillStyle = 'rgba(5,16,10,0.45)'
        ctx.fillRect(X, Y, T, T)
      }
    }
  }
  const sp = (tile * 0.82) / 12
  const drawItem = (it: { gx: number; gy: number } | null, name: 'key' | 'eye' | 'door') => {
    if (!it) return
    const d = Math.hypot(it.gx - p.fx, it.gy - p.fy)
    if (d > st.vr + 0.6 && !st.seen[it.gy][it.gx]) return
    const x = (it.gx - p.fx) * tile + cx
    const y = (it.gy - p.fy) * tile + cy
    ctx.globalAlpha = d <= st.vr ? 1 : 0.4
    drawSprite(ctx, name, x, y, sp)
    ctx.globalAlpha = 1
  }
  drawItem(st.key, 'key')
  drawItem(st.vision, 'eye')
  // Exit visible only when unlocked (both conditions).
  if (st.met && st.hasKey) drawItem(st.exit, 'door')
  const drawEnt = (e: Entity, name: 'cat' | 'monster', ov?: Partial<Record<PaletteKey, string>>) => {
    const d = Math.hypot(e.fx - p.fx, e.fy - p.fy)
    if (d > st.vr + 0.4) return
    const x = (e.fx - p.fx) * tile + cx
    const y = (e.fy - p.fy) * tile + cy
    drawSprite(ctx, name, x, y, sp, ov)
  }
  // Opponent cat drawn in-view when known.
  if (st.oppKnown) drawEnt(st.opp, 'cat', BUDDY_OV)
  drawEnt(st.mon, 'monster')
  if (!(st.stun > 0 && Math.floor(st.stun / 120) % 2)) drawSprite(ctx, 'cat', cx, cy, sp)
  const vr = st.vr * tile
  const grd = ctx.createRadialGradient(cx, cy, vr * 0.55, cx, cy, vr * 1.2)
  grd.addColorStop(0, 'rgba(5,16,10,0)')
  grd.addColorStop(1, '#05100a')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, W, H)
  // Compass arrow: point to the appropriate goal (exit if unlocked, else
  // opponent if not yet met, else key if not yet claimed).
  const target: { gx: number; gy: number } | null = st.met && st.hasKey
    ? st.exit
    : !st.met && st.oppKnown
      ? { gx: st.opp.gx, gy: st.opp.gy }
      : st.key
  if (target) {
    const ang = Math.atan2(target.gy - p.fy, target.gx - p.fx)
    const ex = cx + Math.cos(ang) * (Math.min(W, H) / 2 - 16)
    const ey = cy + Math.sin(ang) * (Math.min(W, H) / 2 - 16)
    ctx.save()
    ctx.translate(ex, ey)
    ctx.rotate(ang)
    ctx.fillStyle = '#c7e06a'
    ctx.beginPath()
    ctx.moveTo(8, 0)
    ctx.lineTo(-6, -6)
    ctx.lineTo(-6, 6)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  if (st.stun > 0) {
    ctx.fillStyle = 'rgba(194,51,31,0.28)'
    ctx.fillRect(0, 0, W, H)
  }
  if (st.state === 'win') {
    ctx.fillStyle = 'rgba(5,16,10,0.55)'
    ctx.fillRect(0, 0, W, H)
    drawParticles(ctx, st.parts)
  }
}
