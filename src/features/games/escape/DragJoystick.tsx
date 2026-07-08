import { useCallback, useEffect, useRef, useState } from 'react'

interface DragJoystickProps {
  onDir: (dir: [number, number] | null) => void;
}

/**
 * Circular semi-transparent joystick pad. Touch/mouse down anchors at
 * the tap point; movement produces a normalised vector snapped to the
 * dominant axis for clean ±1 grid moves. Release clears the vector.
 *
 * iOS Safari NOTE (2026-07-09 rewrite): pointer events (esp.
 * setPointerCapture) misbehave inside our canvas-adjacent stack — the
 * initial press fires, moves outside the pad don't. This version
 * attaches every listener on `window` after the initial touchstart /
 * mousedown, avoiding pointer capture entirely. Also uses
 * `document.addEventListener` with `{ passive: false, capture: true }`
 * so the tap can preventDefault the iOS page-scroll gesture even when
 * the touch lands on a child pseudo-element.
 */
const RING_RADIUS = 44
const NUB_RADIUS = 22
const DEAD_ZONE = 12
const AXIS_LOCK_RATIO = 1.2

export function DragJoystick({ onDir }: DragJoystickProps) {
  const padRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<{ x: number; y: number } | null>(null)
  const activeTouchIdRef = useRef<number | null>(null)
  const mouseActiveRef = useRef(false)
  const [nub, setNub] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const lastDirRef = useRef<[number, number] | null>(null)

  const setDir = useCallback((d: [number, number] | null) => {
    const last = lastDirRef.current
    if (d && last && d[0] === last[0] && d[1] === last[1]) return
    if (!d && !last) return
    lastDirRef.current = d
    onDir(d)
  }, [onDir])

  const dispatchFromDelta = useCallback((dx: number, dy: number) => {
    const mag = Math.hypot(dx, dy)
    const clampMag = Math.min(mag, RING_RADIUS - NUB_RADIUS * 0.4)
    const nx = mag > 0 ? (dx / mag) * clampMag : 0
    const ny = mag > 0 ? (dy / mag) * clampMag : 0
    setNub({ x: nx, y: ny })
    if (mag < DEAD_ZONE) { setDir(null); return }
    const ax = Math.abs(dx), ay = Math.abs(dy)
    if (ax > ay * AXIS_LOCK_RATIO) setDir([dx > 0 ? 1 : -1, 0])
    else if (ay > ax * AXIS_LOCK_RATIO) setDir([0, dy > 0 ? 1 : -1])
  }, [setDir])

  const endDrag = useCallback(() => {
    anchorRef.current = null
    activeTouchIdRef.current = null
    mouseActiveRef.current = false
    setNub({ x: 0, y: 0 })
    setDir(null)
  }, [setDir])

  // Global listeners for the drag lifetime — installed once on mount.
  useEffect(() => {
    const onTouchMoveGlobal = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return
      const t = Array.from(e.changedTouches).find((tc) => tc.identifier === activeTouchIdRef.current)
      if (!t) return
      const a = anchorRef.current
      if (!a) return
      dispatchFromDelta(t.clientX - a.x, t.clientY - a.y)
      e.preventDefault()
    }
    const onTouchEndGlobal = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return
      const ended = Array.from(e.changedTouches).some((tc) => tc.identifier === activeTouchIdRef.current)
      if (!ended) return
      endDrag()
    }
    const onMouseMoveGlobal = (e: MouseEvent) => {
      if (!mouseActiveRef.current) return
      const a = anchorRef.current
      if (!a) return
      dispatchFromDelta(e.clientX - a.x, e.clientY - a.y)
    }
    const onMouseUpGlobal = () => { if (mouseActiveRef.current) endDrag() }
    document.addEventListener('touchmove',   onTouchMoveGlobal,  { passive: false, capture: true })
    document.addEventListener('touchend',    onTouchEndGlobal,   { passive: true,  capture: true })
    document.addEventListener('touchcancel', onTouchEndGlobal,   { passive: true,  capture: true })
    document.addEventListener('mousemove',   onMouseMoveGlobal)
    document.addEventListener('mouseup',     onMouseUpGlobal)
    return () => {
      document.removeEventListener('touchmove',   onTouchMoveGlobal,  { capture: true } as EventListenerOptions)
      document.removeEventListener('touchend',    onTouchEndGlobal,   { capture: true } as EventListenerOptions)
      document.removeEventListener('touchcancel', onTouchEndGlobal,   { capture: true } as EventListenerOptions)
      document.removeEventListener('mousemove',   onMouseMoveGlobal)
      document.removeEventListener('mouseup',     onMouseUpGlobal)
    }
  }, [dispatchFromDelta, endDrag])

  // touchstart / mousedown attached directly on the pad via addEventListener
  // so we can pass `{ passive: false }`. React's synthetic onTouchStart
  // uses a passive listener under the hood which breaks preventDefault on
  // iOS.
  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    const onTouchStart = (e: TouchEvent) => {
      if (activeTouchIdRef.current !== null) return
      const t = e.changedTouches[0]
      if (!t) return
      activeTouchIdRef.current = t.identifier
      anchorRef.current = { x: t.clientX, y: t.clientY }
      dispatchFromDelta(0, 0)
      e.preventDefault()
    }
    const onMouseDown = (e: MouseEvent) => {
      if (mouseActiveRef.current) return
      mouseActiveRef.current = true
      anchorRef.current = { x: e.clientX, y: e.clientY }
      dispatchFromDelta(0, 0)
    }
    pad.addEventListener('touchstart', onTouchStart, { passive: false })
    pad.addEventListener('mousedown',  onMouseDown)
    return () => {
      pad.removeEventListener('touchstart', onTouchStart)
      pad.removeEventListener('mousedown',  onMouseDown)
    }
  }, [dispatchFromDelta])

  useEffect(() => () => setDir(null), [setDir])

  return (
    <div
      ref={padRef}
      className="escape-joystick"
      role="application"
      aria-label="이동 조이스틱"
    >
      <div className="escape-joystick-ring" aria-hidden="true" />
      <div
        className="escape-joystick-nub"
        style={{ transform: `translate(${nub.x}px, ${nub.y}px)` }}
        aria-hidden="true"
      />
    </div>
  )
}
