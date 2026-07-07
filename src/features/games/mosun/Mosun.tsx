import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { GameGuideModal } from '../common/GameGuideModal'

interface MosunProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
}

// Board composition: 9 cards
// 1 × BOMB, 3 × ALL (public rule), 3 × ME (private rule), 2 × SAFE
type CardKind = 'BOMB' | 'ALL' | 'ME' | 'SAFE'

interface CardState {
  kind: CardKind;
  ownerId?: string;         // for ME cards — set when flipped
  revealed: boolean;
  revealedBy?: string;      // playerId
}

const BOARD_SIZE = 9
const COMPOSITION: Record<CardKind, number> = { BOMB: 1, ALL: 3, ME: 3, SAFE: 2 }

const PASS_ALLOWANCE = 1

/**
 * Mulberry32 seeded shuffle so host + guest draw the same board from a
 * single broadcast seed number.
 */
function shuffleFromSeed<T>(input: T[], seed: number): T[] {
  const arr = input.slice()
  let a = seed | 0
  for (let i = arr.length - 1; i > 0; i--) {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    const j = Math.floor(r * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function initialBoardFromSeed(seed: number): CardState[] {
  const pool: CardKind[] = []
  ;(['BOMB', 'ALL', 'ME', 'SAFE'] as CardKind[]).forEach((k) => {
    for (let i = 0; i < COMPOSITION[k]; i++) pool.push(k)
  })
  const shuffled = shuffleFromSeed(pool, seed)
  return shuffled.map((k) => ({ kind: k, revealed: false }))
}

const SAMPLE_PUBLIC_RULES = [
  '이번 판, 폭탄은 격자의 코너 중 하나가 아니에요.',
  '이번 판, 폭탄과 인접(상하좌우)한 칸에 개인규칙 카드가 없어요.',
  '이번 판, 폭탄의 열(세로 3칸) 중 정확히 한 칸이 SAFE예요.',
  '이번 판, 폭탄의 행(가로 3칸)에 개인규칙 카드가 있어요.',
] as const

const SAMPLE_PRIVATE_RULES = [
  '내 개인규칙: 폭탄은 짝수 인덱스(0,2,4,6,8)가 아니에요.',
  '내 개인규칙: 폭탄과 같은 행/열에 ALL 카드가 있어요.',
  '내 개인규칙: 폭탄은 가운데(4번)가 아니에요.',
  '내 개인규칙: 폭탄과 같은 대각선에 SAFE가 있어요.',
] as const

function ruleTextFor(kind: CardKind, seed: number, offset: number): string {
  if (kind === 'ALL') return SAMPLE_PUBLIC_RULES[(seed + offset) % SAMPLE_PUBLIC_RULES.length]
  if (kind === 'ME') return SAMPLE_PRIVATE_RULES[(seed + offset) % SAMPLE_PRIVATE_RULES.length]
  return ''
}

export function Mosun({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
}: MosunProps) {
  const [seed, setSeed] = useState<number>(() => (isHost ? (Math.random() * 2 ** 31) | 0 : 0))
  const [board, setBoard] = useState<CardState[]>(() => (isHost ? initialBoardFromSeed(seed) : []))
  const [turnHostId, setTurnHostId] = useState<string>(() => players.find((p) => p.isHost)?.id ?? '')
  const [passLeft, setPassLeft] = useState<Record<string, number>>({})
  const [bombPickerActive, setBombPickerActive] = useState(false)
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [rulesLog, setRulesLog] = useState<Array<{ kind: CardKind; text: string; owner?: string }>>([])
  const [rulesOverlay, setRulesOverlay] = useState<'all-rules' | 'opp-personal' | null>(null)
  const [lastOppRule, setLastOppRule] = useState<string | null>(null)

  const me = players.find((p) => p.id === peerId)
  const opponent = players.find((p) => p.id !== peerId)
  const myName = me?.name ?? '나'
  const opponentName = opponent?.name ?? '상대방'
  const isMyTurn = turnHostId === peerId && isOpponentOnline && !gameWinner

  const boardRef = useRef(board)
  useEffect(() => { boardRef.current = board }, [board])

  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])

  const seedBroadcastRef = useRef(false)
  useEffect(() => {
    if (!isHost || seedBroadcastRef.current) return
    if (!isOpponentOnline) return
    seedBroadcastRef.current = true
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'MOSUN_SEED', hostScore: seed },
    })
    // Initialise pass allowance for both players
    const pl = players.reduce<Record<string, number>>((acc, p) => {
      acc[p.id] = PASS_ALLOWANCE
      return acc
    }, {})
    setPassLeft(pl)
  }, [isHost, isOpponentOnline, peerId, seed, sendMessage, players])

  useEffect(() => {
    // Guest side pass allowance init once players known
    if (isHost) return
    if (Object.keys(passLeft).length > 0) return
    if (players.length < 2) return
    const pl: Record<string, number> = {}
    players.forEach((p) => { pl[p.id] = PASS_ALLOWANCE })
    setPassLeft(pl)
  }, [isHost, players, passLeft])

  const applyMatchReset = useCallback(() => {
    const nextSeed = isHost ? ((Math.random() * 2 ** 31) | 0) : 0
    setSeed(nextSeed)
    setBoard(isHost ? initialBoardFromSeed(nextSeed) : [])
    setTurnHostId(players.find((p) => p.isHost)?.id ?? '')
    setBombPickerActive(false)
    setGameWinner(null)
    setRulesLog([])
    setLastOppRule(null)
    const pl: Record<string, number> = {}
    players.forEach((p) => { pl[p.id] = PASS_ALLOWANCE })
    setPassLeft(pl)
    seedBroadcastRef.current = false
  }, [isHost, players])

  const handleRestartMatch = useCallback(() => {
    applyMatchReset()
    sendMessage({
      type: 'GAME_RESET', senderId: peerId, timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
  }, [applyMatchReset, peerId, sendMessage])

  const finishMatch = useCallback((winnerId: string) => {
    const w = players.find((p) => p.id === winnerId)
    setGameWinner(w?.name ?? '알 수 없음')
  }, [players])

  const applyRevealLocal = useCallback((idx: number, byId: string) => {
    let bombRevealed = false
    let revealedKind: CardKind | null = null
    setBoard((prev) => {
      if (!prev[idx] || prev[idx].revealed) return prev
      const next = prev.slice()
      next[idx] = { ...next[idx], revealed: true, revealedBy: byId, ownerId: next[idx].kind === 'ME' ? byId : undefined }
      revealedKind = next[idx].kind
      if (revealedKind === 'BOMB') bombRevealed = true
      return next
    })

    // Log rule text if this reveal produces one
    if (revealedKind === 'ALL' || revealedKind === 'ME') {
      const text = ruleTextFor(revealedKind, seedRef.current, idx)
      setRulesLog((prev) => [...prev, { kind: revealedKind as CardKind, text, owner: revealedKind === 'ME' ? byId : undefined }])
      if (revealedKind === 'ME' && byId !== peerId) {
        // Opponent got a private rule — show a lightweight banner locally.
        setLastOppRule(`${opponentName}이(가) 개인규칙 획득`)
      }
    }

    if (bombRevealed) {
      // Player who flipped BOMB loses; opponent wins.
      const winnerId = players.find((p) => p.id !== byId)?.id
      if (winnerId) finishMatch(winnerId)
      return
    }

    // Same-turn continuation: SAFE keeps the turn, others hand it over.
    if (revealedKind === 'SAFE') return
    setTurnHostId((cur) => players.find((p) => p.id !== cur)?.id ?? cur)
  }, [players, peerId, opponentName, finishMatch])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.senderId === peerId) return
      if (msg.type === 'GAME_ACTION') {
        const { actionType, cellIdx, hostScore, guestScore } = msg.payload
        if (actionType === 'MOSUN_SEED' && typeof hostScore === 'number') {
          setSeed(hostScore)
          setBoard(initialBoardFromSeed(hostScore))
        } else if (actionType === 'MOSUN_FLIP' && typeof cellIdx === 'number') {
          applyRevealLocal(cellIdx, msg.senderId)
        } else if (actionType === 'MOSUN_PASS') {
          setPassLeft((prev) => ({ ...prev, [msg.senderId]: Math.max(0, (prev[msg.senderId] ?? 0) - 1) }))
          setTurnHostId((cur) => players.find((p) => p.id !== cur)?.id ?? cur)
        } else if (actionType === 'MOSUN_BOMB_GUESS' && typeof cellIdx === 'number') {
          const cell = boardRef.current[cellIdx]
          const guessedRight = cell?.kind === 'BOMB'
          if (guessedRight) {
            finishMatch(msg.senderId)
          } else {
            const winnerId = players.find((p) => p.id !== msg.senderId)?.id
            if (winnerId) finishMatch(winnerId)
          }
        } else if (actionType === 'MOSUN_SCORE_SYNC' && typeof guestScore === 'number') {
          // reserved
        }
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [peerId, players, applyRevealLocal, applyMatchReset, finishMatch])

  const handleFlip = (idx: number) => {
    if (!isMyTurn) return
    if (bombPickerActive) {
      // Pick a bomb: broadcast, both sides check
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'MOSUN_BOMB_GUESS', cellIdx: idx },
      })
      const cell = boardRef.current[idx]
      if (cell?.kind === 'BOMB') finishMatch(peerId)
      else {
        const winnerId = players.find((p) => p.id !== peerId)?.id
        if (winnerId) finishMatch(winnerId)
      }
      setBombPickerActive(false)
      return
    }
    if (board[idx]?.revealed) return
    applyRevealLocal(idx, peerId)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'MOSUN_FLIP', cellIdx: idx },
    })
  }

  const handlePass = () => {
    if (!isMyTurn) return
    if ((passLeft[peerId] ?? 0) <= 0) return
    setPassLeft((prev) => ({ ...prev, [peerId]: Math.max(0, (prev[peerId] ?? 0) - 1) }))
    setTurnHostId((cur) => players.find((p) => p.id !== cur)?.id ?? cur)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'MOSUN_PASS' },
    })
  }

  const activateBombGuess = () => {
    if (!isMyTurn) return
    setBombPickerActive((v) => !v)
  }

  const turnText = gameWinner
    ? '매치 종료'
    : !isOpponentOnline
      ? '상대 연결 대기'
      : isMyTurn
        ? bombPickerActive ? '폭탄 위치 선택' : '내 턴 · 카드 선택'
        : `${opponentName} 턴`

  const boardReady = board.length === BOARD_SIZE
  const publicRuleCount = rulesLog.filter((r) => r.kind === 'ALL').length
  const myPrivateCount = rulesLog.filter((r) => r.kind === 'ME' && r.owner === peerId).length

  return (
    <div className="game-screen">
      <GameHeader
        code="MOSUN"
        playerCount={2}
        ruleTag="추리"
        onHelp={() => setGuideOpen(true)}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={isOpponentOnline ? `공개 ${publicRuleCount} · 내 ${myPrivateCount}` : '재연결 중…'}
        variant={isMyTurn ? (bombPickerActive ? 'serve' : 'default') : 'idle'}
      />

      {lastOppRule && (
        <div className="mosun-flash" onAnimationEnd={() => setLastOppRule(null)}>
          {lastOppRule}
        </div>
      )}

      <div className="game-board-region">
        {boardReady ? (
          <div className="mosun-board">
            {board.map((cell, idx) => {
              const face = cell.revealed
              const cls = [
                'mosun-tile',
                face ? 'mosun-tile--face' : 'mosun-tile--back',
                face ? `mosun-tile--${cell.kind.toLowerCase()}` : '',
                bombPickerActive && !face ? 'mosun-tile--target' : '',
              ].filter(Boolean).join(' ')
              return (
                <div key={idx} className={cls} onClick={() => handleFlip(idx)}>
                  {face ? cell.kind : '?'}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="memory-board-loading">보드 동기화 중…</div>
        )}
      </div>

      <div className="mosun-actions">
        <button
          type="button"
          className="pixel-btn pixel-btn--primary mosun-action-btn"
          disabled={!isMyTurn || bombPickerActive}
          onClick={() => setBombPickerActive(false)}
        >
          뒤집기
        </button>
        <button
          type="button"
          className="pixel-btn pixel-btn--secondary mosun-action-btn"
          disabled={!isMyTurn || (passLeft[peerId] ?? 0) <= 0 || bombPickerActive}
          onClick={handlePass}
        >
          턴 넘기기 · {passLeft[peerId] ?? 0}
        </button>
        <button
          type="button"
          className={`pixel-btn ${bombPickerActive ? 'pixel-btn--primary' : 'pixel-btn--ghost'} mosun-action-btn`}
          disabled={!isMyTurn}
          onClick={activateBombGuess}
        >
          {bombPickerActive ? '취소' : '폭탄 찾기'}
        </button>
      </div>

      <div className="mosun-rules-strip" onClick={() => setRulesOverlay('all-rules')}>
        규칙 히스토리 · 공개 {publicRuleCount} · 내 {myPrivateCount}
      </div>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.id === turnHostId,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{passLeft[p.id] ?? 0}★</span>,
        }))}
        hint="폭탄을 피하고 상대의 패턴을 추리하세요"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />

      <GameGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="코드네임 · 모순 가이드"
        steps={[
          { title: '보드', desc: '9장 카드 · 폭탄 1 · 전체규칙 3 · 개인규칙 3 · 일반 2.' },
          { title: '내 턴', desc: '뒤집기 / 턴 넘기기(1회) / 폭탄 찾기 중 선택.' },
          { title: '승리', desc: '상대가 폭탄을 뒤집거나 내가 폭탄 위치를 맞추면 승리.' },
        ]}
      />

      {rulesOverlay === 'all-rules' && (
        <div className="mosun-rules-overlay" onClick={() => setRulesOverlay(null)}>
          <div className="mosun-rules-card" onClick={(e) => e.stopPropagation()}>
            <div className="mosun-rules-title">규칙 히스토리</div>
            {rulesLog.length === 0 ? (
              <div className="mosun-rules-empty">아직 공개된 규칙이 없어요.</div>
            ) : (
              <ul className="mosun-rules-list">
                {rulesLog.map((r, i) => (
                  <li key={i} className={`mosun-rules-item mosun-rules-item--${r.kind.toLowerCase()}`}>
                    <span className="mosun-rules-kind">{r.kind === 'ALL' ? '공개' : r.owner === peerId ? '내 규칙' : '상대 규칙'}</span>
                    <span className="mosun-rules-text">{r.owner && r.owner !== peerId ? '(비공개)' : r.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="pixel-btn pixel-btn--ghost mosun-rules-close" onClick={() => setRulesOverlay(null)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {gameWinner && (
        <GameOverModal
          title="GAME OVER"
          winnerText={`${gameWinner} 승리`}
          scoreSummary={[
            { label: myName, value: myPrivateCount, highlight: gameWinner === myName },
            { label: opponentName, value: rulesLog.filter((r) => r.kind === 'ME' && r.owner !== peerId).length, highlight: gameWinner === opponentName },
          ]}
          onRestart={handleRestartMatch}
          onLobby={onLobby}
          onChooseOther={onChooseOther}
          onExit={onExit}
          restartDisabled={!isOpponentOnline}
          restartHint={!isOpponentOnline ? '상대방 재연결 대기 중' : undefined}
        />
      )}
    </div>
  )
}
