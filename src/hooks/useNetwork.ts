import { useEffect, useState } from 'react'
import { isSignalingAvailable } from '../services/signaling'

export interface NetworkState {
  online: boolean;
  signalingConfigured: boolean;
}

/**
 * Realtime online/offline tracker + signaling-endpoint availability.
 */
export function useNetwork(): NetworkState {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [signalingConfigured] = useState<boolean>(() => isSignalingAvailable())

  useEffect(() => {
    const handleOn = () => setOnline(true)
    const handleOff = () => setOnline(false)
    window.addEventListener('online', handleOn)
    window.addEventListener('offline', handleOff)
    return () => {
      window.removeEventListener('online', handleOn)
      window.removeEventListener('offline', handleOff)
    }
  }, [])

  return { online, signalingConfigured }
}
