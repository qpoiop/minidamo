import { useCallback, useEffect, useRef, useState } from 'react'

interface DragJoystickProps {
  onDir: (dir: [number, number] | null) => void;
}

/**
 * Circular semi-transparent joystick pad. Touch/mouse down starts a
 * drag anchor at the tap point; movement produces a normalised vector
 * that gets snapped to the dominant axis so the maze receives clean
 * ±1 grid moves. Release clears the vector.
 *
 * iOS Safari NOTE: PointerEvents (esp. `setPointerCapture`) misbehave
 * inside canvas-adjacent Safari contexts — the drag would start but
 * subsequent moves outside the pad wouldn't fire. Switched to raw
 * touch + mouse event listeners registered on `window` for the drag
 * lifetime; every mobile browser handles that consistently.
 */
const RING_RADIUS = 44
const NUB_RADIUS = 22
const DEAD_ZONE = 12
const AXIS_LOCK_RATIO = 1.2

export function DragJoystick({ onDir }: DragJoystickProps) {
  const padRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<{ x: number; y: number } | null>(null)
  const touchIdRef = useRef<number | null>(null)  // active touch identifier for touch events
  const draggingRef = useRef(false)                // true while mouse is down
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

  const beginDrag = useCallback((clientX: number, clientY: number) => {
    anchorRef.current = { x: clientX, y: clientY }
    dispatchFromDelta(0, 0)
  }, [dispatchFromDelta])

  const endDrag = useCallback(() => {
    anchorRef.current = null
    touchIdRef.current = null
    draggingRef.current = false
    setNub({ x: 0, y: 0 })
    setDir(null)
  }, [setDir])

  // Touch — attach non-passive so preventDefault() blocks iOS scroll.
  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    const onTouchStart = (e: TouchEvent) => {
      if (touchIdRef.current !== null) return
      const t = e.changedTouches[0]
      if (!t) return
      touchIdRef.current = t.identifier
      beginDrag(t.clientX, t.clientY)
      e.preventDefault()
    }
    const onTouchMove = (e: TouchEvent) => {
      if (touchIdRef.current === null) return
      const t = Array.from(e.changedTouches).find((tc) => tc.identifier === touchIdRef.current)
      if (!t) return
      const a = anchorRef.current
      if (!a) return
      dispatchFromDelta(t.clientX - a.x, t.clientY - a.y)
      e.preventDefault()
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (touchIdRef.current === null) return
      const ended = Array.from(e.changedTouches).some((tc) => tc.identifier === touchIdRef.current)
      if (!ended) return
      endDrag()
      e.preventDefault()
    }
    pad.addEventListener('touchstart', onTouchStart, { passive: false })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: false })
    window.addEventListener('touchcancel', onTouchEnd, { passive: false })
    return () => {
      pad.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [beginDrag, dispatchFromDelta, endDrag])

  // Mouse — desktop path. Window-level so drags outside the pad still
  // register. `beginDrag` fires from the pad's onMouseDown.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const a = anchorRef.current
      if (!a) return
      dispatchFromDelta(e.clientX - a.x, e.clientY - a.y)
    }
    const onUp = () => { if (draggingRef.current) endDrag() }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dispatchFromDelta, endDrag])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingRef.current) return
    draggingRef.current = true
    beginDrag(e.clientX, e.clientY)
  }, [beginDrag])

  useEffect(() => () => setDir(null), [setDir])

  return (
    <div
      ref={padRef}
      className="escape-joystick"
      onMouseDown={onMouseDown}
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
