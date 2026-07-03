import { useEffect, useState } from 'react'

interface SplashProps {
  onFinish: () => void;
}

export function Splash({ onFinish }: SplashProps) {
  const [fade, setFade] = useState(false)

  useEffect(() => {
    // 1.5초 노출 후 페이드아웃 효과 작동
    const timer1 = setTimeout(() => setFade(true), 1500)
    // 2.3초 후 언마운트
    const timer2 = setTimeout(onFinish, 2300)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [onFinish])

  return (
    <div className="splash-container" style={{ opacity: fade ? 0 : 1, pointerEvents: fade ? 'none' : 'auto' }}>
      <div className="splash-logo">minidamo</div>
      <div className="splash-sub">MULTIPLAYER P2P</div>
    </div>
  )
}
