interface ScanStatusProps {
  scanCount: number;
  nextScanInMs: number;
  intervalMs: number;
  maxWindowMs: number;
}

export function ScanStatus({ scanCount, nextScanInMs, intervalMs, maxWindowMs }: ScanStatusProps) {
  const pct = 100 - (nextScanInMs / intervalMs) * 100
  return (
    <div className="scan-status">
      <div className="scan-status-row">
        <span className="scan-dot" aria-hidden="true" />
        <span className="scan-status-label">스캔 #{scanCount}</span>
        <span className="scan-status-sub">다음 스캔 {(nextScanInMs / 1000).toFixed(1)}초</span>
      </div>
      <div className="scan-progress" aria-hidden="true">
        <div className="scan-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="scan-status-hint">반경 20m 이내 스캔 · 최대 {maxWindowMs / 1000}초</div>
    </div>
  )
}
