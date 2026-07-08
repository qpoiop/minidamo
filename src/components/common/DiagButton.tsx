import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { ConnectionStatus } from '../../hooks/useRoom'
import './DiagButton.css'
import { PALETTE } from '../../styles/palette'

interface DiagCtx {
  status: ConnectionStatus;
  iceState?: RTCIceConnectionState | null;
  dcState?: RTCDataChannelState | null;
  diagLog?: Array<{ ts: number; text: string }>;
  candTypes?: Record<'host' | 'srflx' | 'prflx' | 'relay', number>;
}

interface DiagAPI extends DiagCtx {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const DiagContext = createContext<DiagAPI | null>(null)

interface DiagProviderProps extends DiagCtx {
  children: ReactNode;
}
export function DiagProvider({ children, ...state }: DiagProviderProps) {
  const [open, setOpen] = useState(false)
  const openDrawer = useCallback(() => setOpen(true), [])
  const closeDrawer = useCallback(() => setOpen(false), [])
  return (
    <DiagContext.Provider value={{ ...state, open, openDrawer, closeDrawer }}>
      {children}
    </DiagContext.Provider>
  )
}

function useDiag(): DiagAPI {
  const ctx = useContext(DiagContext)
  if (!ctx) throw new Error('useDiag must be inside DiagProvider')
  return ctx
}

export function DiagButton() {
  const { openDrawer, iceState, diagLog } = useDiag()
  const hot = iceState === 'failed' || iceState === 'disconnected'
  const count = diagLog?.length ?? 0
  return (
    <button
      type="button"
      className={`diag-button ${hot ? 'is-hot' : ''}`}
      onClick={openDrawer}
      aria-label="진단 로그"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
      {(hot || count > 0) && (
        <span className="diag-button-badge">{hot ? '!' : count > 9 ? '9+' : count}</span>
      )}
    </button>
  )
}

export function DiagDrawer() {
  const { open, closeDrawer, status, iceState, dcState, diagLog, candTypes } = useDiag()
  if (!open) return null
  const iceColor = iceStateColor(iceState)
  const dcColor = dcStateColor(dcState)
  const now = Date.now()
  return (
    <div className="diag-drawer-overlay" onClick={closeDrawer}>
      <div className="diag-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="진단 로그">
        <div className="diag-drawer-header">
          <div className="diag-drawer-title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            <span>진단 · P2P 로그</span>
          </div>
          <button type="button" className="diag-drawer-close" onClick={closeDrawer} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>

        <div className="diag-drawer-summary">
          <StatCard label="상태" value={status} tone="default" />
          <StatCard label="ICE" value={iceState ?? '—'} tone={toneForIce(iceState)} colorHex={iceColor} />
          <StatCard label="DC" value={dcState ?? '—'} tone={toneForDc(dcState)} colorHex={dcColor} />
        </div>

        {candTypes && (
          <div className="diag-drawer-cands">
            <div className="diag-drawer-cands-title">ICE 후보</div>
            <div className="diag-drawer-cands-grid">
              <CandCell label="host" value={candTypes.host} />
              <CandCell label="srflx" value={candTypes.srflx} />
              <CandCell label="prflx" value={candTypes.prflx} />
              <CandCell label="relay" value={candTypes.relay} highlight={candTypes.relay === 0} />
            </div>
          </div>
        )}

        <div className="diag-drawer-log">
          <div className="diag-drawer-log-title">최근 로그</div>
          {(diagLog ?? []).length === 0 ? (
            <div className="diag-drawer-log-empty">아직 기록이 없어요.</div>
          ) : (
            <div className="diag-drawer-log-list">
              {(diagLog ?? []).slice(-30).reverse().map((e) => (
                <div key={e.ts} className="diag-drawer-log-row">
                  <span className="diag-drawer-log-time">{Math.floor((now - e.ts) / 1000)}s</span>
                  <span className="diag-drawer-log-text">{e.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {(iceState === 'failed' || (candTypes && candTypes.relay === 0 && iceState === 'checking')) && (
          <div className="diag-drawer-hint">
            {candTypes && candTypes.relay === 0
              ? 'TURN 서버 없음 — 셀룰러 CGNAT/symmetric NAT에서 P2P 어려움. Wi-Fi 시도 or TURN 구성 필요.'
              : 'NAT 통과 실패. Wi-Fi로 바꿔보거나 다른 네트워크에서 시도.'}
          </div>
        )}
      </div>
    </div>
  )
}

interface StatCardProps { label: string; value: string; tone: 'default' | 'ok' | 'bad'; colorHex?: string; }
function StatCard({ label, value, tone, colorHex }: StatCardProps) {
  return (
    <div className={`diag-stat diag-stat--${tone}`}>
      <div className="diag-stat-label">{label}</div>
      <div className="diag-stat-value" style={colorHex ? { color: colorHex } : undefined}>{value}</div>
    </div>
  )
}

interface CandCellProps { label: string; value: number; highlight?: boolean; }
function CandCell({ label, value, highlight }: CandCellProps) {
  return (
    <div className={`diag-cand ${highlight ? 'diag-cand--zero' : ''}`}>
      <div className="diag-cand-label">{label}</div>
      <div className="diag-cand-value">{value}</div>
    </div>
  )
}

function toneForIce(s: RTCIceConnectionState | null | undefined): 'default' | 'ok' | 'bad' {
  if (!s) return 'default'
  if (s === 'connected' || s === 'completed') return 'ok'
  if (s === 'failed' || s === 'disconnected') return 'bad'
  return 'default'
}
function toneForDc(s: RTCDataChannelState | null | undefined): 'default' | 'ok' | 'bad' {
  if (!s) return 'default'
  if (s === 'open') return 'ok'
  if (s === 'closed') return 'bad'
  return 'default'
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
