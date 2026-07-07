import type { LocationPermission, UserLocation } from '../../../hooks/useLocation'

interface GpsCardProps {
  userLocation: UserLocation | null;
  permission: LocationPermission;
  onRequestPermission: () => void;
}

function labelFor(userLocation: UserLocation | null, permission: LocationPermission): string {
  if (userLocation) return `GPS 획득 · 정밀도 ${Math.round(userLocation.accuracy)}m`
  if (permission === 'denied') return 'GPS 권한 거부됨'
  if (permission === 'unsupported') return 'GPS 미지원 브라우저'
  return 'GPS 좌표 수집 중…'
}

function variantFor(userLocation: UserLocation | null, permission: LocationPermission): string {
  if (userLocation) return 'gps-card--ok'
  if (permission === 'denied') return 'gps-card--denied'
  return 'gps-card--waiting'
}

export function GpsCard({ userLocation, permission, onRequestPermission }: GpsCardProps) {
  const showRequest = !userLocation && (permission === 'denied' || permission === 'prompt')
  return (
    <div className={`gps-card ${variantFor(userLocation, permission)}`}>
      <div className="gps-card-row">
        <span className="gps-card-label">{labelFor(userLocation, permission)}</span>
      </div>
      {showRequest && (
        <button
          type="button"
          className="pixel-btn pixel-btn--primary gps-card-cta"
          onClick={onRequestPermission}
        >
          위치 권한 요청
        </button>
      )}
    </div>
  )
}
