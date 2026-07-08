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
  return (
    <div className="pixel-thumb-nyangho" aria-hidden="true">
      <div className="pixel-thumb-nyangho-row">
        <span className="pixel-thumb-nyangho-slot" />
        <span className="pixel-thumb-nyangho-slot" />
        <span className="pixel-thumb-nyangho-slot" />
        <span className="pixel-thumb-nyangho-slot" />
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

function WudadaThumb() {
  return (
    <div className="pixel-thumb-wudada" aria-hidden="true">
      <div className="pixel-thumb-wudada-lane" />
      <div className="pixel-thumb-wudada-lane" />
      <div className="pixel-thumb-wudada-lane" />
      <span className="pixel-thumb-wudada-obs pixel-thumb-wudada-obs--1" />
      <span className="pixel-thumb-wudada-obs pixel-thumb-wudada-obs--2" />
      <span className="pixel-thumb-wudada-cat">🐱</span>
    </div>
  )
}

function EscapeThumb() {
  const wallLike = [
    '1111111', '1000101', '1010101', '1010001', '1000111', '1011001', '1111111',
  ]
  return (
    <div className="pixel-thumb-escape" aria-hidden="true">
      {wallLike.map((row, r) => (
        <div key={r} className="pixel-thumb-escape-row">
          {row.split('').map((v, c) => (
            <span key={c} className={`pixel-thumb-escape-cell pixel-thumb-escape-cell--${v === '1' ? 'wall' : 'floor'}`} />
          ))}
        </div>
      ))}
      <span className="pixel-thumb-escape-cat">🐱</span>
      <span className="pixel-thumb-escape-key">🗝</span>
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
