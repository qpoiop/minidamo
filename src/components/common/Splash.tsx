import { useEffect, useState } from 'react'

interface SplashProps {
  onFinish: () => void;
}

const HOLD_MS = 1500
const FADE_MS = 800

export function Splash({ onFinish }: SplashProps) {
  const [fade, setFade] = useState(false)

  useEffect(() => {
    const holdTimer = setTimeout(() => setFade(true), HOLD_MS)
    const finishTimer = setTimeout(onFinish, HOLD_MS + FADE_MS)
    return () => {
      clearTimeout(holdTimer)
      clearTimeout(finishTimer)
    }
  }, [onFinish])

  return (
    <div
      className="splash-container scanlines"
      style={{ opacity: fade ? 0 : 1, pointerEvents: fade ? 'none' : 'auto' }}
    >
      <div className="splash-logo-tile" aria-hidden="true">M</div>
      <div className="splash-logo">mini<br />damo</div>
      <div className="splash-sub">NEAR · TAP · PLAY</div>
      <div className="splash-push-start">▶ PUSH START</div>
    </div>
  )
}
