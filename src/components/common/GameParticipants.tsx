import type { PlayerInfo } from '../../hooks/useRoom'

interface GameParticipantsProps {
  players: PlayerInfo[];
  peerId: string;
  activePlayerId?: string;
  isOpponentOnline: boolean;
  renderExtra?: (player: PlayerInfo) => React.ReactNode;
}

export function GameParticipants({
  players,
  peerId,
  activePlayerId,
  isOpponentOnline,
  renderExtra,
}: GameParticipantsProps) {
  return (
    <div className="game-participants">
      {players.map((player) => {
        const isSelf = player.id === peerId
        const isOnline = isSelf ? navigator.onLine : isOpponentOnline
        const isTurn = activePlayerId ? player.id === activePlayerId : true
        const rowClass = [
          'game-participant-row',
          isTurn ? 'game-participant-row--active' : '',
          isOnline ? '' : 'game-participant-row--offline',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div key={player.id} className={rowClass}>
            <div className="game-participant-info">
              <span className={`game-participant-status ${isOnline ? 'is-online' : 'is-offline'}`} />
              <span className="game-participant-name">{player.name}</span>
            </div>
            {renderExtra?.(player)}
          </div>
        )
      })}
    </div>
  )
}
