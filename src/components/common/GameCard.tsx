import type { GameInfo } from '../../features/home/Home'

interface GameCardProps {
  game: GameInfo;
  style?: React.CSSProperties;
  className?: string;
  actionArea?: React.ReactNode;
}

const BADGE_VARIANTS: Record<GameInfo['genre'] | 'turn' | 'count', string> = {
  '턴제 전략': 'pixel-badge',
  '실시간 액션': 'pixel-badge',
  '퍼즐': 'pixel-badge',
  '스포츠': 'pixel-badge',
  '보드게임': 'pixel-badge',
  turn: 'pixel-badge',
  count: 'pixel-badge pixel-badge--muted',
}

/**
 * Pixel-thumb cells rendered in a 3×3 grid.
 * Fixed template — content stays deterministic so it works as a decorative background,
 * not real game state.
 */
const THUMB_CELLS: ReadonlyArray<{ variant: 'o' | 'x' | 'empty'; symbol: string }> = [
  { variant: 'o', symbol: 'O' },
  { variant: 'x', symbol: 'X' },
  { variant: 'empty', symbol: '' },
  { variant: 'empty', symbol: '' },
  { variant: 'o', symbol: 'O' },
  { variant: 'x', symbol: 'X' },
  { variant: 'empty', symbol: '' },
  { variant: 'empty', symbol: '' },
  { variant: 'o', symbol: 'O' },
]

function thumbCellClass(variant: 'o' | 'x' | 'empty'): string {
  const base = 'pixel-thumb-cell'
  if (variant === 'o') return `${base} pixel-thumb-cell--filled-o`
  if (variant === 'x') return `${base} pixel-thumb-cell--filled-x`
  return `${base} pixel-thumb-cell--empty`
}

export function GameCard({ game, style, className = '', actionArea }: GameCardProps) {
  return (
    <div className={`game-card ${className}`} style={style}>
      <div className="game-thumbnail-placeholder scanlines">
        <div className="pixel-thumb-grid" aria-hidden="true">
          {THUMB_CELLS.map((cell, i) => (
            <div key={i} className={thumbCellClass(cell.variant)}>{cell.symbol}</div>
          ))}
        </div>
      </div>

      <div className="game-card-detail-overlay">
        <div className="game-card-title-row">
          <span className="game-card-title">{game.title}</span>
          <div className="game-card-badges">
            <span className={BADGE_VARIANTS[game.genre]}>{game.genre}</span>
            <span className={BADGE_VARIANTS.turn}>{game.turnType}</span>
            <span className={BADGE_VARIANTS.count}>{game.playerCount}인</span>
          </div>
        </div>

        <p className="game-card-desc">{game.desc}</p>

        <div className="game-card-meta">
          <span>{game.version}</span>
          <span>{game.updateDate}</span>
        </div>

        {actionArea && <div className="game-card-actions">{actionArea}</div>}
      </div>
    </div>
  )
}
