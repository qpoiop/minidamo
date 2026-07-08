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
import { PALETTE } from '../../../styles/palette'

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
// Permanent stacking bonuses (spec §M2 items):
//   vision  → +0.6 tile radius per stack
//   speed   → +15% move speed per stack (moveEnt lerp factor)
const VISION_STACK_VR = 0.6
const VISION_STACK_TILE = -3
const SPEED_STACK_MULT = 0.15
const BASE_MOVE_LERP = 0.3
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

/** Field pickup — vision or speed. Stackable, permanent boosts. */
interface Pickup { gx: number; gy: number; type: 'vision' | 'speed'; dead?: boolean }

interface EscapeState {
  g: number[][];              // 0 = floor, 1 = wall
  seen: boolean[][];
  tile: number; tileT: number;
  vr: number; vrT: number;
  parts: Particle[];
  state: 'play' | 'win' | 'lost';
  p: Entity;                  // my cat
  opp: Entity;                // opponent cat (position mirrored via P2P)
  oppKnown: boolean;          // opponent broadcast at least one position
  mon: Entity;                // monster
  key: { gx: number; gy: number } | null;
  items: Pickup[];            // vision + speed pickups scattered on the map
  exit: { gx: number; gy: number };  // pre-computed, hidden until met + hasKey
  met: boolean;
  hasKey: boolean;
  stun: number;
  start: number;
  visionCount: number;        // permanent vision boosts collected
  speedCount: number;         // permanent speed boosts collected
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
  const mySpawn: [number, number] = isHost ? [1, 1] : [N - 2, N - 2]
  const oppSpawn: [number, number] = isHost ? [N - 2, N - 2] : [1, 1]
  const p = makeEntity(mySpawn[0], mySpawn[1])
  const opp = makeEntity(oppSpawn[0], oppSpawn[1])
  const mon = makeEntity(1, 9)
  const key = pickFloor(g, seed ^ 0xa1, 14, 14)
  // Multiple vision + speed pickups scattered around the map so
  // stacking (x2, x3, ...) is actually reachable. All floor cells,
  // deterministic from seed so both peers see the same locations.
  const items: Pickup[] = []
  for (let i = 0; i < 3; i++) {
    const v = pickFloor(g, seed ^ (0xb200 + i), 8 + i * 4, 8 + i * 3)
    if (v) items.push({ gx: v.gx, gy: v.gy, type: 'vision' })
  }
  for (let i = 0; i < 3; i++) {
    const s = pickFloor(g, seed ^ (0xd300 + i), 6 + i * 5, 12 + i * 2)
    if (s) items.push({ gx: s.gx, gy: s.gy, type: 'speed' })
  }
  const exit = pickFloor(g, seed ^ 0xc3, 20, 20)
  return {
    g, seen,
    tile: 27, tileT: 27, vr: 2.7, vrT: 2.7,
    parts: [], state: 'play',
    p, opp, oppKnown: false, mon,
    key, items, exit,
    met: false, hasKey: false, stun: 0,
    start: performance.now(),
    visionCount: 0, speedCount: 0,
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
        // Longer dwell → fewer direction changes → feels less erratic.
        ent.t = 800 + Math.random() * 1600
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
  // Mirror inventory so the right-side HUD panel can render outside the
  // canvas frame. Updated on the same grid-align tick as the pickup.
  const [inv, setInv] = useState<{ vision: number; speed: number }>({ vision: 0, speed: 0 })
  const [itemToast, setItemToast] = useState<{ text: string; tone: 'key' | 'vision' | 'meet' | 'stun' | 'speed' } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const showItemToast = useCallback((toast: { text: string; tone: 'key' | 'vision' | 'meet' | 'stun' | 'speed' }) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setItemToast(toast)
    toastTimerRef.current = window.setTimeout(() => setItemToast(null), 1800)
  }, [])
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])
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
    setInv({ vision: 0, speed: 0 })
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
            fire('spark-burst', { x: window.innerWidth / 2, y: window.innerHeight / 2, count: 22, color: PALETTE.gold })
            showItemToast({ text: '친구가 열쇠 획득! 이제 출구로 이동해요.', tone: 'key' })
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
        ctx.fillStyle = PALETTE.bgInset
        ctx.fillRect(0, 0, STAGE_W, STAGE_H)
        ctx.fillStyle = PALETTE.fgAccent
        ctx.font = '10px "Press Start 2P", monospace'
        ctx.textAlign = 'center'
        ctx.fillText('MAZE SYNC…', STAGE_W / 2, STAGE_H / 2)
        raf = requestAnimationFrame(step)
        return
      }
      // Smooth tile / view radius toward targets. (Vision boosts are
      // permanent — vrT / tileT are set once on pickup and stay put.)
      st.tile += (st.tileT - st.tile) * 0.1
      st.vr += (st.vrT - st.vr) * 0.1
      if (st.state === 'play') {
        if (st.stun > 0) {
          st.stun -= dt
        } else {
          tryStep(st.g, st.p)
          const moveLerp = BASE_MOVE_LERP * (1 + st.speedCount * SPEED_STACK_MULT)
          if (moveEnt(st.p, moveLerp)) {
            // On grid-align event, run pickups + broadcast.
            onEnter(st, fire, peerId, sendMessage, setFlags, setInv, keyClaimedRef, isOpponentOnline, showItemToast, () => {
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
        // Speed knobs — spec calls out "느긋한 배회" (leisurely wander).
        // Halved from 0.7→0.35 wander cadence + 0.16→0.09 lerp so the
        // monster no longer flies across the room in a second.
        if (isHost) {
          wander(st.g, st.mon, dt * 0.35)
          moveEnt(st.mon, 0.09)
        } else {
          st.mon.fx += (st.mon.gx - st.mon.fx) * 0.09
          st.mon.fy += (st.mon.gy - st.mon.fy) * 0.09
        }
        // Local monster stun check + toast + red flash + haptic
        if (st.stun <= 0 && Math.abs(st.p.fx - st.mon.fx) < 0.6 && Math.abs(st.p.fy - st.mon.fy) < 0.6) {
          st.stun = 2000
          showItemToast({ text: '몬스터에게 걸렸어요! 2초 스턴', tone: 'stun' })
          fire('spark-burst', { x: window.innerWidth / 2, y: window.innerHeight / 2, count: 30, color: PALETTE.bombLight })
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(120)
        }
        // Meet check (opponent-as-buddy)
        if (!st.met && st.oppKnown) {
          if (Math.abs(st.p.gx - st.opp.gx) + Math.abs(st.p.gy - st.opp.gy) <= 1) {
            st.met = true
            setFlags((f) => ({ ...f, met: true }))
            showItemToast({ text: '친구랑 만났어요! 열쇠를 찾아요', tone: 'meet' })
            fire('spark-burst', { x: window.innerWidth / 2, y: window.innerHeight / 3, count: 22, color: PALETTE.fgAccent })
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
        {itemToast && (
          <div className={`escape-toast escape-toast--${itemToast.tone}`} key={itemToast.text} role="status">
            <span className="escape-toast-icon" aria-hidden="true">
              {itemToast.tone === 'key'    && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter"><circle cx="8" cy="12" r="4" /><path d="M12 12h8M17 12v4M19 12v3" /></svg>}
              {itemToast.tone === 'vision' && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>}
              {itemToast.tone === 'meet'   && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter"><path d="M4 14l4-4M20 14l-4-4M8 10h8" /><circle cx="6" cy="10" r="2" /><circle cx="18" cy="10" r="2" /></svg>}
              {itemToast.tone === 'stun'   && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter"><path d="M4 18v-6a8 8 0 0 1 16 0v6l-2-2-2 2-2-2-2 2-2-2-2 2z" /></svg>}
              {itemToast.tone === 'speed'  && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter"><path d="M13 2L4 14h7l-2 8 11-14h-7z" /></svg>}
            </span>
            <span>{itemToast.text}</span>
          </div>
        )}
        {/* Spec §M2 game main — 3-col × 2-row D-pad grid: [ · ↑ · ] / [ ← ↓ → ] */}
        <div className="escape-controls">
          <span aria-hidden="true" />
          <button
            type="button"
            className="escape-btn escape-btn--up"
            onPointerDown={() => setWant([0, -1])}
            onPointerUp={() => setWant(null)}
            onPointerLeave={() => setWant(null)}
            aria-label="위"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
          <span aria-hidden="true" />
          <button
            type="button"
            className="escape-btn escape-btn--left"
            onPointerDown={() => setWant([-1, 0])}
            onPointerUp={() => setWant(null)}
            onPointerLeave={() => setWant(null)}
            aria-label="왼쪽"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            className="escape-btn escape-btn--down"
            onPointerDown={() => setWant([0, 1])}
            onPointerUp={() => setWant(null)}
            onPointerLeave={() => setWant(null)}
            aria-label="아래"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="escape-btn escape-btn--right"
            onPointerDown={() => setWant([1, 0])}
            onPointerUp={() => setWant(null)}
            onPointerLeave={() => setWant(null)}
            aria-label="오른쪽"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        {/* Right-side status panel — 출구 조건 + 획득 인벤 */}
        <div className="escape-status">
          <div className="escape-status-group">
            <div className="escape-status-title">출구 조건</div>
            <div className={`escape-status-tile ${flags.met ? 'is-on' : ''}`}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <circle cx="8" cy="8" r="3" />
                <circle cx="16" cy="8" r="3" />
                <path d="M4 20c0-3 3-5 4-5M20 20c0-3-3-5-4-5" />
              </svg>
              <span className="escape-status-label">합류</span>
              {flags.met && <span className="escape-status-check">✓</span>}
            </div>
            <div className={`escape-status-tile ${flags.hasKey ? 'is-on' : ''}`}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <circle cx="8" cy="12" r="4" />
                <path d="M12 12h9l-2 3M17 12v3" />
              </svg>
              <span className="escape-status-label">열쇠</span>
              {flags.hasKey && <span className="escape-status-check">✓</span>}
            </div>
          </div>
          <div className="escape-status-group">
            <div className="escape-status-title">아이템</div>
            <div className={`escape-status-tile ${inv.vision > 0 ? 'is-on' : ''}`}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span className="escape-status-label">시야</span>
              {inv.vision > 0 && <span className="escape-status-stack">x{inv.vision}</span>}
            </div>
            <div className={`escape-status-tile ${inv.speed > 0 ? 'is-on' : ''}`}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <path d="M13 2L4 14h7l-2 8 11-14h-7z" />
              </svg>
              <span className="escape-status-label">속도</span>
              {inv.speed > 0 && <span className="escape-status-stack">x{inv.speed}</span>}
            </div>
          </div>
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
  setInv: React.Dispatch<React.SetStateAction<{ vision: number; speed: number }>>,
  keyClaimedRef: React.MutableRefObject<boolean>,
  isOpponentOnline: boolean,
  showItemToast: (toast: { text: string; tone: 'key' | 'vision' | 'meet' | 'stun' | 'speed' }) => void,
  onWin: () => void,
): void {
  const p = st.p
  if (st.key && !st.hasKey && p.gx === st.key.gx && p.gy === st.key.gy) {
    st.hasKey = true
    st.key = null
    setFlags((f) => ({ ...f, hasKey: true }))
    fire('spark-burst', { x: window.innerWidth / 2, y: window.innerHeight / 2, count: 22, color: PALETTE.gold })
    showItemToast({ text: '열쇠 획득! 이제 출구로 이동해요.', tone: 'key' })
    if (!keyClaimedRef.current && isOpponentOnline) {
      keyClaimedRef.current = true
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'MAZE_KEY' },
      })
    }
  }
  // Permanent, stackable pickups. Vision widens fog radius; speed
  // increases move interpolation (see step loop). Each stack persists
  // for the rest of the round.
  for (const it of st.items) {
    if (it.dead) continue
    if (p.gx !== it.gx || p.gy !== it.gy) continue
    it.dead = true
    if (it.type === 'vision') {
      st.visionCount += 1
      st.vrT = 2.7 + st.visionCount * VISION_STACK_VR
      st.tileT = Math.max(12, 27 + st.visionCount * VISION_STACK_TILE)
      fire('spark-burst', { x: window.innerWidth / 2, y: window.innerHeight / 2, count: 18, color: PALETTE.info })
      showItemToast({ text: `시야 확장! (x${st.visionCount})`, tone: 'vision' })
      setInv((prev) => ({ ...prev, vision: st.visionCount }))
    } else if (it.type === 'speed') {
      st.speedCount += 1
      fire('spark-burst', { x: window.innerWidth / 2, y: window.innerHeight / 2, count: 18, color: PALETTE.fgAccent })
      showItemToast({ text: `속도 증가! (x${st.speedCount})`, tone: 'speed' })
      setInv((prev) => ({ ...prev, speed: st.speedCount }))
    }
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
  ctx.fillStyle = PALETTE.mazeVoid
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
        ctx.fillStyle = vis ? PALETTE.mazeTileFogHigh : PALETTE.mazeTileFogLow
        ctx.fillRect(X, Y, T, T)
        ctx.fillStyle = vis ? PALETTE.mazeWallHigh : PALETTE.mazeWallLow
        ctx.fillRect(X, Y, T, Math.max(2, tile * 0.2))
      } else {
        ctx.fillStyle = vis ? PALETTE.mazeSeenPath : PALETTE.mazeUnknownPath
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
  // Speed pickup shares the eye sprite for now — see SpriteName bank.
  for (const it of st.items) {
    if (it.dead) continue
    drawItem({ gx: it.gx, gy: it.gy }, it.type === 'speed' ? 'eye' : 'eye')
  }
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
  grd.addColorStop(1, PALETTE.mazeVoid)
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
    ctx.fillStyle = PALETTE.fgAccent
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
