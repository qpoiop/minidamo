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
// Wider dead zone + explicit commit threshold so small pad twitches
// don't dispatch a direction — user was drifting into side corridors
// on narrow passages. Below COMMIT_ZONE the nub visualises tilt but
// keeps `dir` at null.
const DEAD_ZONE = 10
const COMMIT_ZONE = 18
// Also demand a clear dominant axis: dx must exceed dy by this much
// (or vice versa) before we lock a lateral vs vertical step.
const AXIS_LOCK_RATIO = 1.6

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
    // Nub always follows the finger (clamped to the ring) so the
    // player gets visual feedback even inside the dead zone.
    const clampMag = Math.min(mag, RING_RADIUS - NUB_RADIUS * 0.4)
    const nx = mag > 0 ? (dx / mag) * clampMag : 0
    const ny = mag > 0 ? (dy / mag) * clampMag : 0
    setNub({ x: nx, y: ny })

    if (mag < DEAD_ZONE) { setDir(null); return }
    if (mag < COMMIT_ZONE) return  // pre-commit: hold prior direction

    const ax = Math.abs(dx), ay = Math.abs(dy)
    // Ambiguous drags (nearly diagonal) hold the previous direction so
    // a slight tilt while walking down a corridor doesn't twitch the
    // player sideways.
    if (ax > ay * AXIS_LOCK_RATIO) setDir([dx > 0 ? 1 : -1, 0])
    else if (ay > ax * AXIS_LOCK_RATIO) setDir([0, dy > 0 ? 1 : -1])
  }, [setDir])

  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeIdRef.current !== null) return
    const pad = padRef.current
    if (!pad) return
    const rect = pad.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    anchorRef.current = { x: cx, y: cy }
    activeIdRef.current = e.pointerId
    pad.setPointerCapture(e.pointerId)
    dispatchFromDelta(e.clientX - cx, e.clientY - cy)
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
