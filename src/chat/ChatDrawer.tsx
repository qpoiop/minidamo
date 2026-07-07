import { useEffect, useRef, useState } from 'react'
import { useChat } from './ChatProvider'

export function ChatDrawer() {
  const { messages, open, closeChat, send, canSend } = useChat()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Autoscroll to newest and give focus to the input on open.
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    inputRef.current?.focus()
  }, [open, messages.length])

  // Follow the visual viewport when the soft keyboard opens on mobile.
  // Without this the drawer stays at 100dvh and the input gets pushed
  // above the fold. On browsers without visualViewport we no-op.
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const applyHeight = () => {
      const drawer = drawerRef.current
      if (!drawer) return
      drawer.style.setProperty('--chat-viewport-h', `${vv.height}px`)
      // Scroll input into view once the keyboard settles.
      setTimeout(() => inputRef.current?.scrollIntoView({ block: 'end' }), 60)
    }
    applyHeight()
    vv.addEventListener('resize', applyHeight)
    vv.addEventListener('scroll', applyHeight)
    return () => {
      vv.removeEventListener('resize', applyHeight)
      vv.removeEventListener('scroll', applyHeight)
    }
  }, [open])

  if (!open) return null

  const submit = () => {
    if (!draft.trim()) return
    send(draft)
    setDraft('')
  }

  return (
    <div className="chat-drawer-overlay" onClick={closeChat}>
      <div
        ref={drawerRef}
        className="chat-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="채팅"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-drawer-header">
          <span className="chat-drawer-title">채팅</span>
          <button type="button" className="chat-drawer-close" onClick={closeChat} aria-label="채팅 닫기">✕</button>
        </div>

        <div className="chat-drawer-messages" ref={listRef}>
          {!canSend && (
            <div className="chat-drawer-notice">
              상대방이 접속하기 전이라 메시지 전송이 잠겨 있어요.<br />
              접속되면 자동으로 전송할 수 있게 열려요.
            </div>
          )}
          {messages.length === 0 ? (
            <div className="chat-drawer-empty">아직 대화가 없어요. 먼저 인사해 보세요!</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.own ? 'chat-msg--own' : ''}`}>
                <div className="chat-msg-meta">
                  <span className="chat-msg-name">{m.own ? '나' : m.senderName}</span>
                  <span className="chat-msg-time">{formatTime(m.ts)}</span>
                </div>
                <div className="chat-msg-bubble">{m.text}</div>
              </div>
            ))
          )}
        </div>

        <form
          className="chat-drawer-input"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="chat-drawer-field"
            placeholder={canSend ? '메시지 입력' : '상대방 접속 대기 중…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            disabled={!canSend}
          />
          <button
            type="submit"
            className="pixel-btn pixel-btn--primary chat-drawer-send"
            disabled={!draft.trim() || !canSend}
          >
            보내기
          </button>
        </form>
      </div>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}
