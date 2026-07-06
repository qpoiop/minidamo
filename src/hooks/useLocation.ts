import { useCallback, useEffect, useRef, useState } from 'react'

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type LocationPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported'

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
}

function mapError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return '위치 권한이 거부됐어요. 브라우저 설정에서 허용해 주세요.'
    case err.POSITION_UNAVAILABLE:
      return '위치 정보를 사용할 수 없어요.'
    case err.TIMEOUT:
      return '위치 조회 시간이 초과됐어요.'
    default:
      return '위치 조회 실패'
  }
}

export function useLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [permission, setPermission] = useState<LocationPermission>('unknown')
  const watchIdRef = useRef<number | null>(null)

  const clearWatch = () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setError('이 브라우저는 위치 조회를 지원하지 않아요.')
      setPermission('unsupported')
      return
    }
    clearWatch()
    setLoading(true)
    setError(null)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        setError(null)
        setLoading(false)
        setPermission('granted')
      },
      (err) => {
        setError(mapError(err))
        setLoading(false)
        if (err.code === err.PERMISSION_DENIED) setPermission('denied')
      },
      WATCH_OPTIONS,
    )
  }, [])

  const requestPermission = useCallback(() => {
    startWatch()
  }, [startWatch])

  useEffect(() => {
    if (!('permissions' in navigator)) {
      startWatch()
      return
    }
    let cancelled = false
    let statusRef: PermissionStatus | null = null

    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled) return
        statusRef = status
        setPermission(status.state as LocationPermission)
        if (status.state !== 'denied') startWatch()
        status.onchange = () => {
          setPermission(status.state as LocationPermission)
          if (status.state === 'granted') startWatch()
          else if (status.state === 'denied') {
            clearWatch()
            setLocation(null)
          }
        }
      })
      .catch(() => {
        if (!cancelled) startWatch()
      })

    return () => {
      cancelled = true
      if (statusRef) statusRef.onchange = null
      clearWatch()
    }
  }, [startWatch])

  return { location, error, loading, permission, requestPermission }
}
