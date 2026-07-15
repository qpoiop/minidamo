import {
  drawSprite, BUDDY_OV, drawParticles,
} from '../common/sprites'
import type { PaletteKey } from '../common/sprites'
import { PALETTE } from '../../../styles/palette'
import { catReady, drawCatFrame, dirFromDelta } from '../common/spriteSheets'
import type { CatDir, CatFrame } from '../common/spriteSheets'
import { N, STAGE_W, STAGE_H } from './escapeEngine'
import type { Entity, EscapeState } from './escapeEngine'

/* ------------------------------------------------------------------
 * Canvas renderer + minimap SVG overlays. Pulled out of Escape.tsx —
 * pure functions of (ctx, state) / (props), no hooks or effects.
 * ------------------------------------------------------------------ */

const playerDirRefHolder: { current: CatDir } = { current: 'down' }
const playerDirRef = playerDirRefHolder

export function render(ctx: CanvasRenderingContext2D, st: EscapeState): void {
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
export function MinimapKey({ keyPos, nCells }: { keyPos: { gx: number; gy: number }; nCells: number }) {
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
export function MinimapExit({ exit, nCells }: { exit: { gx: number; gy: number }; nCells: number }) {
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
