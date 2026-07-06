import { useEffect, useRef, useState } from 'react'

interface QrScannerProps {
  onResult: (text: string) => void;
  onError?: (err: unknown) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
}

const CONTAINER_ID = 'minidamo-qr-scanner-region'

export function QrScanner({ onResult, onError, onClose, title, hint }: QrScannerProps) {
  const [status, setStatus] = useState<string>('카메라 준비 중…')
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const consumedRef = useRef<boolean>(false)

  // Keep the latest callbacks in refs so the start effect never re-runs
  // (otherwise every parent render restarts the whole camera pipeline).
  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)
  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    let disposed = false

    const start = async () => {
      try {
        const mod = await import('html5-qrcode')
        if (disposed) return
        // One frame so the container has real dimensions on mobile.
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        if (disposed) return

        const scanner = new mod.Html5Qrcode(CONTAINER_ID, { verbose: false })
        scannerRef.current = {
          stop: () => scanner.stop().catch(() => undefined),
          clear: () => scanner.clear(),
        }

        const box = containerRef.current
        const width = box?.clientWidth ?? 260
        const qrEdge = Math.max(180, Math.min(width - 40, 260))

        await scanner.start(
          { facingMode: { ideal: 'environment' } },
          {
            fps: 10,
            qrbox: { width: qrEdge, height: qrEdge },
            aspectRatio: 1.0,
            videoConstraints: { facingMode: { ideal: 'environment' } },
          },
          (decoded) => {
            if (disposed || consumedRef.current) return
            consumedRef.current = true
            setStatus('스캔 완료 · 처리 중…')
            // Fire the result. We deliberately do not stop the scanner
            // here — parent will unmount us, which runs the cleanup below.
            try {
              onResultRef.current(decoded)
            } catch (err) {
              console.error('onResult handler threw', err)
            }
          },
          () => undefined,
        )
        setStatus('QR 코드를 화면에 맞춰 주세요')
      } catch (err) {
        console.error('QR scanner start failed', err)
        setStatus('카메라 접근 실패')
        onErrorRef.current?.(err)
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
    // Mount/unmount only — callbacks are read from refs.
  }, [])

  return (
    <div className="qr-scanner-overlay">
      <div className="qr-scanner-card">
        <div className="qr-scanner-title">{title ?? 'QR 스캔'}</div>
        {hint && <div className="qr-scanner-hint">{hint}</div>}
        <div id={CONTAINER_ID} ref={containerRef} className="qr-scanner-region" />
        <div className="qr-scanner-status">{status}</div>
        <button type="button" className="pixel-btn pixel-btn--ghost" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
