import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { P2PMessage } from '../hooks/useRoom'

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
  own: boolean;
}

interface ChatAPI {
  messages: ChatMessage[];
  unreadCount: number;
  open: boolean;
  openChat: () => void;
  closeChat: () => void;
  send: (text: string) => void;
  clear: () => void;
  available: boolean;   // false when there's no active peer connection
}

const ChatContext = createContext<ChatAPI | null>(null)

interface ChatProviderProps {
  children: ReactNode;
  myName: string;
  myId: string;
  sendMessage: (msg: P2PMessage) => void;
  available: boolean;
}

const MAX_HISTORY = 100

export function ChatProvider({ children, myName, myId, sendMessage, available }: ChatProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])

  // Wipe chat log when the peer session ends so a new match starts clean.
  useEffect(() => {
    if (!available) {
      setMessages([])
      setUnreadCount(0)
      setOpen(false)
    }
  }, [available])

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.type !== 'CHAT') return
      const text = msg.payload?.text
      if (!text) return
      const chat: ChatMessage = {
        id: `${msg.timestamp}-${msg.senderId}`,
        senderId: msg.senderId,
        senderName: msg.payload?.senderName ?? '상대',
        text,
        ts: msg.timestamp,
        own: false,
      }
      setMessages((prev) => {
        const next = [...prev, chat]
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next
      })
      if (!openRef.current) setUnreadCount((n) => n + 1)
    }
    window.addEventListener('p2p_message', handler)
    return () => window.removeEventListener('p2p_message', handler)
  }, [])

  const send = useCallback((raw: string) => {
    const text = raw.trim()
    if (!text) return
    const ts = Date.now()
    const chat: ChatMessage = {
      id: `${ts}-${myId}-own`,
      senderId: myId,
      senderName: myName,
      text,
      ts,
      own: true,
    }
    setMessages((prev) => {
      const next = [...prev, chat]
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next
    })
    sendMessage({
      type: 'CHAT',
      senderId: myId,
      timestamp: ts,
      payload: { text, senderName: myName },
    })
  }, [myId, myName, sendMessage])

  const openChat = useCallback(() => {
    setOpen(true)
    setUnreadCount(0)
  }, [])
  const closeChat = useCallback(() => setOpen(false), [])
  const clear = useCallback(() => {
    setMessages([])
    setUnreadCount(0)
  }, [])

  const value = useMemo<ChatAPI>(() => ({
    messages, unreadCount, open, openChat, closeChat, send, clear, available,
  }), [messages, unreadCount, open, openChat, closeChat, send, clear, available])

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatAPI {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be inside ChatProvider')
  return ctx
}
