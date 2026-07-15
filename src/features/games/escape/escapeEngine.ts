import type { P2PMessage } from '../../../hooks/useRoom'
import type { useEffectsFire } from '../../../effects/EffectsProvider'
import { burstParticles } from '../common/sprites'
import type { Particle } from '../common/sprites'
import { PALETTE } from '../../../styles/palette'

/* ------------------------------------------------------------------
 * Escape — maze generation, entity movement, and state mutation.
 * Pulled out of Escape.tsx so the component file only holds React
 * wiring (hooks, effects, JSX); this module has no React dependency.
 * ------------------------------------------------------------------ */

export const N = 41
// Permanent stacking bonuses (spec §M2 items):
//   vision  → +0.6 tile radius per stack
//   speed   → +15% move speed per stack (moveEnt lerp factor)
export const VISION_STACK_VR = 0.6
export const VISION_STACK_TILE = -3
export const SPEED_STACK_MULT = 0.15
// Slower baseline — user feedback: 기본 속도가 너무 빠르다. Dropped
// from 0.3 → 0.18 so the fog-of-war exploration is legible without a
// speed pickup. Stacking bonus still adds 15% per pickup.
export const BASE_MOVE_LERP = 0.18
// Match length is per-instance now — see MATCH_LIMIT_SEC_LOCAL inside
// the component. Default fallback (5 min) lives in the destructure.
// New item drops every 15s. Host is authoritative — picks a random
// free cell + broadcasts the coord so guest sees the same spawn.
export const ITEM_DROP_INTERVAL_MS = 15000
export const POS_BROADCAST_MS = 200

export const STAGE_W = 260
export const STAGE_H = 320

export interface Entity {
  gx: number; gy: number;
  fx: number; fy: number;
  tx: number; ty: number;
  moving: boolean;
  want?: [number, number] | null;
  dir?: [number, number];
  t?: number;
}

/** Field pickup — vision or speed. Stackable, permanent boosts. */
export interface Pickup { gx: number; gy: number; type: 'vision' | 'speed'; dead?: boolean }

// Runtime flags added onto EscapeState so the render function knows who
// to centre the view on and which sprite to hide.
export interface EscapeState {
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
  myEscaped: boolean;         // I stepped through the exit already
  oppEscaped: boolean;        // peer did
}

/* ------------------------------------------------------------------
 * Maze generation (seeded DFS backtracker)
 * ------------------------------------------------------------------ */

export function generateMaze(seed: number): number[][] {
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

export function pickFloor(g: number[][], seed: number, minX: number, minY: number): { gx: number; gy: number } {
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

export function makeEntity(gx: number, gy: number): Entity {
  return {
    gx, gy, fx: gx, fy: gy, tx: gx, ty: gy,
    moving: false, want: null,
    dir: [0, -1], t: 0,
  }
}

export function initialState(seed: number, isHost: boolean): EscapeState {
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
  // Initial batch — 2 vision + 2 speed (4 total, per spec). Follow-up
  // drops handled by the runtime spawner every ITEM_DROP_INTERVAL_MS.
  const items: Pickup[] = []
  for (let i = 0; i < 2; i++) {
    const v = pickFloor(g, seed ^ (0xb200 + i), 8 + i * 4, 8 + i * 3)
    if (v) items.push({ gx: v.gx, gy: v.gy, type: 'vision' })
  }
  for (let i = 0; i < 2; i++) {
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
    myEscaped: false, oppEscaped: false,
  }
}

/* ------------------------------------------------------------------
 * Movement helpers
 * ------------------------------------------------------------------ */

export function tryStep(g: number[][], ent: Entity): void {
  if (!ent.moving && ent.want) {
    const [dx, dy] = ent.want
    const nx = ent.gx + dx, ny = ent.gy + dy
    if (g[ny] && g[ny][nx] === 0) {
      ent.tx = nx; ent.ty = ny; ent.moving = true
    }
  }
}

// Per-frame lerp rates below were tuned by eye against a 60Hz rAF
// cadence (~16.67ms/frame). Scaling the rate by dt keeps the same feel
// regardless of the display's actual refresh rate / frame drops —
// otherwise a 144Hz monitor smooths ~2.4x faster than tuned and a
// throttled tab smooths correspondingly slower.
const REF_FRAME_MS = 1000 / 60
export function frameLerp(ratePerFrame: number, dt: number): number {
  // Clamp below 1: rate>=1 makes (1-rate) non-positive, and a fractional
  // exponent (dt/REF_FRAME_MS won't always be a whole number) on a
  // non-positive base is NaN in JS Math.pow.
  const rate = Math.min(ratePerFrame, 0.999)
  return 1 - Math.pow(1 - rate, dt / REF_FRAME_MS)
}

export function moveEnt(ent: Entity, sp: number, dt: number): boolean {
  if (!ent.moving) return false
  const k = frameLerp(sp, dt)
  ent.fx += (ent.tx - ent.fx) * k
  ent.fy += (ent.ty - ent.fy) * k
  if (Math.abs(ent.tx - ent.fx) < 0.02 && Math.abs(ent.ty - ent.fy) < 0.02) {
    ent.fx = ent.tx; ent.fy = ent.ty
    ent.gx = ent.tx; ent.gy = ent.ty
    ent.moving = false
    return true
  }
  return false
}

export function wander(g: number[][], ent: Entity, dt: number): void {
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
 * Grid-align event — pickups, key claim, exit step-through.
 * ------------------------------------------------------------------ */

export function onEnter(
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
    showItemToast({
      text: st.met
        ? '열쇠 획득! 출구가 나타났어요.'
        : '열쇠 획득! 친구와 만나야 출구가 나타나요.',
      tone: 'key',
    })
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
  // Exit reveal + step-through. Team wins only once BOTH have exited;
  // the first-through path is handled at the call site (see game loop).
  const exitReady = st.met && st.hasKey
  if (exitReady && p.gx === st.exit.gx && p.gy === st.exit.gy) {
    burstParticles(st.parts, STAGE_W / 2, STAGE_H * 0.4, 40, true)
    onWin()
  }
}
