import { useState } from 'react'

export interface GameInfo {
  id: string;
  title: string;
  genre: string;
  desc: string;
  artText: string;
}

export const GAMES_LIST: GameInfo[] = [
  {
    id: 'tictactoe',
    title: '틱택토 (Tic-Tac-Toe)',
    genre: '턴제 전략',
    desc: '3x3 격자판 위에 가로, 세로, 대각선 중 한 줄을 먼저 일치시키는 전통 턴 대전 게임입니다.',
    artText: '❌ ⭕'
  },
  {
    id: 'pingpong',
    title: '미니 탁구 (Ping Pong)',
    genre: '실시간 액션',
    desc: '화면 좌우로 손가락을 밀어 패들을 움직이고, 상대방 골대에 공을 집어넣는 초저지연 실시간 핑퐁입니다.',
    artText: '🏓 ⚽ 🏓'
  }
]

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

  const activeGame = GAMES_LIST[activeIdx]

  const handleNextCard = () => {
    setActiveIdx((prev) => (prev + 1) % GAMES_LIST.length)
  }

  const handleNameSave = () => {
    if (tempName.trim()) {
      setUserName(tempName.trim())
      setIsNameModalOpen(false)
    }
  }

  return (
    <div className="home-container">
      {/* 상단 프로필 및 브랜드 */}
      <div className="home-header">
        <span className="brand-title">minidamo</span>
        <div className="profile-chip" onClick={() => { setTempName(userName); setIsNameModalOpen(true); }}>
          <span>👤 {userName}</span>
          <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>편집</span>
        </div>
      </div>

      {/* 카드 슬라이더 */}
      <div className="slider-wrapper" onClick={handleNextCard} style={{ cursor: 'pointer' }}>
        <div className="game-card" onClick={(e) => e.stopPropagation()}>
          <div className="game-card-art" style={{ fontSize: '2.5rem' }}>
            {activeGame.artText}
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="game-card-title">{activeGame.title}</span>
              <span style={{ background: 'rgba(255,255,255,0.05)', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', color: 'var(--primary)' }}>
                {activeGame.genre}
              </span>
            </div>
            <p className="game-card-desc">{activeGame.desc}</p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn-primary" onClick={() => onCreateRoom(activeGame.id)}>
              방 만들기
            </button>
            <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.6rem' }} onClick={onJoinNearby}>
              주변 참가하기
            </button>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        카드를 터치하면 다른 게임으로 전환됩니다.
      </div>

      {/* 우측 하단 플로팅 ☰ 버튼 */}
      <div className="floating-drawer-toggle" onClick={() => setIsDrawerOpen(true)}>
        ☰
      </div>

      {/* 하단 드로어 (바텀 시트) */}
      <div className={`bottom-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <span style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: '1.1rem' }}>게임 바로 탐색</span>
          <span onClick={() => setIsDrawerOpen(false)} style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--accent)' }}>닫기</span>
        </div>
        <div className="drawer-list">
          {GAMES_LIST.map((game, idx) => (
            <div
              key={game.id}
              className="drawer-item"
              onClick={() => {
                setActiveIdx(idx)
                setIsDrawerOpen(false)
              }}
            >
              <div>
                <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>{game.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '2px' }}>{game.genre}</div>
              </div>
              <span style={{ fontSize: '1rem' }}>➔</span>
            </div>
          ))}
        </div>
      </div>

      {/* 닉네임 수정 모달 팝업 */}
      {isNameModalOpen && (
        <div className="name-edit-modal-overlay" onClick={() => setIsNameModalOpen(false)}>
          <div className="name-edit-card" onClick={(e) => e.stopPropagation()}>
            <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>닉네임 변경</span>
            <input
              type="text"
              className="input-field"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="닉네임을 입력하세요"
              maxLength={12}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn-primary" style={{ padding: '0.6rem', fontSize: '0.85rem' }} onClick={handleNameSave}>
                저장
              </button>
              <button className="btn-secondary" style={{ padding: '0.6rem', fontSize: '0.85rem' }} onClick={() => setIsNameModalOpen(false)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
