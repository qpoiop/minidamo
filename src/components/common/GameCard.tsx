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

function PlaceholderThumb({ symbol, label }: { symbol: string; label: string }) {
  return (
    <div className="pixel-thumb-placeholder" aria-hidden="true">
      <span className="pixel-thumb-placeholder-glyph">{symbol}</span>
      <span className="pixel-thumb-placeholder-label">{label}</span>
    </div>
  )
}



/**
 * Home 카드 썸네일 — 이제 디자이너가 제공한 픽셀아트 PNG 를 그대로
 * 노출. 이전엔 인라인 SVG 로 개별 컴포넌트를 그렸는데 시안 리디자
 * 인 (v2 zip) 에서 9종 통일 팔레트로 다시 그려온 게 있어서 그걸 정
 * 답으로 씀. 컴포넌트-별 SVG (TicTacToeThumb, PingPongThumb …) 는
 * 아래에 fallback 으로 남겨 뒀지만 default 경로에서만 사용됨.
 *
 * 파일 규칙 · `public/{thumbKind}_thumb.png`. Designer 가 자산 교체
 * 만 하면 코드 변경 없이 반영됨. */
function Thumbnail({ game }: { game: GameInfo }) {
  if (game.thumbKind === 'placeholder') {
    return <PlaceholderThumb symbol={game.artText} label={game.isPlayable ? 'READY' : 'COMING SOON'} />
  }
  return (
    <img
      className="pixel-thumb-img"
      src={`/${game.thumbKind}_thumb.png`}
      alt={`${game.title} 썸네일`}
      loading="lazy"
      draggable={false}
    />
  )
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
