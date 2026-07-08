import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { ConnectionStatus } from '../../hooks/useRoom'
import { DiagPanel } from './DiagPanel'
import './DiagButton.css'

/**
 * Diagnostic drawer — spec-aligned relocation of the on-screen p2p log.
 * Previously DiagPanel lived inline in the lobby footer + the reconnect
 * popup. User asked to consolidate it into a dedicated button + dialog
 * that sits next to ChatButton.
 */

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
  // Badge when something worth checking — failed ICE or lots of recent log.
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
        <path d="M12 3v6M12 3l-3 3M12 3l3 3" />
        <path d="M4 21l4-8M20 21l-4-8" />
        <rect x="9" y="9" width="6" height="8" />
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
  return (
    <div className="diag-drawer-overlay" onClick={closeDrawer}>
      <div className="diag-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="진단 로그">
        <div className="diag-drawer-header">
          <span>진단 · P2P 로그</span>
          <button type="button" className="diag-drawer-close" onClick={closeDrawer} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
        <div className="diag-drawer-body">
          <DiagPanel status={status} iceState={iceState} dcState={dcState} diagLog={diagLog} candTypes={candTypes} />
        </div>
      </div>
    </div>
  )
}
