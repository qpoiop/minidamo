import { useChat } from './ChatProvider'

interface ChatButtonProps {
  variant?: 'header' | 'inline';
}

export function ChatButton({ variant = 'header' }: ChatButtonProps) {
  const { unreadCount, openChat, available } = useChat()
  if (!available) return null
  return (
    <button
      type="button"
      className={`chat-button chat-button--${variant}`}
      onClick={openChat}
      aria-label={unreadCount > 0 ? `채팅 · 새 메시지 ${unreadCount}개` : '채팅 열기'}
    >
      <span className="chat-button-icon" aria-hidden="true">💬</span>
      {unreadCount > 0 && (
        <span className="chat-button-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
      )}
    </button>
  )
}
