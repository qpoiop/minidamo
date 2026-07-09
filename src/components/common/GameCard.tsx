import type { GameInfo } from '../../features/home/Home'

interface GameCardProps {
  game: GameInfo;
  className?: string;
  actionArea?: React.ReactNode;
  indicator?: React.ReactNode;
}

const BADGE_VARIANTS: Record<GameInfo['genre'] | 'turn' | 'count', string> = {
  '실시간 액션': 'pixel-badge',
  '전략':       'pixel-badge',
  '추리':       'pixel-badge',
  '협동':       'pixel-badge',
  turn:  'pixel-badge',
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

// Vite-resolved URLs for the sprite sheets — importing gets them
// finger-printed + copied into dist/, so referencing via inline
// backgroundImage style always works in prod.
import catWalkUrl from '../../assets/cat_walk_sheet.png'
import itemSheetUrl from '../../assets/item_sheet.png'

// cat_walk_sheet.png = 256×128, 4-col × 2-row of 64×64.
// Direction / frame → (col, row).
const CAT_TILE = { down: [0, 0], up: [2, 0], left: [0, 1], right: [2, 1] } as const

/**
 * Bitmap cat plate — crops one 64×64 tile from cat_walk_sheet.png
 * using inline background-position/size. Because the URL is
 * JS-imported, Vite bundles it correctly for both dev and prod
 * (unlike the previous CSS `url()` approach which lost the asset).
 */
function CatSprite({ dir = 'up', size = 48 }: { dir?: 'down' | 'up' | 'left' | 'right'; size?: number }) {
  const [col, row] = CAT_TILE[dir]
  // Sheet is 4 cols × 2 rows → display it at 4× / 2× the tile size,
  // then use background-position to align the target tile.
  const posX = (col / 3) * 100   // 4 cols → step = 100/(4-1)
  const posY = (row / 1) * 100   // 2 rows → step = 100/(2-1)
  return (
    <span
      className="pixel-thumb-sprite pixel-thumb-sprite--cat"
      role="img"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${catWalkUrl})`,
        backgroundSize: '400% 200%',
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    />
  )
}

/**
 * Bitmap item plate. item_sheet.png = 160×32, 5 tiles across.
 * Tile order verified from the actual asset:
 *   0 = key      (round barrel + toothed shaft)
 *   1 = fish     (big body + small tail fin)
 *   2 = ball     (checkered soccer-style)
 *   3 = star     (5-point crown star)
 *   4 = watermelon (domed slice with seeds)
 */
function ItemSprite({ idx, size = 26 }: { idx: 0 | 1 | 2 | 3 | 4; size?: number }) {
  const posX = (idx / 4) * 100
  return (
    <span
      className="pixel-thumb-sprite pixel-thumb-sprite--item"
      role="img"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${itemSheetUrl})`,
        backgroundSize: '500% 100%',
        backgroundPosition: `${posX}% 0%`,
      }}
    />
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
      {/* Fish is the only pickup that actually exists in Wudada
       * gameplay — dropping the star / watermelon from the thumb so
       * it doesn't over-promise items the game doesn't have. */}
      <div className="pixel-thumb-wudada-fish" aria-hidden="true">
        <ItemSprite idx={1} size={22} />
      </div>
      <div className="pixel-thumb-wudada-cat">
        <CatSprite dir="up" size={42} />
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
      {/* Door isn't in the item sheet — inline SVG kept for the exit.
       * Key uses the real key tile (idx 0). Ball tile (idx 2) sits in
       * the lower-right corridor cell as an "item" hint. */}
      <div className="pixel-thumb-escape-door" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="24" aria-hidden="true">
          <path d="M4 22V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v18z" fill="#c7e06a" stroke="#0a260a" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M7 5h10v15H7z" fill="#0f380f" />
          <circle cx="15" cy="13" r="1.2" fill="#c7e06a" />
        </svg>
      </div>
      <div className="pixel-thumb-escape-cat">
        <CatSprite dir="down" size={28} />
      </div>
      <div className="pixel-thumb-escape-key">
        <ItemSprite idx={0} size={24} />
      </div>
    </div>
  )
}

function WavelengthThumb() {
  // Spectrum bar (thicker to fit the tile), zone bands + target
  // stripe + dial pointer + pole labels. Redesigned to actually
  // read as "spectrum bar" at thumbnail size — the previous version
  // had a floating dial and un-aligned poles.
  return (
    <div className="pixel-thumb-wave" aria-hidden="true">
      <div className="pixel-thumb-wave-topic">주제</div>
      <div className="pixel-thumb-wave-poles">
        <span>순</span>
        <span>사</span>
      </div>
      <div className="pixel-thumb-wave-bar">
        <div className="pixel-thumb-wave-zone pixel-thumb-wave-zone--b2" />
        <div className="pixel-thumb-wave-zone pixel-thumb-wave-zone--b3" />
        <div className="pixel-thumb-wave-zone pixel-thumb-wave-zone--b4" />
        <div className="pixel-thumb-wave-target" />
        <div className="pixel-thumb-wave-dial" />
      </div>
      <div className="pixel-thumb-wave-ticks">
        <span /><span /><span /><span /><span />
      </div>
    </div>
  )
}

function HiddenWordThumb() {
  const CELLS = ['참치', '벌', '연어', '무',
                 '기타', '조기', '눈', '나비',
                 '고등어', '망치', '갈치', '수박',
                 '광어', '색', '드럼', '드럼']
  // Mark theme cells (fish group) with a distinct border; one is
  // highlighted as "my identity".
  const THEME = new Set([0, 2, 5, 8, 10, 12])
  const ME = 8
  return (
    <div className="pixel-thumb-hw" aria-hidden="true">
      {CELLS.slice(0, 16).map((w, i) => (
        <span
          key={i}
          className={[
            'pixel-thumb-hw-cell',
            THEME.has(i) ? 'is-theme' : '',
            i === ME ? 'is-me' : '',
          ].filter(Boolean).join(' ')}
        >{w}</span>
      ))}
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
    case 'wavelength': return <WavelengthThumb />
    case 'hiddenword': return <HiddenWordThumb />
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
