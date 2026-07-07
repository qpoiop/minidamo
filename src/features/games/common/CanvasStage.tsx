import { useEffect, useRef } from 'react'

/**
 * Shared canvas host for canvas-based games.
 *
 * Contract:
 *   - Sizes the internal buffer to devicePixelRatio.
 *   - Owns the rAF loop and calls `onFrame(ctx, dt, stageSize)` every
 *     paint. `dt` is delta-milliseconds; clamped to 48 ms to survive
 *     tab-restore stalls without teleporting objects.
 *   - Delegates pointer + touch input to `onInput` — normalized {x, y}
 *     in stage-coordinate space (viewport-independent). Handlers keep
 *     the same signature across down / move / up so game code stays
 *     linear.
 *   - Never manages game state itself. Callers keep the authoritative
 *     scene refs and mutate them from onFrame / onInput.
 *
 * Games this hosts (planned): 우다다 · 냥탈출. See ARCHITECTURE §11.
 */

export interface StageSize {
  width: number;
  height: number;
  dpr: number;
}

export interface StagePoint {
  x: number;
  y: number;
}

export interface CanvasInput {
  onDown?: (p: StagePoint, pointerId: number) => void;
  onMove?: (p: StagePoint, pointerId: number) => void;
  onUp?: (p: StagePoint, pointerId: number) => void;
}

interface CanvasStageProps {
  /** Virtual stage width/height — everything the game renders lives inside this box. */
  virtualWidth: number;
  virtualHeight: number;
  /** Draw callback. Coordinates are already in virtual (pre-DPR) space. */
  onFrame: (ctx: CanvasRenderingContext2D, dtMs: number, size: StageSize) => void;
  /** Pointer input in virtual coordinates. */
  input?: CanvasInput;
  className?: string;
  /** aria-label for the interactive canvas. */
  label?: string;
}

export function CanvasStage({
  virtualWidth,
  virtualHeight,
  onFrame,
  input,
  className,
  label,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number>(performance.now())
  const sizeRef = useRef<StageSize>({ width: virtualWidth, height: virtualHeight, dpr: 1 })
  const inputRef = useRef<CanvasInput | undefined>(input)
  useEffect(() => { inputRef.current = input }, [input])
  const onFrameRef = useRef(onFrame)
  useEffect(() => { onFrameRef.current = onFrame }, [onFrame])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const parent = canvas.parentElement
      const parentW = parent?.clientWidth ?? virtualWidth
      const parentH = parent?.clientHeight ?? virtualHeight
      // Fit virtual box into parent while preserving aspect ratio.
      const aspect = virtualWidth / virtualHeight
      let cssW = parentW
      let cssH = cssW / aspect
      if (cssH > parentH) {
        cssH = parentH
        cssW = cssH * aspect
      }
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
      // Scale so game code always draws in virtual coordinates.
      const scale = (cssW / virtualWidth) * dpr
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      sizeRef.current = { width: virtualWidth, height: virtualHeight, dpr }
    }
    resize()
    window.addEventListener('resize', resize)

    const step = (ts: number) => {
      const dt = Math.min(48, ts - lastTsRef.current)
      lastTsRef.current = ts
      ctx.clearRect(0, 0, virtualWidth, virtualHeight)
      onFrameRef.current(ctx, dt, sizeRef.current)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)

    // Pointer normalisation: canvas rect → virtual coords.
    const toVirt = (clientX: number, clientY: number): StagePoint => {
      const r = canvas.getBoundingClientRect()
      const relX = clientX - r.left
      const relY = clientY - r.top
      return {
        x: (relX / r.width) * virtualWidth,
        y: (relY / r.height) * virtualHeight,
      }
    }
    const handleDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      inputRef.current?.onDown?.(toVirt(e.clientX, e.clientY), e.pointerId)
    }
    const handleMove = (e: PointerEvent) => {
      inputRef.current?.onMove?.(toVirt(e.clientX, e.clientY), e.pointerId)
    }
    const handleUp = (e: PointerEvent) => {
      try { canvas.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      inputRef.current?.onUp?.(toVirt(e.clientX, e.clientY), e.pointerId)
    }
    canvas.addEventListener('pointerdown', handleDown)
    canvas.addEventListener('pointermove', handleMove)
    canvas.addEventListener('pointerup', handleUp)
    canvas.addEventListener('pointercancel', handleUp)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handleDown)
      canvas.removeEventListener('pointermove', handleMove)
      canvas.removeEventListener('pointerup', handleUp)
      canvas.removeEventListener('pointercancel', handleUp)
    }
  }, [virtualWidth, virtualHeight])

  return <canvas ref={canvasRef} className={className} aria-label={label} />
}
