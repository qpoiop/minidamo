import { useState, useEffect, useCallback } from 'react'

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function useLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('이 브라우저는 GPS 위치 정보 조회를 지원하지 않습니다.')
      return
    }

    setLoading(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        setError(null)
        setLoading(false)
      },
      (err) => {
        let msg = '위치 정보를 가져오는데 실패했습니다.'
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg = 'GPS 위치 권한이 거부되었습니다. 설정에서 권한을 허용해주세요.'
            break
          case err.POSITION_UNAVAILABLE:
            msg = '위치 정보를 사용할 수 없습니다.'
            break
          case err.TIMEOUT:
            msg = '위치 정보 조회 요청 시간이 초과되었습니다.'
            break
        }
        setError(msg)
        setLoading(false)
      },
      {
        enableHighAccuracy: true, // 고정밀 GPS 요구
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }, [])

  // 최초 로드 시 위치 자동 조회
  useEffect(() => {
    refreshLocation()
  }, [refreshLocation])

  return { location, error, loading, refreshLocation }
}
