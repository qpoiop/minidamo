import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { WudadaGameOver } from './WudadaGameOver'
import { WudadaCrashOverlay } from './WudadaCrashOverlay'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { RegistryGuide } from '../common/RegistryGuide'
import { useEffectsFire } from '../../../effects/EffectsProvider'
import {
  drawSprite, INV_OV, stepParticles, drawParticles, burstParticles,
} from '../common/sprites'
import type { Particle, SpriteName } from '../common/sprites'
import { PALETTE } from '../../../styles/palette'
import { catReady, drawCatFrame } from '../common/spriteSheets'
import type { CatFrame } from '../common/spriteSheets'
import { useRoleParticipants } from '../common/useRoleParticipants'

export type WudadaMode = 1 | 2 | 3   // 1 서바이벌 / 2 타임어택 / 3 스프린트
const TIMEATTACK_LIMIT_MS = 60000
const TIMEATTACK_HIT_PENALTY_MS = 1500
const SPRINT_TARGET_M = 1200

// Difficulty ramp — every 500m the base speed bumps + spawn floor
// tightens. Continuous drift was too flat mid-run; discrete milestones
// give a clear "this got harder" beat.
const MILESTONE_DIST = 500
const MILESTONE_SPEED_BUMP = 0.55
const MILESTONE_SPAWN_FLOOR_CUT = 40   // ms shaved off the spawn floor
const MIN_SPAWN_FLOOR = 260             // never spawn faster than this

interface WudadaProps {
  players: PlayerInfo[];
  peerId: string;
  isHost?: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  mode?: WudadaMode;
}

/**
 * 우다다 대시 — 1:1 서바이벌 러너 (spec: planning/imports/§1a).
 *
 * Each player runs their own local session (private world). We sync
 * distance/state via P2P so both players see the opponent's live score
 * on the HUD. Winner = last one standing (higher distance if both
 * crash within the round).
 */

// Virtual stage (canvas draws in these coordinates; CanvasStage-style
// DPR-aware scaling is applied inline for parity with the design file).
const STAGE_W = 260
const STAGE_H = 420
const LANES = 5   // spec §우다다 대시: 좌우 5레인
const LANE_W = STAGE_W / LANES
const CAT_Y = STAGE_H - 42
const HIT_RADIUS = 22
const OBSTACLE_TYPES: SpriteName[] = ['crate', 'puddle', 'plant', 'dog']

interface Obstacle { lane: number; y: number; type: SpriteName; }
interface Item { lane: number; y: number; type: 'fish' | 'yarn'; dead?: boolean; }

interface RunnerState {
  lane: number;         // integer 0..LANES-1 (target)
  laneX: number;        // smoothed 0..LANES-1 (visual)
  obs: Obstacle[];
  items: Item[];
  parts: Particle[];
  scroll: number;
  speed: number;
  dist: number;
  state: 'play' | 'over';
  spawnAcc: number;
  inv: number;          // invulnerable ms remaining
  spawnFloor: number;   // current spawn gap floor (ms); tightens per milestone
  milestone: number;    // next MILESTONE_DIST checkpoint I haven't crossed yet
}

function initialRunner(): RunnerState {
  return {
    lane: 2, laneX: 2,   // start centre lane (of 5)
    obs: [], items: [], parts: [],
    scroll: 0, speed: 2.2, dist: 0,
    state: 'play', spawnAcc: 0, inv: 0,
    spawnFloor: 430, milestone: MILESTONE_DIST,
  }
}

export function Wudada({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
  mode = 1,
}: WudadaProps) {
  const [guideOpen, setGuideOpen] = useState(false)
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [dist, setDist] = useState(0)
  const [speedMul, setSpeedMul] = useState(1)
  const [oppDist, setOppDist] = useState(0)
  const [oppCrashed, setOppCrashed] = useState(false)
  const [runnerOver, setRunnerOver] = useState(false)
  const [crashOverlayDismissed, setCrashOverlayDismissed] = useState(false)
  const [timerLabel, setTimerLabel] = useState(mode === 2 ? '60' : '')
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])
  // Time-attack: total wall-clock left; drains during play.
  const modeStartRef = useRef<number>(performance.now())
  const timePenaltyRef = useRef<number>(0)
  const fire = useEffectsFire()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const runnerRef = useRef<RunnerState>(initialRunner())
  const lastCrashSentRef = useRef(false)
  const lastDistSentRef = useRef(0)

  const { myName, opponentName } = useRoleParticipants(players, isHost ?? true)

  // ---- P2P inbound: opponent distance + crash signals ----------------------
  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      if (msg.type === 'GAME_ACTION') {
        const { actionType, hostScore } = msg.payload
        if (actionType === 'RUN_TICK' && typeof hostScore === 'number') {
          setOppDist(hostScore)
        } else if (actionType === 'RUN_CRASH' && typeof hostScore === 'number') {
          setOppDist(hostScore)
          setOppCrashed(true)
        }
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [])

  // ---- Winner resolution -----------
  // Survival: last one standing wins; tie-break on distance.
  // Time-attack: 60s hard limit. Collision inflicts 1.5s penalty but
  //   doesn't end the round. Highest distance at time-up wins.
  // Sprint: first to SPRINT_TARGET_M wins. If nobody reaches it before
  //   both crash, further tie-break by distance.
  useEffect(() => {
    if (gameWinner) return
    const rn = runnerRef.current
    if (mode === 3 && dist >= SPRINT_TARGET_M) {
      setGameWinner(myName)
      return
    }
    if (mode === 3 && oppDist >= SPRINT_TARGET_M) {
      setGameWinner(opponentName)
      return
    }
    if (mode === 1) {
      if (rn.state !== 'over') return
      if (!oppCrashed) return
      if (dist > oppDist) setGameWinner(myName)
      else if (oppDist > dist) setGameWinner(opponentName)
      else setGameWinner('무승부')
    }
  }, [dist, oppDist, oppCrashed, gameWinner, myName, opponentName, mode])

  // Time-attack timer + auto-end at 0.
  useEffect(() => {
    if (mode !== 2) return
    if (gameWinner) return
    modeStartRef.current = performance.now()
    timePenaltyRef.current = 0
    const id = setInterval(() => {
      const elapsed = performance.now() - modeStartRef.current + timePenaltyRef.current
      const remainMs = Math.max(0, TIMEATTACK_LIMIT_MS - elapsed)
      const remainSec = Math.ceil(remainMs / 1000)
      setTimerLabel(String(remainSec))
      if (remainMs <= 0) {
        if (dist > oppDist) setGameWinner(myName)
        else if (oppDist > dist) setGameWinner(opponentName)
        else setGameWinner('무승부')
      }
    }, 200)
    return () => clearInterval(id)
  }, [mode, gameWinner, dist, oppDist, myName, opponentName])

  // ---- Input ---------------------------------------------------------------
  const moveLane = useCallback((dir: -1 | 1) => {
    const rn = runnerRef.current
    if (rn.state !== 'play') return
    rn.lane = Math.max(0, Math.min(LANES - 1, rn.lane + dir))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') moveLane(-1)
      else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') moveLane(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [moveLane])

  // ---- Match reset ---------------------------------------------------------
  const applyMatchReset = useCallback(() => {
    runnerRef.current = initialRunner()
    setDist(0)
    setSpeedMul(1)
    setOppDist(0)
    setOppCrashed(false)
    setRunnerOver(false)
    setCrashOverlayDismissed(false)
    setGameWinner(null)
    lastCrashSentRef.current = false
    lastDistSentRef.current = 0
  }, [])

  const handleRestartMatch = useCallback(() => {
    applyMatchReset()
    sendMessage({
      type: 'GAME_RESET', senderId: peerId, timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
  }, [applyMatchReset, peerId, sendMessage])

  // ---- Game loop (rAF, dt-based) -------------------------------------------
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
      const rn = runnerRef.current

      if (rn.state === 'play') {
        // Continuous ramp lightened (0.0002 → 0.00008) — the heavy
        // lifting is now the milestone bump below so the difficulty
        // curve is stepped, not linear.
        rn.speed = Math.min(7.5, rn.speed + 0.00008 * dt)
        rn.scroll += rn.speed
        rn.dist += rn.speed * 0.05
        // 500m milestone — bump base speed + tighten spawn floor +
        // fire a "N00m" spark burst so the pace change reads.
        while (rn.dist >= rn.milestone) {
          rn.speed += MILESTONE_SPEED_BUMP
          rn.spawnFloor = Math.max(MIN_SPAWN_FLOOR, rn.spawnFloor - MILESTONE_SPAWN_FLOOR_CUT)
          fire('spark-burst', {
            x: window.innerWidth / 2, y: window.innerHeight / 3,
            count: 24, color: PALETTE.fgAccent,
          })
          rn.milestone += MILESTONE_DIST
        }
        if (rn.inv > 0) rn.inv -= dt
        rn.spawnAcc += dt
        // Gap floor comes from the milestone-tightened spawnFloor now,
        // not the earlier continuous `1050 - dist*0.5`.
        const gap = Math.max(rn.spawnFloor, 1050 - rn.dist * 0.4)
        if (rn.spawnAcc > gap) {
          rn.spawnAcc = 0
          const lane = Math.floor(Math.random() * LANES)
          if (Math.random() < 0.2) {
            rn.items.push({ lane, y: -30, type: Math.random() < 0.5 ? 'fish' : 'yarn' })
          } else {
            const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)]
            rn.obs.push({ lane, y: -30, type })
          }
        }
        rn.laneX += (rn.lane - rn.laneX) * 0.28
        for (const o of rn.obs) o.y += rn.speed
        for (const it of rn.items) it.y += rn.speed
        // Collision — obstacle in same lane at CAT_Y ± HIT_RADIUS.
        for (const o of rn.obs) {
          if (o.lane === rn.lane && Math.abs(o.y - CAT_Y) < HIT_RADIUS && rn.inv <= 0) {
            burstParticles(rn.parts, LANE_W * (rn.laneX + 0.5), CAT_Y, 34, false)
            fire('spark-burst', {
              x: window.innerWidth / 2, y: window.innerHeight / 2,
              count: 30, color: PALETTE.wudadaSpark,
            })
            if (modeRef.current === 2) {
              // Time-attack: penalty instead of ending the round. Also
              // give a short invulnerability so the same obstacle doesn't
              // triple-tag the runner in the following frames.
              timePenaltyRef.current += TIMEATTACK_HIT_PENALTY_MS
              rn.inv = 400
              o.y = STAGE_H + 60   // remove this obstacle from the field
            } else {
              rn.state = 'over'
              setRunnerOver(true)
            }
            break
          }
        }
        // Item pickup
        for (const it of rn.items) {
          if (!it.dead && it.lane === rn.lane && Math.abs(it.y - CAT_Y) < HIT_RADIUS) {
            it.dead = true
            // 3.5s invincibility so the boost is actually usable —
            // 2.1s was gone before the runner could clear one or two
            // upcoming obstacles.
            if (it.type === 'fish') rn.inv = 3500
            // yarn: cosmetic bonus for now (spec doesn't spell out effect
            // beyond visuals; keep as small distance-score boost)
            if (it.type === 'yarn') rn.dist += 8
          }
        }
        rn.obs = rn.obs.filter((o) => o.y < STAGE_H + 40)
        rn.items = rn.items.filter((it) => it.y < STAGE_H + 40 && !it.dead)

        // React state (throttle setState to every ~120ms so we don't
        // render every frame).
        const distNow = Math.floor(rn.dist)
        if (distNow !== Math.floor(lastDistSentRef.current)) {
          setDist(distNow)
          setSpeedMul(rn.speed / 2.2)
          // Broadcast throttled tick (~5 Hz)
          if (distNow - lastDistSentRef.current >= 3 && isOpponentOnline) {
            lastDistSentRef.current = distNow
            sendMessage({
              type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
              payload: { actionType: 'RUN_TICK', hostScore: distNow },
            })
          }
        }
      } else if (rn.state === 'over') {
        stepParticles(rn.parts, STAGE_W, STAGE_H)
        if (!lastCrashSentRef.current && isOpponentOnline) {
          lastCrashSentRef.current = true
          sendMessage({
            type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
            payload: { actionType: 'RUN_CRASH', hostScore: Math.floor(rn.dist) },
          })
        }
      }
      render(ctx, rn)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [fire, sendMessage, peerId, isOpponentOnline])

  return (
    <div className="game-screen">
      <GameHeader
        code="WUDADA"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost ?? true}
      />
      <GameTurnStrip
        turnText={mode === 2
          ? `${timerLabel}s · ${Math.floor(dist)}m`
          : mode === 3
            ? `${Math.floor(dist)} / ${SPRINT_TARGET_M}m`
            : `${Math.floor(dist)}m`}
        connectionLabel={isOpponentOnline ? `${myName} ${Math.floor(dist)}m · ${opponentName} ${oppDist}m` : '재연결 중…'}
        variant="default"
      />

      <div className="game-board-region wudada-board-region">
        <canvas ref={canvasRef} className="wudada-canvas" aria-label="우다다 게임 화면" />
        <div className="wudada-hud">
          <span>×{speedMul.toFixed(1)}</span>
        </div>
        <div className="wudada-controls">
          <button
            type="button"
            className="wudada-btn"
            onPointerDown={(e) => { e.preventDefault(); moveLane(-1) }}
            aria-label="왼쪽 레인"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M15 6l-6 6 6 6z" />
            </svg>
          </button>
          <button
            type="button"
            className="wudada-btn"
            onPointerDown={(e) => { e.preventDefault(); moveLane(1) }}
            aria-label="오른쪽 레인"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M9 6l6 6-6 6z" />
            </svg>
          </button>
        </div>

        {/* Post-crash overlay — shows personal record + live opponent
         * distance. Player can dismiss with "관전하기" to keep watching
         * the peer's HUD until BOTH have crashed (then WudadaGameOver
         * fires). */}
        {runnerOver && !gameWinner && (
          <WudadaCrashOverlay
            dist={Math.floor(dist)}
            oppDist={oppDist}
            oppCrashed={oppCrashed}
            opponentName={opponentName}
            onSpectate={() => setCrashOverlayDismissed(true)}
            dismissed={crashOverlayDismissed}
          />
        )}
      </div>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.id === peerId,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{p.id === peerId ? `${Math.floor(dist)}m` : `${oppDist}m`}</span>,
        }))}
        hint="장애물 피하고 물고기 먹기"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <RegistryGuide gameId="wudada" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {gameWinner && (
        <WudadaGameOver
          outcome={gameWinner === '무승부' ? 'draw' : gameWinner === myName ? 'win' : 'lose'}
          myDist={Math.floor(dist)}
          oppDist={oppDist}
          myName={myName}
          opponentName={opponentName}
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

/* ------------------------------------------------------------------
 * Renderer — draws the road, obstacles, items, cat, and particles.
 * Kept out of the component body to keep the JSX skinny.
 * ------------------------------------------------------------------ */

function render(ctx: CanvasRenderingContext2D, rn: RunnerState): void {
  // Road base
  ctx.fillStyle = PALETTE.bgInset
  ctx.fillRect(0, 0, STAGE_W, STAGE_H)
  // Road stripes (parallax with scroll)
  const off = rn.scroll % 44
  ctx.fillStyle = PALETTE.wudadaTrackBg
  for (let y = -44 + off; y < STAGE_H; y += 44) ctx.fillRect(0, y, STAGE_W, 22)
  // Rails
  const roff = rn.scroll % 20
  ctx.fillStyle = PALETTE.wudadaLaneDivider
  for (let y = -20 + roff; y < STAGE_H; y += 20) {
    ctx.fillRect(0, y, 6, 10)
    ctx.fillRect(STAGE_W - 6, y, 6, 10)
  }
  // Lane dashes
  ctx.fillStyle = PALETTE.wudadaShoulder
  const doff = rn.scroll % 30
  for (let x = 1; x < LANES; x++) {
    for (let y = -30 + doff; y < STAGE_H; y += 30) ctx.fillRect(LANE_W * x - 1.5, y, 3, 16)
  }
  // Obstacles / items
  const sp = (LANE_W * 0.62) / 12
  for (const o of rn.obs) drawSprite(ctx, o.type, LANE_W * (o.lane + 0.5), o.y, sp)
  for (const it of rn.items) drawSprite(ctx, it.type, LANE_W * (it.lane + 0.5), it.y, sp)
  // Cat
  const catX = LANE_W * (rn.laneX + 0.5)
  const csp = (LANE_W * 0.66) / 12
  if (rn.inv > 0) {
    ctx.strokeStyle = PALETTE.fgAccent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(catX, CAT_Y, LANE_W * 0.42, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (rn.state !== 'over') {
    if (catReady()) {
      // Runner cat = "up" (back view) sprite. A/B frame every 140ms so
      // the walking cycle reads as a run at the game's scroll speed.
      const size = LANE_W * 0.72
      const frame: CatFrame = (Math.floor(performance.now() / 140) % 2) as CatFrame
      drawCatFrame(ctx, 'up', frame, catX, CAT_Y, size)
    } else {
      drawSprite(ctx, 'cat', catX, CAT_Y, csp, rn.inv > 0 ? INV_OV : undefined)
    }
  }
  if (rn.state === 'over') drawParticles(ctx, rn.parts)
}
