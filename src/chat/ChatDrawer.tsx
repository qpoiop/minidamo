import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from './ChatProvider'
import type { ChatMessage } from './ChatProvider'
import './ChatDrawer.css'

/**
 * Quick-reply chip labels (spec §채팅 · 대기방부터 종료까지 공통).
 * Send the chip verbatim as a chat message when tapped.
 */
const QUICK_REPLIES = ['가자!', '한 판 더', 'gg', 'ㅋㅋ', '아깝다', '잘가'] as const

export function ChatDrawer() {
  const { messages, open, closeChat, send, canSend } = useChat()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    inputRef.current?.focus()
  }, [open, messages.length])

  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const applyHeight = () => {
      const drawer = drawerRef.current
      if (!drawer) return
      drawer.style.setProperty('--chat-viewport-h', `${vv.height}px`)
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

  // Count distinct peers currently in the conversation (spec's "3인" chip).
  const peerCount = useMemo(() => {
    const ids = new Set<string>()
    let iSpoke = false
    messages.forEach((m) => {
      if (m.own) iSpoke = true
      else ids.add(m.senderId)
    })
    return ids.size + (iSpoke ? 1 : 0) || 2
  }, [messages])

  if (!open) return null

  const submit = (text?: string) => {
    const finalText = (text ?? draft).trim()
    if (!finalText) return
    send(finalText)
    if (text === undefined) setDraft('')
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
          <div className="chat-drawer-title">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M4 5h16v11H9l-4 3.5V16H4z" />
              <path d="M8 9.5h8M8 12.5h5" />
            </svg>
            <span>채팅</span>
            <span className="chat-drawer-count">
              <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <path d="M4 20v-1a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v1" />
                <circle cx="12" cy="8" r="4" />
              </svg>
              {peerCount}인
            </span>
          </div>
          <button type="button" className="chat-drawer-close" onClick={closeChat} aria-label="채팅 닫기">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
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
            messages.map((m) => <MessageRow key={m.id} m={m} />)
          )}
        </div>

        <div className="chat-drawer-quick">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              type="button"
              className="chat-drawer-quick-chip"
              disabled={!canSend}
              onClick={() => submit(q)}
            >
              {q}
            </button>
          ))}
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
            className="chat-drawer-send"
            disabled={!draft.trim() || !canSend}
            aria-label="전송"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M4 12l16-7-7 16-2.5-6.5z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}

interface MessageRowProps { m: ChatMessage }

/**
 * Spec §채팅 §③ — peer bubbles show a color-tagged name above a dark
 * bg-inset chip; my bubbles align right with an accent-primary chip
 * (no name shown, per the spec mockup).
 */
function MessageRow({ m }: MessageRowProps) {
  if (m.own) {
    return (
      <div className="chat-msg chat-msg--own">
        <div className="chat-msg-bubble">{m.text}</div>
      </div>
    )
  }
  return (
    <div className="chat-msg">
      <span className="chat-msg-name" style={{ color: colorForSender(m.senderId) }}>
        {m.senderName}
      </span>
      <div className="chat-msg-bubble">{m.text}</div>
    </div>
  )
}

/** Deterministic per-sender colour, drawn from the arcade palette. */
const SENDER_PALETTE = ['#e0913f', '#5bb3c2', '#c7e06a', '#f0a4a4', '#9bbc0f', '#c48fff']
function colorForSender(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return SENDER_PALETTE[h % SENDER_PALETTE.length]
}
