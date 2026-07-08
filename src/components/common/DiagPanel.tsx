import type { ConnectionStatus } from '../../hooks/useRoom'
import { PALETTE } from '../../styles/palette'

interface DiagPanelProps {
  status: ConnectionStatus;
  iceState?: RTCIceConnectionState | null;
  dcState?: RTCDataChannelState | null;
  diagLog?: Array<{ ts: number; text: string }>;
  candTypes?: Record<'host' | 'srflx' | 'prflx' | 'relay', number>;
}

/**
 * On-screen connection diagnostic. Mobile users can't easily open the
 * browser console; this panel surfaces the same information (current ICE
 * state, DC state, recent event log) directly in the UI whenever the
 * room is stuck at CONNECTING / RECONNECTING.
 *
 * Only opens when there's something to say — parent decides when to
 * render it.
 */
export function DiagPanel({ status, iceState, dcState, diagLog = [], candTypes }: DiagPanelProps) {
  const iceLabel = iceState ?? '—'
  const dcLabel = dcState ?? '—'
  const iceColor = iceStateColor(iceState)
  const dcColor = dcStateColor(dcState)
  const now = Date.now()
  return (
    <div className="diag-panel" role="status" aria-live="polite">
      <div className="diag-panel-title">진단</div>
      <div className="diag-panel-row">
        <span className="diag-panel-key">상태</span>
        <span className="diag-panel-value">{status}</span>
      </div>
      <div className="diag-panel-row">
        <span className="diag-panel-key">🧊 ICE</span>
        <span className="diag-panel-value" style={{ color: iceColor }}>{iceLabel}</span>
      </div>
      <div className="diag-panel-row">
        <span className="diag-panel-key">🔗 DC</span>
        <span className="diag-panel-value" style={{ color: dcColor }}>{dcLabel}</span>
      </div>
      {diagLog.length > 0 && (
        <div className="diag-panel-log">
          {diagLog.slice(-6).map((e) => (
            <div key={e.ts} className="diag-panel-log-row">
              <span className="diag-panel-log-time">{Math.floor((now - e.ts) / 1000)}s</span>
              <span className="diag-panel-log-text">{e.text}</span>
            </div>
          ))}
        </div>
      )}
      {candTypes && (
        <div className="diag-panel-row">
          <span className="diag-panel-key">🎯 후보</span>
          <span className="diag-panel-value">
            host {candTypes.host} · srflx {candTypes.srflx} · relay {candTypes.relay}
          </span>
        </div>
      )}
      {(iceState === 'failed' || (candTypes && candTypes.relay === 0 && iceState === 'checking')) && (
        <div className="diag-panel-hint">
          {candTypes && candTypes.relay === 0
            ? 'TURN 서버 없음 — 셀룰러 CGNAT/symmetric NAT에서 P2P 어려움. Wi-Fi 시도 or TURN 구성 필요.'
            : 'NAT 통과 실패. Wi-Fi로 바꿔보거나 다른 네트워크에서 시도.'}
        </div>
      )}
    </div>
  )
}

function iceStateColor(s: RTCIceConnectionState | null | undefined): string {
  if (!s) return 'var(--fg-muted)'
  if (s === 'connected' || s === 'completed') return 'var(--fg-accent)'
  if (s === 'failed' || s === 'disconnected') return PALETTE.bombLight
  return 'var(--fg-primary)'
}

function dcStateColor(s: RTCDataChannelState | null | undefined): string {
  if (!s) return 'var(--fg-muted)'
  if (s === 'open') return 'var(--fg-accent)'
  if (s === 'closed') return PALETTE.bombLight
  return 'var(--fg-primary)'
}
