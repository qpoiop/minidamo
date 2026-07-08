import type { GameInfo } from '../../features/home/Home'

interface GameCardProps {
  game: GameInfo;
  className?: string;
  actionArea?: React.ReactNode;
  indicator?: React.ReactNode;
}

const BADGE_VARIANTS: Record<GameInfo['genre'] | 'turn' | 'count', string> = {
  '턴제 전략': 'pixel-badge',
  '실시간 액션': 'pixel-badge',
  '퍼즐': 'pixel-badge',
  '스포츠': 'pixel-badge',
  '보드게임': 'pixel-badge',
  '추리': 'pixel-badge',
  '패턴': 'pixel-badge',
  '러너': 'pixel-badge',
  '협동': 'pixel-badge',
  turn: 'pixel-badge',
  count: 'pixel-badge pixel-badge--muted',
}

const TICTACTOE_CELLS: ReadonlyArray<{ variant: 'o' | 'x' | 'empty'; symbol: string }> = [
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

function tictactoeCellClass(variant: 'o' | 'x' | 'empty'): string {
  const base = 'pixel-thumb-cell'
  if (variant === 'o') return `${base} pixel-thumb-cell--filled-o`
  if (variant === 'x') return `${base} pixel-thumb-cell--filled-x`
  return `${base} pixel-thumb-cell--empty`
}

function TicTacToeThumb() {
  return (
    <div className="pixel-thumb-grid" aria-hidden="true">
      {TICTACTOE_CELLS.map((cell, i) => (
        <div key={i} className={tictactoeCellClass(cell.variant)}>{cell.symbol}</div>
      ))}
    </div>
  )
}

function PingPongThumb() {
  return (
    <div className="pixel-thumb-pingpong" aria-hidden="true">
      <span className="pp-paddle pp-paddle--top" />
      <span className="pp-net" />
      <span className="pp-ball" />
      <span className="pp-paddle pp-paddle--bottom" />
    </div>
  )
}

const MEMORY_FACES = ['♥', '★', '?', '?', '?', '★', '?', '?', '?', '?', '?', '♥', '?', '?', '?', '?']

function MemoryThumb() {
  return (
    <div className="pixel-thumb-memory" aria-hidden="true">
      {MEMORY_FACES.map((f, i) => (
        <div key={i} className={`pixel-thumb-memory-cell ${f !== '?' ? 'pixel-thumb-memory-cell--face' : ''}`}>
          {f}
        </div>
      ))}
    </div>
  )
}

const MOSUN_CELLS: ReadonlyArray<'BOMB' | 'ALL' | 'ME' | 'SAFE' | 'BACK'> = [
  'ALL', 'BACK', 'SAFE',
  'BACK', 'ME', 'BACK',
  'BACK', 'BOMB', 'BACK',
]

function MosunThumb() {
  return (
    <div className="pixel-thumb-mosun" aria-hidden="true">
      {MOSUN_CELLS.map((c, i) => (
        <div key={i} className={`pixel-thumb-mosun-cell pixel-thumb-mosun-cell--${c.toLowerCase()}`}>
          {c === 'BACK' ? '?' : c}
        </div>
      ))}
    </div>
  )
}


function NyanghoThumb() {
  // Guess row with 4 cat symbols + feedback pips. Reads as
  // "mastermind with cat glyphs" instead of abstract slots.
  return (
    <div className="pixel-thumb-nyangho" aria-hidden="true">
      <div className="pixel-thumb-nyangho-row">
        <span className="pixel-thumb-nyangho-slot">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M2 12c3-5 9-6 14-2l4-3v10l-4-3c-5 4-11 3-14-2z" />
          </svg>
        </span>
        <span className="pixel-thumb-nyangho-slot">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
          </svg>
        </span>
        <span className="pixel-thumb-nyangho-slot">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M6 11a2 2 0 1 1 4 0 2 2 0 0 1-4 0zM14 11a2 2 0 1 1 4 0 2 2 0 0 1-4 0zM9 15a3 3 0 0 0 6 0z" />
          </svg>
        </span>
        <span className="pixel-thumb-nyangho-slot">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M12 3l2.5 5 5.5.8-4 4 1 5.5L12 15.8 7 18.3l1-5.5-4-4 5.5-.8z" />
          </svg>
        </span>
      </div>
      <div className="pixel-thumb-nyangho-fb">
        <span className="pixel-thumb-nyangho-dot pixel-thumb-nyangho-dot--exact" />
        <span className="pixel-thumb-nyangho-dot pixel-thumb-nyangho-dot--exact" />
        <span className="pixel-thumb-nyangho-dot pixel-thumb-nyangho-dot--miss" />
      </div>
    </div>
  )
}

function PlaceholderThumb({ symbol, label }: { symbol: string; label: string }) {
  return (
    <div className="pixel-thumb-placeholder" aria-hidden="true">
      <span className="pixel-thumb-placeholder-glyph">{symbol}</span>
      <span className="pixel-thumb-placeholder-label">{label}</span>
    </div>
  )
}

/** Simple friendly pixel-cat. Round head, triangle ears, dot eyes,
 * tiny smile. Two viewpoints share the same shape so nothing reads
 * as monster-y. */
function CatGlyph({ dir = 'up', size = 44 }: { dir?: 'up' | 'down'; size?: number }) {
  if (dir === 'up') {
    // Runner back-view — round body silhouette, two ears + curled tail
    // hint. No face details.
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <path d="M8 6l3 5 3-1 3 1 3-5-1 8h1a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4h1z"
          fill="currentColor" stroke="#0a260a" strokeWidth="1.4" strokeLinejoin="round" />
        {/* Curled tail peeking on the right hip */}
        <path d="M22 22c3 0 4-3 3-5s-3-1-3 1" fill="none" stroke="#0a260a" strokeWidth="1.4" strokeLinecap="round" />
        {/* Simple stripes so we still know it's a cat, not a blob */}
        <path d="M12 18h2M18 18h2M10 22h3M19 22h3" stroke="#0a260a" strokeWidth="1" strokeLinecap="round" opacity="0.55" />
      </svg>
    )
  }
  // Front view — round head + ears + dot eyes + smile.
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M8 5l4 5h8l4-5-1 8a10 10 0 0 1-14 0z"
        fill="currentColor" stroke="#0a260a" strokeWidth="1.4" strokeLinejoin="round" />
      {/* Ear insides */}
      <path d="M10 7l2 3h-1zM22 7l-2 3h1z" fill="#0a260a" opacity="0.35" />
      {/* Eyes */}
      <circle cx="12.5" cy="15" r="1.4" fill="#0a260a" />
      <circle cx="19.5" cy="15" r="1.4" fill="#0a260a" />
      {/* Nose + smile */}
      <path d="M16 18l-1 1h2z" fill="#0a260a" />
      <path d="M14 20c1 1 3 1 4 0" fill="none" stroke="#0a260a" strokeWidth="1.2" strokeLinecap="round" />
      {/* Whisker hints */}
      <path d="M9 17l3 .3M23 17l-3 .3M9 19l3-.2M23 19l-3-.2" stroke="#0a260a" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

function WudadaThumb() {
  // 5-lane rail with dashed lane markers + one crate + one puddle
  // obstacle + a back-view cat sprite at the bottom.
  return (
    <div className="pixel-thumb-wudada" aria-hidden="true">
      <div className="pixel-thumb-wudada-lane" />
      <div className="pixel-thumb-wudada-lane" />
      <div className="pixel-thumb-wudada-lane" />
      <div className="pixel-thumb-wudada-lane" />
      <div className="pixel-thumb-wudada-obs pixel-thumb-wudada-obs--crate" />
      <div className="pixel-thumb-wudada-obs pixel-thumb-wudada-obs--puddle" />
      <div className="pixel-thumb-wudada-fish" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="#ffd24a" aria-hidden="true">
          <path d="M2 12c3-5 9-6 14-2l4-3v10l-4-3c-5 4-11 3-14-2z" stroke="#0a260a" strokeWidth="1.4" />
          <circle cx="6" cy="12" r="1" fill="#0a260a" />
        </svg>
      </div>
      <div className="pixel-thumb-wudada-cat">
        <CatGlyph dir="up" size={48} />
      </div>
    </div>
  )
}

function EscapeThumb() {
  // Mini maze framed with an outer border, a floor path leading to a
  // door in the top-right corner. Cat sits centre, key sits inside a
  // dedicated slot on the floor path — clearly separated from the
  // cat and the door.
  // 7-column × 7-row grid. Layout designed so the cat sits in the
  // middle floor row, the key on the lower-left floor cell, and the
  // door on the upper-right floor cell — everything on the same
  // corridor so it reads as one path.
  const wallLike = [
    '1111111',
    '1000001',
    '1011101',
    '1000001',
    '1011101',
    '1000001',
    '1111111',
  ]
  return (
    <div className="pixel-thumb-escape" aria-hidden="true">
      <div className="pixel-thumb-escape-grid">
        {wallLike.map((row, r) => (
          <div key={r} className="pixel-thumb-escape-row">
            {row.split('').map((v, c) => (
              <span key={c} className={`pixel-thumb-escape-cell pixel-thumb-escape-cell--${v === '1' ? 'wall' : 'floor'}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="pixel-thumb-escape-door" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="22" aria-hidden="true">
          <path d="M4 22V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v18z" fill="#c7e06a" stroke="#0a260a" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M7 5h10v15H7z" fill="#0f380f" />
          <circle cx="15" cy="13" r="1.2" fill="#c7e06a" />
        </svg>
      </div>
      <div className="pixel-thumb-escape-cat">
        <CatGlyph dir="down" size={32} />
      </div>
      <div className="pixel-thumb-escape-key">
        <svg viewBox="0 0 24 24" width="24" height="18" aria-hidden="true">
          <circle cx="6" cy="12" r="4" fill="#e0c34a" stroke="#0a260a" strokeWidth="1.4" />
          <circle cx="6" cy="12" r="1.5" fill="#0f380f" />
          <path d="M10 11h12v2h-2v3h-2v-3h-2v3h-2v-3h-1v-2z" fill="#e0c34a" stroke="#0a260a" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

function Thumbnail({ game }: { game: GameInfo }) {
  switch (game.thumbKind) {
    case 'tictactoe': return <TicTacToeThumb />
    case 'pingpong': return <PingPongThumb />
    case 'memory': return <MemoryThumb />
    case 'mosun': return <MosunThumb />
    case 'nyangho': return <NyanghoThumb />
    case 'wudada': return <WudadaThumb />
    case 'escape': return <EscapeThumb />
    default: return <PlaceholderThumb symbol={game.artText} label={game.isPlayable ? 'READY' : 'COMING SOON'} />
  }
}

export function GameCard({ game, className = '', actionArea, indicator }: GameCardProps) {
  return (
    <div className={`game-card ${className}`}>
      <div className="game-card-thumb scanlines">
        <Thumbnail game={game} />
        {indicator && <div className="game-card-indicator-slot">{indicator}</div>}
      </div>

      <div className="game-card-detail">
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
