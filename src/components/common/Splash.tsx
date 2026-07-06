import { useCallback, useEffect, useRef, useState } from 'react'

interface SplashProps {
  onFinish: () => void;
}

const AUTO_ADVANCE_MS = 5000
const FADE_MS = 400

export function Splash({ onFinish }: SplashProps) {
  const [fade, setFade] = useState(false)
  const doneRef = useRef(false)

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setFade(true)
    setTimeout(onFinish, FADE_MS)
  }, [onFinish])

  useEffect(() => {
    const timer = setTimeout(finish, AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [finish])

  return (
    <div
      className="splash-container scanlines"
      style={{ opacity: fade ? 0 : 1, pointerEvents: fade ? 'none' : 'auto' }}
      onClick={finish}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') finish()
      }}
    >
      <div className="splash-logo-tile" aria-hidden="true">M</div>
      <div className="splash-logo">mini<br />damo</div>
      <div className="splash-sub">NEAR · TAP · PLAY</div>
      <button
        type="button"
        className="splash-push-start"
        onClick={(e) => {
          e.stopPropagation()
          finish()
        }}
      >
        ▶ PUSH START
      </button>
    </div>
  )
}
