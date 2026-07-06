interface OfflineBannerProps {
  reason?: 'offline' | 'no-signaling';
}

export function OfflineBanner({ reason = 'offline' }: OfflineBannerProps) {
  return (
    <div className="offline-banner">
      {reason === 'offline'
        ? '인터넷 연결이 끊어졌어요 · 오프라인(QR) 모드로 동작해요'
        : '시그널링 서버 URL 미설정 · QR 모드로만 연결돼요'}
    </div>
  )
}
