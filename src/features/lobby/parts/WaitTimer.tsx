import { useEffect, useState } from 'react'

interface WaitTimerProps {
  waitExpiresAt: number | null;
  waitExpired: boolean;
  onRestartWait: () => void;
}

const TICK_MS = 500
const WINDOW_MS = 5 * 60 * 1000
const MMSS = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function WaitTimer({ waitExpiresAt, waitExpired, onRestartWait }: WaitTimerProps) {
  const [remainingMs, setRemainingMs] = useState<number>(0)

  useEffect(() => {
    if (!waitExpiresAt) {
      setRemainingMs(0)
      return
    }
    setRemainingMs(Math.max(0, waitExpiresAt - Date.now()))
    const tick = setInterval(() => {
      setRemainingMs(Math.max(0, waitExpiresAt - Date.now()))
    }, TICK_MS)
    return () => clearInterval(tick)
  }, [waitExpiresAt])

  if (!waitExpiresAt && !waitExpired) return null

  if (waitExpired) {
    return (
      <div className="wait-timer-card wait-timer-card--expired">
        <div className="wait-timer-title">입장 대기 만료</div>
        <div className="wait-timer-desc">5분 동안 참가자가 없었어요. 다시 대기를 시작할 수 있어요.</div>
        <button type="button" className="pixel-btn pixel-btn--primary" onClick={onRestartWait}>
          다시 대기하기
        </button>
      </div>
    )
  }

  const pct = (remainingMs / WINDOW_MS) * 100

  return (
    <div className="wait-timer-card">
      <div className="wait-timer-title">입장 대기 중</div>
      <div className="wait-timer-count">{MMSS(remainingMs)}</div>
      <div className="wait-timer-progress" aria-hidden="true">
        <div className="wait-timer-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="wait-timer-desc">이 시간 안에 참가자가 QR/코드로 들어와야 해요</div>
    </div>
  )
}
