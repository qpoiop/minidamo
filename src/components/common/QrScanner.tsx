import { useEffect, useRef, useState } from 'react'

interface QrScannerProps {
  onResult: (text: string) => void;
  onError?: (err: unknown) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
}

const CONTAINER_ID = 'minidamo-qr-scanner-region'

/**
 * Lazy-loads html5-qrcode only when the scanner is actually mounted.
 * Keeps the initial bundle small; also lets non-camera devices avoid the shim.
 */
export function QrScanner({ onResult, onError, onClose, title, hint }: QrScannerProps) {
  const [status, setStatus] = useState<string>('카메라 준비 중…')
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)

  useEffect(() => {
    let disposed = false

    const start = async () => {
      try {
        const mod = await import('html5-qrcode')
        if (disposed) return
        const scanner = new mod.Html5Qrcode(CONTAINER_ID, { verbose: false })
        scannerRef.current = {
          stop: () => scanner.stop().catch(() => undefined),
          clear: () => scanner.clear(),
        }
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (disposed) return
            onResult(decoded)
          },
          () => undefined,
        )
        setStatus('QR 코드를 화면에 맞춰 주세요')
      } catch (err) {
        setStatus('카메라 접근 실패')
        onError?.(err)
      }
    }

    start()
    return () => {
      disposed = true
      const s = scannerRef.current
      if (s) {
        s.stop().finally(() => {
          try { s.clear() } catch { /* ignore */ }
        })
      }
    }
  }, [onResult, onError])

  return (
    <div className="qr-scanner-overlay">
      <div className="qr-scanner-card">
        <div className="qr-scanner-title">{title ?? 'QR 스캔'}</div>
        {hint && <div className="qr-scanner-hint">{hint}</div>}
        <div id={CONTAINER_ID} className="qr-scanner-region" />
        <div className="qr-scanner-status">{status}</div>
        <button type="button" className="pixel-btn pixel-btn--ghost" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
