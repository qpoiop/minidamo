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
import { DragJoystick } from './DragJoystick'
import { catReady, drawCatFrame, dirFromDelta } from '../common/spriteSheets'
import { useMatchRestart } from '../common/useMatchRestart'
import type { CatDir, CatFrame } from '../common/spriteSheets'

interface EscapeProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  reconnecting?: boolean;
  reason?: string | null;
  /** Match time limit in seconds. matchOption values 180/300/420 map to
   * 3/5/7-minute rounds. Any other value falls back to 300. */
  matchOption?: number;
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
// Slower baseline — user feedback: 기본 속도가 너무 빠르다. Dropped
// from 0.3 → 0.18 so the fog-of-war exploration is legible without a
// speed pickup. Stacking bonus still adds 15% per pickup.
const BASE_MOVE_LERP = 0.18
// Match length is per-instance now — see MATCH_LIMIT_SEC_LOCAL inside
// the component. Default fallback (5 min) lives in the destructure.
// New item drops every 15s. Host is authoritative — picks a random
// free cell + broadcasts the coord so guest sees the same spawn.
const ITEM_DROP_INTERVAL_MS = 15000
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

// Runtime flags added onto EscapeState so the render function knows who
// to centre the view on and which sprite to hide.
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
  myEscaped: boolean;         // I stepped through the exit already
  oppEscaped: boolean;        // peer did
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
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
  reconnecting = false,
  reason = null,
  matchOption = 300,
}: EscapeProps) {
  // Clamp matchOption to the supported presets; anything else falls
  // through to the 5-minute default.
  const MATCH_LIMIT_SEC_LOCAL = (matchOption === 180 || matchOption === 300 || matchOption === 420)
    ? matchOption
    : 300
  const [guideOpen, setGuideOpen] = useState(false)
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [seed, setSeed] = useState<number>(() => (isHost ? (Math.random() * 2 ** 31) | 0 : 0))
  const [ready, setReady] = useState(false)
  const [timerLabel, setTimerLabel] = useState('5:00')
  const [flags, setFlags] = useState<{ met: boolean; hasKey: boolean }>({ met: false, hasKey: false })
  // Mirror inventory so the right-side HUD panel can render outside the
  // canvas frame. Updated on the same grid-align tick as the pickup.
  const [inv, setInv] = useState<{ vision: number; speed: number }>({ vision: 0, speed: 0 })
  // Team-escape bookkeeping. First player through the exit is marked
  // and enters spectator mode until the buddy makes it out too.
  const [myEscaped, setMyEscaped] = useState(false)
  const [oppEscaped, setOppEscaped] = useState(false)
  // Big countdown overlay only lit for the final 30 seconds.
  const [countdownSecs, setCountdownSecs] = useState<number | null>(null)
  const countdownAnnouncedRef = useRef(false)
  // Player minimap position (grid coords). Sampled every 200ms — no
  // per-frame React churn. When spectating we follow the opponent.
  const [playerMiniPos, setPlayerMiniPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  useEffect(() => {
    const id = setInterval(() => {
      const st = stateRef.current
      if (!st) return
      const src = (myEscaped && !oppEscaped) ? st.opp : st.p
      setPlayerMiniPos({ x: src.fx, y: src.fy })
    }, 200)
    return () => clearInterval(id)
  }, [myEscaped, oppEscaped])
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
  const nextItemDropRef = useRef(0)
  const keyClaimedRef = useRef(false)

  // ---- Match reset --------------------------------------------------------
  /*
   * 사용자 지적: "결과화면에서 다시하기하면 다른 대기방이 생성됨".
   *
   * 원인 추정: 게스트 side applyMatchReset 이 stateRef.current = null 로
   * 캔버스 상태를 즉시 비움 → MAZE_SEED 수신 전까지 blank canvas 렌더 →
   * "새 대기방/로딩" 처럼 보임.
   *
   * 대응:
   *   · 게스트는 stateRef 를 wipeout 하지 않고 그대로 유지. MAZE_SEED
   *     수신 시점에 initialState 로 원자적 교체 → 시각 gap 없음.
   *   · 호스트는 즉시 새 seed 로 initialState 생성 (기존 그대로).
   */
  const applyMatchReset = useCallback(() => {
    const nextSeed = isHost ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = nextSeed
    setSeed(nextSeed)
    if (isHost) {
      stateRef.current = initialState(nextSeed, true)
    }
    // 게스트는 stateRef 유지 · MAZE_SEED 수신 handler 에서 교체.
    // ready 는 true 유지 (blank canvas 대신 이전 상태 노출 · 곧 새 seed 로 교체).
    setReady(true)
    setGameWinner(null)
    setFlags({ met: false, hasKey: false })
    setInv({ vision: 0, speed: 0 })
    setMyEscaped(false)
    setOppEscaped(false)
    setCountdownSecs(null)
    setTimerLabel(`${Math.floor(MATCH_LIMIT_SEC_LOCAL / 60)}:${String(MATCH_LIMIT_SEC_LOCAL % 60).padStart(2, '0')}`)
    keyClaimedRef.current = false
    lastPosBroadcastRef.current = 0
    lastMonBroadcastRef.current = 0
    nextItemDropRef.current = performance.now() + ITEM_DROP_INTERVAL_MS
    countdownAnnouncedRef.current = false
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
          // 재시작 정합성 · 상대의 RESET RESTART 가 앞서지 못하는
          // race 케이스에 대비해 여기서도 진행 관련 상태 초기화.
          setGameWinner(null)
          setFlags({ met: false, hasKey: false })
          setInv({ vision: 0, speed: 0 })
          setMyEscaped(false)
          setOppEscaped(false)
          setCountdownSecs(null)
          countdownAnnouncedRef.current = false
          keyClaimedRef.current = false
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
            showItemToast({
              text: st.met
                ? '친구가 열쇠 획득! 출구가 나타났어요.'
                : '친구가 열쇠 획득! 서로 만나야 출구가 나타나요.',
              tone: 'key',
            })
          }
          return
        }
        if (actionType === 'MAZE_ESCAPED') {
          // Peer stepped through the exit. Their character removed +
          // spectate our screen. If I already escaped too → both out,
          // transition to win immediately (사용자 지적: 결과화면에서
          // 타이머 도는 문제 · MAZE_WIN 없이도 종료 처리).
          if (stateRef.current) stateRef.current.oppEscaped = true
          setOppEscaped(true)
          const st = stateRef.current
          if (st?.myEscaped) {
            st.state = 'win'
            setGameWinner('탈출 성공')
            showItemToast({ text: '둘 다 탈출 성공!', tone: 'meet' })
          } else {
            showItemToast({
              text: '상대가 먼저 탈출했어요! 얼른 따라 나가세요.',
              tone: 'meet',
            })
          }
          return
        }
        if (actionType === 'MAZE_WIN') {
          // Legacy path — treated as full team win by both sides.
          if (stateRef.current) stateRef.current.state = 'win'
          setGameWinner('탈출 성공')
          return
        }
        if (actionType === 'MAZE_DROP') {
          // Host-authoritative random item drop. Payload: hostScore =
          // gx, cellIdx = gy, guestScore = type (0=vision, 1=speed).
          const st = stateRef.current
          if (st && typeof msg.payload.hostScore === 'number' && typeof msg.payload.cellIdx === 'number') {
            const type = msg.payload.guestScore === 1 ? 'speed' : 'vision'
            st.items.push({ gx: msg.payload.hostScore, gy: msg.payload.cellIdx, type })
          }
          return
        }
        // Legacy no-op field, kept for schema future-proofing.
        if (actionType === 'MAZE_NOOP') return
        void guestScore
      }
      // GAME_RESET · RESTART handled by useMatchRestart listener.
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [isHost, sendSeed, fire])

  // Host self-init
  useEffect(() => {
    if (!isHost) return
    if (ready) return
    stateRef.current = initialState(seed, true)
    setReady(true)
  }, [isHost, ready, seed])

  const onHostPostReset = useCallback(() => {
    const nextSeed = seedRef.current
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'MAZE_SEED', hostScore: nextSeed },
    })
  }, [sendMessage, peerId])
  /*
   * 사용자 지적: "다시하기 누르면 방 다시 만들어짐".
   * hostRestartRoute: onLobby 이면 호스트가 로비로 돌아가서 "게임 시작" 을
   * 다시 눌러야 재개 → 유저 관점 새 방 생성처럼 느껴짐. Escape 는 옵션이
   * time-limit 뿐이라 즉시 재시작이 UX 우선. hostRestartRoute 제거로
   * 원래 RESTART broadcast 흐름 (양쪽 즉시 리셋) 복구.
   */
  const { handleRestartMatch } = useMatchRestart({ applyMatchReset, sendMessage, peerId, isHost, onHostPostReset })

  // ---- Input --------------------------------------------------------------
  const setWant = useCallback((d: [number, number] | null) => {
    const st = stateRef.current
    if (!st) return
    // Lock input once I've escaped — I'm spectating the buddy now.
    if (st.myEscaped) { st.p.want = null; return }
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
        } else if (!st.myEscaped) {
          tryStep(st.g, st.p)
          const moveLerp = BASE_MOVE_LERP * (1 + st.speedCount * SPEED_STACK_MULT)
          if (moveEnt(st.p, moveLerp)) {
            // On grid-align event, run pickups + broadcast.
            onEnter(st, fire, peerId, sendMessage, setFlags, setInv, keyClaimedRef, isOpponentOnline, showItemToast, () => {
              // I stepped through the exit. Notify the buddy, hide
              // my cat, lock input, spectate the peer's canvas.
              st.myEscaped = true
              setMyEscaped(true)
              showItemToast({
                text: st.oppEscaped
                  ? '둘 다 탈출 성공!'
                  : '탈출 성공! 상대가 나올 때까지 관전 중.',
                tone: 'meet',
              })
              sendMessage({
                type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
                payload: { actionType: 'MAZE_ESCAPED' },
              })
              if (st.oppEscaped) {
                sendMessage({
                  type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
                  payload: { actionType: 'MAZE_WIN' },
                })
                // 사용자 지적: "결과화면에서도 타이머가 돌아가".
                // 승리 confirm 시 로컬 st.state 를 즉시 'win' 으로 전이 →
                // render step 이 'play' 블록 (timer decrement) 스킵.
                // 이전엔 MAZE_WIN 상대 수신 handler 에만 있었어서, 승자
                // 로컬은 st.state='play' 유지 → 타이머 계속 tick.
                st.state = 'win'
                setGameWinner('탈출 성공')
              }
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
            showItemToast({
              text: st.hasKey
                ? '친구와 만남! 출구가 나타났어요.'
                : '친구와 만남! 이제 열쇠를 찾아요.',
              tone: 'meet',
            })
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
        // Host-authoritative random item drop every ITEM_DROP_INTERVAL_MS.
        // Random floor cell, alternating vision/speed with 50/50 pick.
        // `isOpponentOnline` 게이트 필수 — offline 중 host 로컬에만 아이템이
        // 쌓이면 재접속 시 guest 는 못 봤던 아이템을 갑자기 만나거나 host 가
        // 이미 먹은 유령 아이템을 만나는 divergence 발생. 오프라인 구간은
        // spawn 을 잠시 멈춘다.
        if (isHost && isOpponentOnline && performance.now() > nextItemDropRef.current) {
          nextItemDropRef.current = performance.now() + ITEM_DROP_INTERVAL_MS
          let tries = 20
          while (tries-- > 0) {
            const gx = 1 + Math.floor(Math.random() * (N - 2))
            const gy = 1 + Math.floor(Math.random() * (N - 2))
            if (st.g[gy]?.[gx] !== 0) continue
            // Avoid spawning on top of the player, buddy, key, or another item.
            if (Math.abs(st.p.gx - gx) + Math.abs(st.p.gy - gy) < 2) continue
            if (st.opp && Math.abs(st.opp.gx - gx) + Math.abs(st.opp.gy - gy) < 2) continue
            if (st.key && st.key.gx === gx && st.key.gy === gy) continue
            if (st.items.some((it) => !it.dead && it.gx === gx && it.gy === gy)) continue
            const type: 'vision' | 'speed' = Math.random() < 0.5 ? 'vision' : 'speed'
            st.items.push({ gx, gy, type })
            if (isOpponentOnline) {
              sendMessage({
                type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
                payload: {
                  actionType: 'MAZE_DROP',
                  hostScore: gx, cellIdx: gy, guestScore: type === 'speed' ? 1 : 0,
                },
              })
            }
            break
          }
        }
        // Timer + last-30s big countdown surface. React state doesn't
        // need the ceiled seconds every frame — only when the label
        // actually changes.
        const rem = Math.max(0, MATCH_LIMIT_SEC_LOCAL - (performance.now() - st.start) / 1000)
        const mm = Math.floor(rem / 60)
        const ss = String(Math.floor(rem % 60)).padStart(2, '0')
        setTimerLabel(`${mm}:${ss}`)
        const remCeil = Math.ceil(rem)
        setCountdownSecs((prev) => (remCeil <= 30 ? remCeil : (prev === null ? null : null)))
        if (remCeil <= 30 && !countdownAnnouncedRef.current) {
          countdownAnnouncedRef.current = true
          showItemToast({
            text: '30초 남았어요! 미니맵에 출구 위치를 공개했어요.',
            tone: 'meet',
          })
        }
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
      <GameHeader code="ESCAPE" onHelp={() => setGuideOpen(true)} onExit={onExit} onRestart={handleRestartMatch} isHost={isHost} />
      <GameTurnStrip
        turnText={`⏱ 제한시간 ${timerLabel}`}
        connectionLabel={`${flags.met ? '✓' : '·'} 합류  ${flags.hasKey ? '✓' : '·'} 열쇠`}
        variant="default"
      />

      <div className="game-board-region escape-board-region">
        <canvas ref={canvasRef} className="escape-canvas" aria-label="협동 미로 게임 화면" />
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
        {/* Semi-transparent drag joystick (bottom-left). Replaces the
         * 4-button D-pad — user asked for continuous drag control so
         * one thumb can hold + steer instead of tapping four keys. */}
        <DragJoystick onDir={setWant} />

        {/* Minimap — top-left. Concept-palette treatment: dark cool-
         * green fill + double lime ring (outer solid, inner scanlines).
         * When the last-30s window opens we also reveal the exit as a
         * magenta star so it's unmistakably different from the pip. */}
        <div className="escape-minimap" aria-hidden="true">
          <svg viewBox="0 0 40 40" width="60" height="60">
            <defs>
              <clipPath id="mini-clip">
                <circle cx="20" cy="20" r="16" />
              </clipPath>
              <pattern id="mini-scan" patternUnits="userSpaceOnUse" width="1" height="2">
                <rect x="0" y="0" width="1" height="1" fill="rgba(199,224,106,0.08)" />
              </pattern>
            </defs>
            <circle cx="20" cy="20" r="18" fill="none" stroke="var(--border-strong)" strokeWidth="2.6" />
            <circle cx="20" cy="20" r="16.5" fill="rgba(11, 35, 11, 0.85)" stroke="var(--fg-accent)" strokeWidth="1.6" />
            <circle cx="20" cy="20" r="15" fill="url(#mini-scan)" clipPath="url(#mini-clip)" />
            {countdownSecs !== null && stateRef.current && (
              <MinimapExit
                exit={stateRef.current.exit}
                nCells={N}
              />
            )}
            {/* 사용자 지적: "이거 열쇠 나오는거 맞지?".
             *  열쇠는 시안 §3-② 대로 미로 안에 배치되지만 fog-of-war
             *  로 시야 안 들면 안 보임. 합류(met) 후에도 열쇠 없으면
             *  미니맵에 노란 점으로 위치 힌트 (탈출 별과 유사 · 조기 도움).
             */}
            {flags.met && !flags.hasKey && stateRef.current?.key && (
              <MinimapKey
                keyPos={stateRef.current.key}
                nCells={N}
              />
            )}
            <circle
              clipPath="url(#mini-clip)"
              cx={20 + ((playerMiniPos.x / Math.max(1, N - 1)) - 0.5) * 28}
              cy={20 + ((playerMiniPos.y / Math.max(1, N - 1)) - 0.5) * 28}
              r="2.4"
              fill="var(--fg-accent)"
              stroke="var(--border-strong)"
              strokeWidth="0.8"
            />
          </svg>
        </div>

        {/* Last-30s big countdown overlay — pulses over the play area
         * so the pressure is unmissable. */}
        {countdownSecs !== null && countdownSecs > 0 && (
          <div className="escape-countdown" aria-live="polite">
            <div className="escape-countdown-label">제한시간</div>
            <div className="escape-countdown-value">{countdownSecs}</div>
          </div>
        )}

        {/* Spectator overlay — shown once I'm out but the buddy hasn't
         * exited yet. Camera + controls are already redirected; this is
         * the visible cue. */}
        {myEscaped && !oppEscaped && (
          <div className="escape-spectate">
            <div className="escape-spectate-badge">관전 중</div>
            <div className="escape-spectate-msg">먼저 탈출했어요. 상대가 나올 때까지 화면을 지켜보세요.</div>
          </div>
        )}
      </div>

      {/* HUD strip BELOW canvas — split into two labelled groups.
       * 출구 조건: 합류 / 열쇠 (게임 진행 상태).
       * 아이템:    시야 / 속도 (누적 스탯). */}
      <div className="escape-hud">
        <div className="escape-hud-group">
          <div className="escape-hud-group-title">출구 조건</div>
          <div className="escape-hud-tiles">
            <div className={`escape-hud-tile ${flags.met ? 'is-on' : ''}`}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path opacity="0.5" d="M2 12l1.5-2 1.5 2h2l1.5-2 1.5 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
                <path d="M13 12l1.5-2 1.5 2h2l1.5-2 1.5 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" />
              </svg>
              <span>합류</span>
              {flags.met && <span className="escape-hud-check">✓</span>}
            </div>
            <div className={`escape-hud-tile ${flags.hasKey ? 'is-on' : ''}`}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <circle cx="7" cy="12" r="4" />
                <circle cx="7" cy="12" r="1.4" fill="var(--bg-inset)" />
                <path d="M11 11h11v2h-4v3h-2v-3h-2v3h-2v-3h-1z" />
              </svg>
              <span>열쇠</span>
              {flags.hasKey && <span className="escape-hud-check">✓</span>}
            </div>
          </div>
        </div>

        <div className="escape-hud-group">
          <div className="escape-hud-group-title">아이템</div>
          <div className="escape-hud-tiles">
            <div className={`escape-hud-tile ${inv.vision > 0 ? 'is-on' : ''}`}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="4" fill="var(--bg-inset)" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              <span>시야</span>
              {inv.vision > 0 && <span className="escape-hud-stack">x{inv.vision}</span>}
            </div>
            <div className={`escape-hud-tile ${inv.speed > 0 ? 'is-on' : ''}`}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M14 2L4 14h6l-2 8 12-14h-7z" />
              </svg>
              <span>속도</span>
              {inv.speed > 0 && <span className="escape-hud-stack">x{inv.speed}</span>}
            </div>
          </div>
        </div>
      </div>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: true,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: (
            <span className="participant-symbol" aria-label={flags.hasKey ? '열쇠 획득' : '열쇠 미획득'}>
              {flags.hasKey ? (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <circle cx="7" cy="12" r="4" />
                  <circle cx="7" cy="12" r="1.5" fill="var(--bg-inset)" />
                  <path d="M11 11h11v2h-4v3h-2v-3h-2v3h-2v-3h-1z" />
                </svg>
              ) : '—'}
            </span>
          ),
        }))}
        hint="친구·열쇠·출구 순서로 만나요"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} reconnecting={reconnecting} reason={reason} onExit={onExit} />
      <RegistryGuide gameId="escape" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {gameWinner && (
        <EscapeGameOver
          outcome={gameWinner === '실패' ? 'timeout' : 'win'}
          timeUsed={timerLabel}
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

/* ------------------------------------------------------------------
 * Renderer
 * ------------------------------------------------------------------ */

const playerDirRefHolder: { current: CatDir } = { current: 'down' }
const playerDirRef = playerDirRefHolder
function render(ctx: CanvasRenderingContext2D, st: EscapeState): void {
  // Spectator view — once I'm out, the camera + fog + item visibility
  // all follow the buddy so I can watch them finish the run. My cat
  // is no longer drawn; controls are locked at the input layer.
  const spectating = st.myEscaped && !st.oppEscaped
  const p = spectating ? st.opp : st.p
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
  // Buddy cat — draw whenever we know their position AND they haven't
  // already exited. When spectating, `p` IS the buddy so their sprite
  // is drawn at screen centre by the block below (we skip the buddy
  // overlay here to avoid double-render).
  if (st.oppKnown && !st.oppEscaped && !spectating) {
    const ox = (st.opp.fx - p.fx) * tile + cx
    const oy = (st.opp.fy - p.fy) * tile + cy
    if (catReady()) {
      const oppDir = dirFromDelta(st.opp.fx - st.opp.gx, st.opp.fy - st.opp.gy, 'down')
      const oppMoving = Math.abs(st.opp.fx - st.opp.gx) + Math.abs(st.opp.fy - st.opp.gy) > 0.02
      const oppFrame: CatFrame = oppMoving ? (Math.floor(performance.now() / 160) % 2) as CatFrame : 0
      drawCatFrame(ctx, oppDir, oppFrame, ox, oy, tile * 1.05)
    } else {
      drawEnt(st.opp, 'cat', BUDDY_OV)
    }
  }
  drawEnt(st.mon, 'monster')
  // Centre character — either my cat (normal) or the buddy (spectator).
  // Direction priority: intent → smoothing delta → last remembered.
  // If I've escaped and buddy hasn't, I'm hidden; the buddy sits centre.
  if (st.myEscaped && !spectating) {
    // Both escaped or dead-time — no centre cat.
  } else if (!(st.stun > 0 && Math.floor(st.stun / 120) % 2)) {
    if (catReady()) {
      let dir = playerDirRef.current
      if (p.want) {
        const [wx, wy] = p.want
        dir = dirFromDelta(wx, wy, dir)
      } else {
        const dx = p.fx - p.gx, dy = p.fy - p.gy
        if (Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02) dir = dirFromDelta(dx, dy, dir)
      }
      playerDirRef.current = dir
      // Animate whenever the player is trying to move OR still smoothing
      // toward a target — includes the "pressed into a wall" case.
      const wantsMove = !spectating && !!p.want
      const smoothing = Math.abs(p.fx - p.gx) + Math.abs(p.fy - p.gy) > 0.02
      const animating = wantsMove || smoothing
      const frame: CatFrame = animating ? (Math.floor(performance.now() / 160) % 2) as CatFrame : 0
      drawCatFrame(ctx, dir, frame, cx, cy, tile * 1.05)
    } else {
      drawSprite(ctx, 'cat', cx, cy, sp)
    }
  }
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
    ctx.fillStyle = PALETTE.stunFlash
    ctx.fillRect(0, 0, W, H)
  }
  if (st.state === 'win') {
    ctx.fillStyle = PALETTE.winFade
    ctx.fillRect(0, 0, W, H)
    drawParticles(ctx, st.parts)
  }
}

/** Minimap key hint — 노란 원. 합류 후 열쇠 미획득이면 위치 노출. */
function MinimapKey({ keyPos, nCells }: { keyPos: { gx: number; gy: number }; nCells: number }) {
  const cx = 20 + ((keyPos.gx / Math.max(1, nCells - 1)) - 0.5) * 28
  const cy = 20 + ((keyPos.gy / Math.max(1, nCells - 1)) - 0.5) * 28
  return (
    <circle
      cx={cx}
      cy={cy}
      r="2"
      fill="var(--game-warn-gold)"
      stroke="var(--border-strong)"
      strokeWidth="0.6"
      clipPath="url(#mini-clip)"
    >
      <animate attributeName="opacity" values="0.55;1;0.55" dur="1.1s" repeatCount="indefinite" />
    </circle>
  )
}

/** Minimap exit star — magenta, only rendered inside the last-30s
 * window. Same coord math as the pip so both share the disc origin. */
function MinimapExit({ exit, nCells }: { exit: { gx: number; gy: number }; nCells: number }) {
  const cx = 20 + ((exit.gx / Math.max(1, nCells - 1)) - 0.5) * 28
  const cy = 20 + ((exit.gy / Math.max(1, nCells - 1)) - 0.5) * 28
  const points = Array.from({ length: 10 }).map((_, i) => {
    const r = i % 2 === 0 ? 3.2 : 1.4
    const a = (Math.PI * 2 * i) / 10 - Math.PI / 2
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`
  }).join(' ')
  return (
    <polygon
      points={points}
      fill="var(--game-map-exit-magenta)"
      stroke="var(--border-strong)"
      strokeWidth="0.8"
      clipPath="url(#mini-clip)"
    >
      <animate attributeName="opacity" values="0.5;1;0.5" dur="0.9s" repeatCount="indefinite" />
    </polygon>
  )
}
