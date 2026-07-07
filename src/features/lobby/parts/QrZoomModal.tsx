import { QRCodeSVG } from 'qrcode.react'

interface QrZoomModalProps {
  value: string;
  onClose: () => void;
}

export function QrZoomModal({ value, onClose }: QrZoomModalProps) {
  return (
    <div className="qr-zoom-overlay" onClick={onClose}>
      <div className="qr-zoom-card" onClick={(e) => e.stopPropagation()}>
        <span className="qr-zoom-title">QR 코드 확대</span>
        <div className="qr-zoom-frame">
          <QRCodeSVG value={value} size={320} bgColor="#ffffff" fgColor="#000000" level="L" />
        </div>
        <div className="qr-zoom-hint">상대 카메라에 정면으로 화면을 비춰 주세요</div>
        <button type="button" className="pixel-btn pixel-btn--ghost qr-zoom-close" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
