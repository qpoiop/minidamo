import type { PlayerInfo } from '../../../hooks/useRoom'

interface PlayerRow {
  player: PlayerInfo;
  extra?: React.ReactNode;
  active: boolean;
  online: boolean;
}

interface GamePlayerHudProps {
  rows: PlayerRow[];
  hint?: string;
}

export function GamePlayerHud({ rows, hint }: GamePlayerHudProps) {
  return (
    <div className="game-player-hud-wrap">
      <div className="game-player-hud">
        {rows.map(({ player, extra, active, online }) => (
          <div
            key={player.id}
            className={`game-player-hud-row ${active ? 'game-player-hud-row--active' : ''} ${!online ? 'game-player-hud-row--offline' : ''}`}
          >
            <span className="game-player-hud-dot" aria-hidden="true" />
            <span className="game-player-hud-name">{player.name}</span>
            {extra && <span className="game-player-hud-extra">{extra}</span>}
          </div>
        ))}
      </div>
      {hint && <div className="game-footnote">{hint}</div>}
    </div>
  )
}
