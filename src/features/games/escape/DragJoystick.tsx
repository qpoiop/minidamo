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
 * Pointer-capture is used so drags outside the pad still register.
 * The nub visualises current tilt and stays inside the ring.
 */
const RING_RADIUS = 44
const NUB_RADIUS = 22
// Small dead zone: below this the nub follows the finger for feedback
// but no direction is dispatched, so you can stop the cat mid-corridor
// by nearly-centring your thumb.
const DEAD_ZONE = 12
// Axis lock: dx must exceed dy (or vice versa) by this much to switch
// axes. Prevents diagonal drags from twitching into side branches.
const AXIS_LOCK_RATIO = 1.2

export function DragJoystick({ onDir }: DragJoystickProps) {
  const padRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<{ x: number; y: number } | null>(null)
  const activeIdRef = useRef<number | null>(null)
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
    // Nub follows the finger even inside the dead zone so you get
    // visual feedback of where you are.
    const clampMag = Math.min(mag, RING_RADIUS - NUB_RADIUS * 0.4)
    const nx = mag > 0 ? (dx / mag) * clampMag : 0
    const ny = mag > 0 ? (dy / mag) * clampMag : 0
    setNub({ x: nx, y: ny })

    if (mag < DEAD_ZONE) { setDir(null); return }

    const ax = Math.abs(dx), ay = Math.abs(dy)
    // Ambiguous diagonals keep the previous direction — one axis has
    // to clearly lead before the vector switches. Straight drags feel
    // instant; only near-45° tilts hold.
    if (ax > ay * AXIS_LOCK_RATIO) setDir([dx > 0 ? 1 : -1, 0])
    else if (ay > ax * AXIS_LOCK_RATIO) setDir([0, dy > 0 ? 1 : -1])
    // Else: hold whatever we had (lastDirRef unchanged).
  }, [setDir])

  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeIdRef.current !== null) return
    const pad = padRef.current
    if (!pad) return
    // Anchor at the TOUCH point (not the pad centre) so simply
    // pressing the pad doesn't dispatch a direction. User has to drag
    // past DEAD_ZONE from wherever their finger landed before movement
    // fires.
    anchorRef.current = { x: e.clientX, y: e.clientY }
    activeIdRef.current = e.pointerId
    pad.setPointerCapture(e.pointerId)
    dispatchFromDelta(0, 0)
  }, [dispatchFromDelta])

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeIdRef.current !== e.pointerId) return
    const a = anchorRef.current
    if (!a) return
    dispatchFromDelta(e.clientX - a.x, e.clientY - a.y)
  }, [dispatchFromDelta])

  const clear = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && activeIdRef.current !== e.pointerId) return
    activeIdRef.current = null
    anchorRef.current = null
    setNub({ x: 0, y: 0 })
    setDir(null)
  }, [setDir])

  useEffect(() => () => setDir(null), [setDir])

  return (
    <div
      ref={padRef}
      className="escape-joystick"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
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
