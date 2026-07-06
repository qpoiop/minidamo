import { useEffect, useRef, useState } from 'react'

interface QrScannerProps {
  onResult: (text: string) => void;
  onError?: (err: unknown) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
}

const CONTAINER_ID = 'minidamo-qr-scanner-region'

interface ScannerHandle {
  stop: () => Promise<void>;
  clear: () => void;
  scanFile: (file: File) => Promise<string>;
}

/**
 * Camera + file-upload QR scanner.
 *
 * Camera:
 * - Container is sized responsively (up to 78vw square) so the video is
 *   physically large enough to read dense QR codes on mobile.
 * - videoConstraints ask the browser for the highest resolution the device
 *   can provide; html5-qrcode downsamples for decoding, but the raw video
 *   feed stays high-res so users can see what they're aiming at.
 *
 * Error handling:
 * - If getUserMedia fails (permission denied, no camera, HTTPS missing),
 *   we render an in-place error card with a "재시도" button and a file
 *   picker fallback that decodes a QR image from the gallery.
 *
 * Single-fire:
 * - consumedRef guarantees the parent's onResult runs exactly once per
 *   scanner session, even if html5-qrcode emits multiple frames.
 */
export function QrScanner({ onResult, onError, onClose, title, hint }: QrScannerProps) {
  const [status, setStatus] = useState<string>('카메라 준비 중…')
  const [errorState, setErrorState] = useState<string | null>(null)
  const scannerRef = useRef<ScannerHandle | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const consumedRef = useRef<boolean>(false)
  const [retryTick, setRetryTick] = useState(0)

  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)
  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    let disposed = false

    const start = async () => {
      setErrorState(null)
      setStatus('카메라 준비 중…')
      consumedRef.current = false
      try {
        const mod = await import('html5-qrcode')
        if (disposed) return
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        if (disposed) return

        const scanner = new mod.Html5Qrcode(CONTAINER_ID, { verbose: false })
        scannerRef.current = {
          stop: () => scanner.stop().catch(() => undefined),
          clear: () => scanner.clear(),
          scanFile: (file: File) => scanner.scanFile(file, /* showImage */ true),
        }

        const box = containerRef.current
        const boxWidth = box?.clientWidth ?? 320
        const qrEdge = Math.max(220, Math.min(boxWidth - 24, 320))

        await scanner.start(
          { facingMode: { ideal: 'environment' } },
          {
            fps: 15,
            qrbox: { width: qrEdge, height: qrEdge },
            aspectRatio: 1.0,
            videoConstraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1920, min: 1280 },
              frameRate: { ideal: 30, min: 20 },
            },
          },
          (decoded) => {
            if (disposed || consumedRef.current) return
            consumedRef.current = true
            setStatus('스캔 완료 · 처리 중…')
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
        const msg = err instanceof Error ? err.message : '카메라 접근 실패'
        setErrorState(msg)
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
  }, [retryTick])

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const mod = await import('html5-qrcode')
      const one = new mod.Html5Qrcode(CONTAINER_ID, { verbose: false })
      const decoded = await one.scanFile(file, true)
      try { await one.clear() } catch { /* ignore */ }
      if (!consumedRef.current) {
        consumedRef.current = true
        onResultRef.current(decoded)
      }
    } catch (err) {
      console.error('file scan failed', err)
      const msg = err instanceof Error ? err.message : '이미지 인식 실패'
      setErrorState(msg)
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div className="qr-scanner-overlay">
      <div className="qr-scanner-card">
        <div className="qr-scanner-title">{title ?? 'QR 스캔'}</div>
        {hint && <div className="qr-scanner-hint">{hint}</div>}

        <div id={CONTAINER_ID} ref={containerRef} className="qr-scanner-region" />

        {errorState && (
          <div className="qr-scanner-error">
            <div className="qr-scanner-error-title">카메라를 열 수 없어요</div>
            <div className="qr-scanner-error-desc">
              {errorState}
              <br />
              브라우저에서 카메라 권한을 허용했는지 확인해 주세요.
            </div>
            <button
              type="button"
              className="pixel-btn pixel-btn--primary"
              onClick={() => setRetryTick((n) => n + 1)}
            >
              다시 시도
            </button>
          </div>
        )}

        <div className="qr-scanner-status">{status}</div>

        <label className="pixel-btn pixel-btn--secondary qr-scanner-upload">
          이미지에서 QR 읽기
          <input
            type="file"
            accept="image/*"
            onChange={handleFilePick}
            style={{ display: 'none' }}
          />
        </label>

        <button type="button" className="pixel-btn pixel-btn--ghost" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
