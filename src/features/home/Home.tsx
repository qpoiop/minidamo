import { useEffect, useState, useMemo } from 'react'
import { GameCard } from '../../components/common/GameCard'
import { LibraryThumb } from '../../components/common/LibraryThumb'
import { GAMES } from '../../games/registry'
import type { ThumbKind } from '../../games/registry'

export interface GameInfo {
  id: string;
  title: string;
  genre: '실시간 액션' | '전략' | '추리' | '협동';
  turnType: '턴제' | '실시간';
  desc: string;
  artText: string;
  version: string;
  updateDate: string;
  playerCount: number;
  isPlayable: boolean;
  thumbKind: ThumbKind;
}

// Every playable card is derived from the registry so we can't fall out of
// sync with the App router or the lobby options.
const PLAYABLE_GAMES: GameInfo[] = GAMES.map((g) => ({
  id: g.id,
  title: g.title,
  genre: g.genre,
  turnType: g.turnType,
  desc: g.desc,
  artText: g.title.slice(0, 2),
  version: g.version,
  updateDate: g.updateDate,
  playerCount: g.playerCount,
  isPlayable: true,
  thumbKind: g.thumbKind,
}))

const UPCOMING_GAMES: GameInfo[] = [
  {
    id: 'upcoming_placeholder',
    title: '다음 게임 준비 중',
    genre: '전략',
    turnType: '턴제',
    desc: '새로운 미니게임을 준비하고 있어요. 곧 만나요!',
    artText: '?',
    version: '—',
    updateDate: '—',
    playerCount: 2,
    isPlayable: false,
    thumbKind: 'placeholder',
  },
]

// Only show filter tabs for genres that actually have a playable game
// today. Derived from PLAYABLE_GAMES so adding a game with a new genre
// automatically surfaces the tab, and removing games hides stale tabs.
const GENRES: GameInfo['genre'][] = Array.from(new Set(PLAYABLE_GAMES.map((g) => g.genre)))
const FILTER_TABS = ['전체', ...GENRES] as const

/** 홈 슬라이더 노출 순서 · 세션 로드마다 랜덤. 이전엔 항상 tictactoe
 *  가 첫 카드로 나와서 사용자 피드백 "계속 틱택토만 먼저 보이게
 *  하지 말고 랜덤으로 보이게 해줘". Fisher-Yates 로 module-scope 에
 *  서 한 번 셔플 · 세션 동안 순서 유지 (매 렌더 셔플하면 사용자가
 *  카드 넘기다가 순서 튐). Upcoming 은 뒤로 고정. */
function shuffleOnce<T>(arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
const SHUFFLED_PLAYABLE = shuffleOnce(PLAYABLE_GAMES)
export const GAMES_LIST: GameInfo[] = [...SHUFFLED_PLAYABLE, ...UPCOMING_GAMES]

const INDICATOR_MAX = 5

interface HomeProps {
  userName: string;
  setUserName: (name: string) => void;
  onCreateRoom: (gameId: string) => void;
  onJoinNearby: () => void;
}

export function Home({ userName, setUserName, onCreateRoom, onJoinNearby }: HomeProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isNameModalOpen, setIsNameModalOpen] = useState(false)
  const [tempName, setTempName] = useState(userName)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGenre, setSelectedGenre] = useState<string>('전체')

  const activeGame = GAMES_LIST[activeIdx]

  // 슬라이더 프리페치 — 이전엔 카드 넘길 때마다 hero SVG 를 개별
  // fetch 라서 첫 접근이 렌더 지연 → "느리다" 는 피드백. 홈 mount
  // 시 모든 playable hero 를 브라우저 캐시에 채워 넣으면 슬라이더
  // 전환이 즉시 렌더됨. `<img>` 태그로 pre-load 하되 렌더 트리에서
  // 는 숨김 (0×0).
  useEffect(() => {
    PLAYABLE_GAMES.forEach((g) => {
      const img = new Image()
      img.src = `/${g.thumbKind}_hero.svg`
    })
  }, [])

  const shiftCard = (dir: 1 | -1) => (e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveIdx((prev) => (prev + dir + GAMES_LIST.length) % GAMES_LIST.length)
  }

  const handleNameSave = () => {
    const next = tempName.trim()
    if (next) {
      setUserName(next)
      setIsNameModalOpen(false)
    }
  }

  const filteredGames = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return GAMES_LIST.filter((g) => {
      const matchesSearch = g.title.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q)
      const matchesGenre = selectedGenre === '전체' || g.genre === selectedGenre
      return matchesSearch && matchesGenre
    })
  }, [searchQuery, selectedGenre])

  return (
    <div className="home-container">
      <div className="home-header">
        <div className="home-brand">
          <span className="pixel-logo-tile">M</span>
          <span className="brand-title">minidamo</span>
        </div>

        <div
          className="profile-chip"
          onClick={() => {
            setTempName(userName)
            setIsNameModalOpen(true)
          }}
        >
          <span>{userName}</span>
        </div>
      </div>

      <div className="slider-wrapper">
        <button
          type="button"
          className="pixel-arrow slider-arrow slider-arrow--left"
          onClick={shiftCard(-1)}
          aria-label="이전 게임"
        >
          ◀
        </button>

        <GameCard
          game={activeGame}
          indicator={
            <>
              {GAMES_LIST.slice(0, INDICATOR_MAX).map((_, i) => (
                <span
                  key={i}
                  className={`slider-dot ${activeIdx === i ? 'slider-dot--active' : ''}`}
                />
              ))}
              {GAMES_LIST.length > INDICATOR_MAX && (
                <span className="slider-dot-more">+{GAMES_LIST.length - INDICATOR_MAX}</span>
              )}
            </>
          }
          actionArea={
            activeGame.isPlayable ? (
              <>
                <button
                  type="button"
                  className="pixel-btn pixel-btn--primary"
                  onClick={() => onCreateRoom(activeGame.id)}
                >
                  방 만들기
                </button>
                <button
                  type="button"
                  className="pixel-btn pixel-btn--secondary"
                  onClick={onJoinNearby}
                >
                  방 찾기
                </button>
                <button
                  type="button"
                  className="pixel-btn pixel-btn--ghost home-test-btn"
                  onClick={() => {
                    const url = new URL(window.location.href)
                    url.searchParams.set('test', '1')
                    url.searchParams.set('game', activeGame.id)
                    window.location.href = url.toString()
                  }}
                >
                  테스트모드
                </button>
              </>
            ) : (
              <button type="button" className="pixel-btn pixel-btn--ghost" disabled>
                개발 준비 중
              </button>
            )
          }
        />

        <button
          type="button"
          className="pixel-arrow slider-arrow slider-arrow--right"
          onClick={shiftCard(1)}
          aria-label="다음 게임"
        >
          ▶
        </button>
      </div>

      <div
        className="pixel-dock bottom-dock-handle"
        onClick={() => setIsDrawerOpen(true)}
        role="button"
        tabIndex={0}
      >
        <span>LIBRARY</span>
      </div>

      <div className={`bottom-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <span className="drawer-title">
            게임 라이브러리
            <span className="drawer-title-count">{GAMES_LIST.length}</span>
          </span>
          <span className="drawer-close" onClick={() => setIsDrawerOpen(false)}>✕</span>
        </div>

        <div className="drawer-filters">
          <input
            type="text"
            className="pixel-input"
            placeholder="게임 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="drawer-filter-tabs">
            {FILTER_TABS.map((genre) => (
              <button
                key={genre}
                type="button"
                className={`filter-tab ${selectedGenre === genre ? 'filter-tab--active' : ''}`}
                onClick={() => setSelectedGenre(genre)}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-list">
          {filteredGames.length === 0 ? (
            <div className="drawer-empty">검색 조건에 부합하는 게임이 없어요</div>
          ) : (
            filteredGames.map((game) => {
              const origIdx = GAMES_LIST.findIndex((g) => g.id === game.id)
              const isActive = activeIdx === origIdx
              const itemClass = [
                'drawer-item',
                game.isPlayable ? '' : 'drawer-item--disabled',
                isActive ? 'drawer-item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <div
                  key={game.id}
                  className={itemClass}
                  onClick={() => {
                    if (!game.isPlayable) return
                    setActiveIdx(origIdx)
                    setIsDrawerOpen(false)
                  }}
                >
                  <div className="drawer-item-thumb">
                    <LibraryThumb kind={game.thumbKind} artText={game.artText} />
                  </div>
                  <div className="drawer-item-body">
                    <div className="drawer-item-title">{game.title}</div>
                    <div className="drawer-item-sub">
                      {game.genre} · {game.turnType} · {game.isPlayable ? '가능' : '준비 중'}
                    </div>
                  </div>
                  <span>▶</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {isNameModalOpen && (
        <div className="name-edit-modal-overlay" onClick={() => setIsNameModalOpen(false)}>
          <div className="name-edit-card" onClick={(e) => e.stopPropagation()}>
            <span className="name-edit-title">닉네임 변경</span>
            <input
              type="text"
              className="input-field"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="닉네임 입력"
              maxLength={12}
            />
            <div className="name-edit-actions">
              <button type="button" className="pixel-btn pixel-btn--primary" onClick={handleNameSave}>
                저장
              </button>
              <button
                type="button"
                className="pixel-btn pixel-btn--ghost"
                onClick={() => setIsNameModalOpen(false)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
