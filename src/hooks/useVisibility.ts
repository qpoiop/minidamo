import { useEffect, useState } from 'react'

/**
 * Tracks the page visibility state. Games can subscribe to pause their
 * animation loop when hidden (mobile screen off, tab background) and
 * resume on return — avoids desyncs and battery drain.
 */
export function useVisibility(): boolean {
  const [visible, setVisible] = useState<boolean>(() =>
    typeof document === 'undefined' ? true : !document.hidden,
  )

  useEffect(() => {
    const handler = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  return visible
}
