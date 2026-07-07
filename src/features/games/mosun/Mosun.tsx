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

import { BOARD_SIZE, deriveRuleForReveal, generatePlacements } from './rules'
import type { CardKind, Placed, RevealHistoryEntry } from './rules'
import { useEffectsFire } from '../../../effects/EffectsProvider'

interface CardState {
  kind: CardKind;
  ownerId?: string;
  revealed: boolean;
  revealedBy?: string;
}

const PASS_ALLOWANCE = 1

function initialBoardFromSeed(seed: number): CardState[] {
  const placements = generatePlacements(seed)
  return placements.map((p) => ({ kind: p.kind, revealed: false }))
}

function placementsFromBoard(board: CardState[]): Placed[] {
  return board.map((c, index) => ({ index, kind: c.kind }))
}

interface RulesLogRow {
  kind: CardKind;
  text: string;
  owner?: string;
  ruleId: string;
  cardIndex: number;
  scope: 'ALL' | 'ME';
  type: 'relation' | 'conditional' | 'elimination' | 'exclusion';
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
  const [rulesLog, setRulesLog] = useState<RulesLogRow[]>([])
  const [rulesOverlay, setRulesOverlay] = useState<'all-rules' | 'opp-personal' | null>(null)
  const [lastOppRule, setLastOppRule] = useState<string | null>(null)
  // Modal shown when *I* reveal an ALL or my own ME. Displays the rule
  // text and blocks the board until dismissed so the user actually
  // reads the fresh info.
  const [pendingRuleModal, setPendingRuleModal] = useState<{ scope: 'ALL' | 'ME'; text: string; type: string } | null>(null)
  const fire = useEffectsFire()

  const me = players.find((p) => p.id === peerId)
  const opponent = players.find((p) => p.id !== peerId)
  const myName = me?.name ?? '나'
  const opponentName = opponent?.name ?? '상대방'
  const isMyTurn = turnHostId === peerId && isOpponentOnline && !gameWinner

  const boardRef = useRef(board)
  useEffect(() => { boardRef.current = board }, [board])

  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])

  // Handshake: guest sends HELLO on mount, host responds with the seed.
  // Guarantees delivery regardless of listener attach order — no blind
  // burst. If host has already sent (guest was slow), guest can also
  // idempotently accept whatever seed arrives first.
  const seedBroadcastRef = useRef(false)
  useEffect(() => {
    if (!isHost) return
    if (!isOpponentOnline) return
    // Initialise pass allowance for both players once opp online.
    const pl = players.reduce<Record<string, number>>((acc, p) => {
      acc[p.id] = PASS_ALLOWANCE
      return acc
    }, {})
    setPassLeft(pl)
  }, [isHost, isOpponentOnline, players])

  // Guest side: send HELLO on mount. Retry once at 1500ms if seed still
  // missing (in case host wasn't yet ready). No further burst — the
  // handshake is authoritative.
  useEffect(() => {
    if (isHost) return
    if (!isOpponentOnline) return
    const sendHello = () => sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'MOSUN_HELLO' },
    })
    sendHello()
    const retry = setTimeout(() => {
      if (boardRef.current.length === BOARD_SIZE) return
      sendHello()
    }, 1500)
    return () => clearTimeout(retry)
  }, [isHost, isOpponentOnline, peerId, sendMessage])

  // Host side: reply to HELLO with the current seed. Broadcast helper
  // exposed so we can also invoke it after applyMatchReset produces a
  // fresh seed.
  const sendSeed = useCallback(() => {
    if (!isHost) return
    seedBroadcastRef.current = true
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'MOSUN_SEED', hostScore: seedRef.current },
    })
  }, [isHost, peerId, sendMessage])

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

    // Derive the rule right now from the current knowledge state — every
    // revealed rule is guaranteed to add information. Both peers observe
    // the same reveal history in the same order, so they derive the same
    // fact independently (no extra network traffic).
    if (revealedKind === 'ALL' || revealedKind === 'ME') {
      const placements = placementsFromBoard(boardRef.current)
      // Snapshot the history at "before this reveal" so both peers see
      // the same input state.
      const historySnapshot: RevealHistoryEntry[] = rulesLog.map((r) => ({
        cardIndex: r.cardIndex, ruleId: r.ruleId, scope: r.scope, ownerId: r.owner, type: r.type,
      }))
      const scope = revealedKind === 'ALL' ? 'ALL' as const : 'ME' as const
      const fact = deriveRuleForReveal({
        placements,
        seed: seedRef.current,
        revealHistory: historySnapshot,
        revealCardIndex: idx,
        scope,
        ownerId: scope === 'ME' ? byId : undefined,
      })
      if (fact) {
        setRulesLog((prev) => [...prev, {
          kind: revealedKind as CardKind,
          text: fact.text,
          owner: scope === 'ME' ? byId : undefined,
          ruleId: fact.ruleId,
          cardIndex: idx,
          scope,
          type: fact.type,
        }])
        if (scope === 'ME' && byId !== peerId) {
          setLastOppRule(`${opponentName}이(가) 개인힌트 획득`)
        } else if (byId === peerId) {
          // Show a blocking modal so the player registers the new rule
          // before continuing (spec §C-3 "카드 오픈 연출").
          setPendingRuleModal({ scope, text: fact.text, type: fact.type })
        }
        // 배제형 특별 연출 (spec §B: 등장 시 특별 연출) — 이 게임의 유일한 광역 배제
        if (fact.type === 'exclusion') {
          fire('spark-burst', {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            count: 40,
            color: '#c7e06a',
          })
          setLastOppRule(`✦ 배제형 규칙 등장 ✦ ${scope === 'ALL' ? '(공개)' : `(${opponentName})`}`)
        }
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
  }, [players, peerId, opponentName, finishMatch, fire, rulesLog])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      // NOTE: no self-filter — dispatchInbound only fires for RECEIVED messages;
      // peerId (roomId) is identical on both sides so the old senderId===peerId
      // check was actually dropping every remote GAME_ACTION.
      if (msg.type === 'GAME_ACTION') {
        const { actionType, cellIdx, hostScore, guestScore } = msg.payload
        if (actionType === 'MOSUN_HELLO') {
          // Guest arrived → host replies with current seed.
          if (isHost) sendSeed()
          return
        }
        if (actionType === 'MOSUN_SEED' && typeof hostScore === 'number') {
          if (seedRef.current === hostScore && boardRef.current.length === BOARD_SIZE) return
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
  }, [peerId, players, applyRevealLocal, applyMatchReset, finishMatch, isHost, sendSeed])

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

      {/* Explicit action-mode banner so player always knows what the
       * next card tap will do. Colour tracks the active mode. */}
      <div className={`mosun-mode-banner ${bombPickerActive ? 'mosun-mode-banner--target' : 'mosun-mode-banner--flip'}`}>
        <span className="mosun-mode-icon" aria-hidden="true">
          {bombPickerActive ? '🎯' : '🔄'}
        </span>
        <span className="mosun-mode-text">
          {bombPickerActive ? '폭탄 지목 모드 · 폭탄으로 의심되는 카드를 탭' : '뒤집기 모드 · 탭한 카드를 열어요'}
        </span>
      </div>

      <div className="game-board-region">
        {boardReady ? (
          <div className="mosun-board">
            {board.map((cell, idx) => {
              const face = cell.revealed
              const kindLower = cell.kind.toLowerCase()
              const cls = [
                'card-flip mosun-tile',
                `mosun-tile--${kindLower}`,
                face ? 'is-face' : '',
                bombPickerActive && !face ? 'is-target' : '',
              ].filter(Boolean).join(' ')
              const faceGlyph = cell.kind === 'BOMB' ? '💣'
                : cell.kind === 'ALL' ? '📢'
                : cell.kind === 'ME' ? '🔒'
                : '✓'
              const faceLabel = cell.kind === 'BOMB' ? '폭탄'
                : cell.kind === 'ALL' ? '전체힌트'
                : cell.kind === 'ME' ? '개인힌트'
                : '일반'
              return (
                <div key={idx} className={cls} onClick={() => handleFlip(idx)}>
                  <div className="card-flip-inner">
                    <div className="card-flip-face card-flip-face--back">?</div>
                    <div className="card-flip-face card-flip-face--front">
                      <div className="mosun-tile-icon" aria-hidden="true">{faceGlyph}</div>
                      <div className="mosun-tile-label">{faceLabel}</div>
                    </div>
                  </div>
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
          <span className="mosun-action-icon" aria-hidden="true">🔄</span>
          <span>뒤집기</span>
        </button>
        <button
          type="button"
          className="pixel-btn pixel-btn--secondary mosun-action-btn"
          disabled={!isMyTurn || (passLeft[peerId] ?? 0) <= 0 || bombPickerActive}
          onClick={handlePass}
        >
          <span className="mosun-action-icon" aria-hidden="true">⏭</span>
          <span>턴 넘기기 · {passLeft[peerId] ?? 0}</span>
        </button>
        <button
          type="button"
          className={`pixel-btn ${bombPickerActive ? 'pixel-btn--primary' : 'pixel-btn--ghost'} mosun-action-btn`}
          disabled={!isMyTurn}
          onClick={activateBombGuess}
        >
          <span className="mosun-action-icon" aria-hidden="true">{bombPickerActive ? '✕' : '🎯'}</span>
          <span>{bombPickerActive ? '취소' : '폭탄 찾기'}</span>
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
        hint="힌트를 캐고, 폭탄을 좁혀라"
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

      {pendingRuleModal && (
        <div className="mosun-rule-modal-overlay" onClick={() => setPendingRuleModal(null)}>
          <div className="mosun-rule-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mosun-rule-modal-eyebrow">
              {pendingRuleModal.type === 'exclusion' ? '✦ 배제형 힌트 획득 ✦' : `${pendingRuleModal.scope === 'ALL' ? '📢 전체힌트' : '🔒 개인힌트'} 획득`}
            </div>
            <div className="mosun-rule-modal-body">{pendingRuleModal.text}</div>
            <button type="button" className="pixel-btn pixel-btn--primary mosun-rule-modal-cta" onClick={() => setPendingRuleModal(null)}>
              확인
            </button>
          </div>
        </div>
      )}

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
