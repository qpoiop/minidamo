/*
 * Lightweight canvas-2D particle engine. No 3D libs, no external deps.
 *
 * Everything runs off a single rAF pump and a shared particle pool.
 * Each Effect family adds particles in one burst; the pump advances
 * physics + fades until each particle's life reaches 0.
 *
 * Public entry: fire(canvas, kind, options). Consumers should keep the
 * canvas mounted at the top of the tree so global effects (e.g. game
 * win confetti) work regardless of which screen requested them.
 */

export type EffectKind = 'ripple' | 'confetti' | 'spark-burst' | 'petal-fall' | 'metallic-line'

interface Particle {
  kind: 'ripple' | 'confetti' | 'spark' | 'petal' | 'line';
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  extra?: Record<string, number>;
}

interface FireOptions {
  x?: number;      // px, viewport coord
  y?: number;
  color?: string;
  count?: number;
  duration?: number;
  extra?: Record<string, number>;
  targetPoints?: Array<{ x: number; y: number }>; // used by metallic-line
}

const DEFAULT_PALETTE = [
  '#c7e06a', // fg-accent
  '#9bbc0f', // accent-primary
  '#8bac0f',
  '#c2331f', // arcade red
  '#e7c81f', // yellow
  '#2a5db0', // arcade blue
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function makeRipple(x: number, y: number, color: string): Particle {
  return {
    kind: 'ripple',
    x, y,
    vx: 0, vy: 0, ax: 0, ay: 0,
    size: 0,
    rotation: 0, rotationSpeed: 0,
    color,
    alpha: 0.7,
    life: 500,
    maxLife: 500,
  }
}

function makeSpark(x: number, y: number, color: string): Particle {
  const angle = Math.random() * Math.PI * 2
  const speed = 220 + Math.random() * 320
  return {
    kind: 'spark',
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    ax: 0,
    ay: 600, // gravity px/s²
    size: 3 + Math.random() * 4,
    rotation: 0,
    rotationSpeed: 0,
    color,
    alpha: 1,
    life: 800 + Math.random() * 500,
    maxLife: 1200,
  }
}

function makeConfetti(x: number, y: number, color: string): Particle {
  return {
    kind: 'confetti',
    x, y,
    vx: (Math.random() - 0.5) * 380,
    vy: -300 - Math.random() * 220,
    ax: (Math.random() - 0.5) * 60,
    ay: 700,
    size: 8 + Math.random() * 8,
    rotation: Math.random() * Math.PI,
    rotationSpeed: (Math.random() - 0.5) * 12,
    color,
    alpha: 1,
    life: 2500 + Math.random() * 800,
    maxLife: 3200,
  }
}

function makePetal(x: number, y: number, color: string): Particle {
  return {
    kind: 'petal',
    x, y,
    vx: (Math.random() - 0.5) * 140,
    vy: 80 + Math.random() * 120,
    ax: (Math.random() - 0.5) * 40,
    ay: 20, // very light gravity, floaty
    size: 10 + Math.random() * 8,
    rotation: Math.random() * Math.PI,
    rotationSpeed: (Math.random() - 0.5) * 4,
    color,
    alpha: 1,
    life: 4000 + Math.random() * 1500,
    maxLife: 5500,
  }
}

function makeMetallicLine(x0: number, y0: number, x1: number, y1: number, color: string, delayMs: number): Particle {
  return {
    kind: 'line',
    x: x0, y: y0,
    vx: 0, vy: 0, ax: 0, ay: 0,
    size: 6,
    rotation: 0, rotationSpeed: 0,
    color,
    alpha: 0,
    life: 900,
    maxLife: 900,
    extra: { x1, y1, delay: delayMs, elapsed: 0, progress: 0 },
  }
}

interface EngineState {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  particles: Particle[];
  rafId: number | null;
  lastTs: number;
  dpr: number;
}

export interface EffectsEngine {
  fire: (kind: EffectKind, opts?: FireOptions) => void;
  destroy: () => void;
  resize: () => void;
}

export function createEffectsEngine(canvas: HTMLCanvasElement): EffectsEngine {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  const state: EngineState = {
    ctx, canvas,
    particles: [],
    rafId: null,
    lastTs: performance.now(),
    dpr: Math.min(2, window.devicePixelRatio || 1),
  }

  const resize = () => {
    const { canvas } = state
    const w = window.innerWidth
    const h = window.innerHeight
    state.dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.floor(w * state.dpr)
    canvas.height = Math.floor(h * state.dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const step = (ts: number) => {
    const dt = Math.min(60, ts - state.lastTs) / 1000
    state.lastTs = ts

    ctx.clearRect(0, 0, canvas.width / state.dpr, canvas.height / state.dpr)

    const remaining: Particle[] = []
    for (const p of state.particles) {
      p.life -= dt * 1000
      if (p.kind === 'line') {
        p.extra!.elapsed += dt * 1000
        const delayAdjusted = p.extra!.elapsed - p.extra!.delay
        if (delayAdjusted > 0) {
          const dur = p.maxLife * 0.6
          p.extra!.progress = Math.min(1, delayAdjusted / dur)
          p.alpha = delayAdjusted < dur ? 1 : Math.max(0, 1 - (delayAdjusted - dur) / (p.maxLife * 0.4))
        }
      } else if (p.kind === 'ripple') {
        p.size += dt * 220
        p.alpha = Math.max(0, p.life / p.maxLife * 0.7)
      } else {
        p.vx += p.ax * dt
        p.vy += p.ay * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rotation += p.rotationSpeed * dt
        p.alpha = Math.max(0, p.life / p.maxLife)
      }
      if (p.life <= 0) continue
      remaining.push(p)

      // Draw
      ctx.save()
      ctx.globalAlpha = p.alpha
      ctx.fillStyle = p.color
      ctx.strokeStyle = p.color
      if (p.kind === 'ripple') {
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.stroke()
      } else if (p.kind === 'spark') {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'confetti') {
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3)
      } else if (p.kind === 'petal') {
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'line') {
        const { x1, y1, progress } = p.extra as { x1: number; y1: number; progress: number }
        const curX = p.x + (x1 - p.x) * progress
        const curY = p.y + (y1 - p.y) * progress
        ctx.lineWidth = 8
        ctx.lineCap = 'round'
        // Metallic gradient along the line
        const grad = ctx.createLinearGradient(p.x, p.y, x1, y1)
        grad.addColorStop(0, p.color)
        grad.addColorStop(0.5, '#ffffff')
        grad.addColorStop(1, p.color)
        ctx.strokeStyle = grad
        ctx.shadowColor = p.color
        ctx.shadowBlur = 22
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(curX, curY)
        ctx.stroke()
      }
      ctx.restore()
    }
    state.particles = remaining

    state.rafId = requestAnimationFrame(step)
  }
  state.rafId = requestAnimationFrame(step)

  const fire = (kind: EffectKind, opts: FireOptions = {}) => {
    const x = opts.x ?? window.innerWidth / 2
    const y = opts.y ?? window.innerHeight / 2
    switch (kind) {
      case 'ripple': {
        state.particles.push(makeRipple(x, y, opts.color ?? '#c7e06a'))
        break
      }
      case 'spark-burst': {
        const n = opts.count ?? 20
        for (let i = 0; i < n; i++) state.particles.push(makeSpark(x, y, opts.color ?? pick(DEFAULT_PALETTE)))
        break
      }
      case 'confetti': {
        const n = opts.count ?? 80
        for (let i = 0; i < n; i++) state.particles.push(makeConfetti(x, y, opts.color ?? pick(DEFAULT_PALETTE)))
        break
      }
      case 'petal-fall': {
        const n = opts.count ?? 40
        for (let i = 0; i < n; i++) {
          const px = Math.random() * window.innerWidth
          const py = -20 - Math.random() * 100
          state.particles.push(makePetal(px, py, opts.color ?? pick(DEFAULT_PALETTE)))
        }
        break
      }
      case 'metallic-line': {
        const pts = opts.targetPoints ?? []
        if (pts.length < 2) return
        for (let i = 0; i < pts.length - 1; i++) {
          state.particles.push(makeMetallicLine(
            pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y,
            opts.color ?? '#c7e06a',
            i * 260,
          ))
        }
        break
      }
    }
  }

  const destroy = () => {
    if (state.rafId != null) cancelAnimationFrame(state.rafId)
    window.removeEventListener('resize', resize)
    state.particles = []
  }

  return { fire, destroy, resize }
}
