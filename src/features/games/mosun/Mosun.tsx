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
  // Turn state uses a role bool instead of a player.id. Bug: peerId is
  // the same room id on both sides, so `turnHostId === peerId` matched
  // on BOTH peers when turnHostId was the host's id — the guest
  // silently thought it was their turn from move 1. Boolean form
  // resolves without any player-id disambiguation.
  const [turnIsHost, setTurnIsHost] = useState<boolean>(true)
  // Pass allowance keyed by role (spec §D-3: 게임당 1회). Both peers
  // agree because role is the same on both sides.
  const [passLeft, setPassLeft] = useState<{ host: number; guest: number }>({ host: PASS_ALLOWANCE, guest: PASS_ALLOWANCE })
  const [bombPickerActive, setBombPickerActive] = useState(false)
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [rulesLog, setRulesLog] = useState<RulesLogRow[]>([])
  const [rulesOverlay, setRulesOverlay] = useState<'all-rules' | 'opp-personal' | null>(null)
  const [lastOppRule, setLastOppRule] = useState<string | null>(null)
  // Modal shown when *I* reveal an ALL or my own ME. Displays the rule
  // text and blocks the board until dismissed so the user actually
  // reads the fresh info.
  const [pendingRuleModal, setPendingRuleModal] = useState<{ scope: 'ALL' | 'ME'; text: string; type: string; opponent?: boolean } | null>(null)
  const fire = useEffectsFire()

  const me = players.find((p) => p.id === peerId)
  const opponent = players.find((p) => p.id !== peerId)
  const myName = me?.name ?? '나'
  const opponentName = opponent?.name ?? '상대방'
  const isMyTurn = turnIsHost === isHost && isOpponentOnline && !gameWinner

  const boardRef = useRef(board)
  useEffect(() => { boardRef.current = board }, [board])

  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])
  const turnIsHostRef = useRef(turnIsHost)
  useEffect(() => { turnIsHostRef.current = turnIsHost }, [turnIsHost])

  // Handshake: guest sends HELLO on mount, host responds with the seed.
  // Guarantees delivery regardless of listener attach order — no blind
  // burst. If host has already sent (guest was slow), guest can also
  // idempotently accept whatever seed arrives first.
  const seedBroadcastRef = useRef(false)
  useEffect(() => {
    if (!isHost) return
    if (!isOpponentOnline) return
    // Reset pass allowance both roles once opp online.
    setPassLeft({ host: PASS_ALLOWANCE, guest: PASS_ALLOWANCE })
  }, [isHost, isOpponentOnline])

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

  const applyMatchReset = useCallback(() => {
    const nextSeed = isHost ? ((Math.random() * 2 ** 31) | 0) : 0
    setSeed(nextSeed)
    setBoard(isHost ? initialBoardFromSeed(nextSeed) : [])
    setTurnIsHost(true)
    setBombPickerActive(false)
    setGameWinner(null)
    setRulesLog([])
    setLastOppRule(null)
    setPassLeft({ host: PASS_ALLOWANCE, guest: PASS_ALLOWANCE })
    seedBroadcastRef.current = false
  }, [isHost])

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

  const finishMatchByRole = useCallback((winnerIsHost: boolean) => {
    const w = players.find((p) => p.isHost === winnerIsHost)
    setGameWinner(w?.name ?? '알 수 없음')
  }, [players])

  const applyRevealLocal = useCallback((idx: number, byIsHost: boolean) => {
    // Owner id is resolved via role so both peers agree on which player
    // "owns" a private rule regardless of local id naming (host uses
    // "${roomId}:guest", guest uses "${roomId}:me" for the SAME player).
    const ownerRoleId = byIsHost ? 'ROLE_HOST' : 'ROLE_GUEST'
    const iAmOwner = byIsHost === isHost
    let bombRevealed = false
    let revealedKind: CardKind | null = null
    setBoard((prev) => {
      if (!prev[idx] || prev[idx].revealed) return prev
      const next = prev.slice()
      next[idx] = { ...next[idx], revealed: true, revealedBy: ownerRoleId, ownerId: next[idx].kind === 'ME' ? ownerRoleId : undefined }
      revealedKind = next[idx].kind
      if (revealedKind === 'BOMB') bombRevealed = true
      return next
    })

    if (revealedKind === 'ALL' || revealedKind === 'ME') {
      const placements = placementsFromBoard(boardRef.current)
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
        ownerId: scope === 'ME' ? ownerRoleId : undefined,
      })
      if (fact) {
        setRulesLog((prev) => [...prev, {
          kind: revealedKind as CardKind,
          text: fact.text,
          owner: scope === 'ME' ? ownerRoleId : undefined,
          ruleId: fact.ruleId,
          cardIndex: idx,
          scope,
          type: fact.type,
        }])
        // Rule modal: I get full text; opponent's private reveal gets the
        // spec-required "먹었다" notice instead of the text.
        setPendingRuleModal({
          scope,
          text: (scope === 'ME' && !iAmOwner) ? '(내용은 상대만 알아요)' : fact.text,
          type: fact.type,
          opponent: !iAmOwner,
        })
        if (fact.type === 'exclusion') {
          fire('spark-burst', {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            count: 40,
            color: '#c7e06a',
          })
        }
      }
    }

    if (bombRevealed) {
      // Player who flipped BOMB loses; opponent wins.
      finishMatchByRole(!byIsHost)
      return
    }
    if (revealedKind === 'SAFE') return    // SAFE keeps the current turn
    setTurnIsHost((v) => !v)               // otherwise flip the turn
  }, [isHost, rulesLog, fire])

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
          // The sender was whoever's turn it was. Boolean turn state
          // avoids any peerId disambiguation.
          applyRevealLocal(cellIdx, turnIsHostRef.current)
        } else if (actionType === 'MOSUN_PASS') {
          const senderRoleKey: 'host' | 'guest' = turnIsHostRef.current ? 'host' : 'guest'
          setPassLeft((prev) => ({ ...prev, [senderRoleKey]: Math.max(0, prev[senderRoleKey] - 1) }))
          setTurnIsHost((v) => !v)
        } else if (actionType === 'MOSUN_BOMB_GUESS' && typeof cellIdx === 'number') {
          const cell = boardRef.current[cellIdx]
          const guessedRight = cell?.kind === 'BOMB'
          finishMatchByRole(guessedRight ? turnIsHostRef.current : !turnIsHostRef.current)
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

  const myRoleKey: 'host' | 'guest' = isHost ? 'host' : 'guest'
  const myPassLeft = passLeft[myRoleKey]

  const handleFlip = (idx: number) => {
    if (!isMyTurn) return
    if (bombPickerActive) {
      // Pick a bomb: broadcast, both sides check
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'MOSUN_BOMB_GUESS', cellIdx: idx },
      })
      const cell = boardRef.current[idx]
      finishMatchByRole(cell?.kind === 'BOMB' ? isHost : !isHost)
      setBombPickerActive(false)
      return
    }
    if (board[idx]?.revealed) return
    applyRevealLocal(idx, isHost)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'MOSUN_FLIP', cellIdx: idx },
    })
  }

  const handlePass = () => {
    if (!isMyTurn) return
    if (myPassLeft <= 0) return
    setPassLeft((prev) => ({ ...prev, [myRoleKey]: Math.max(0, prev[myRoleKey] - 1) }))
    setTurnIsHost((v) => !v)
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
  const myPrivateCount = rulesLog.filter((r) => r.kind === 'ME' && r.owner === (isHost ? 'ROLE_HOST' : 'ROLE_GUEST')).length

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
          {bombPickerActive ? (
            <svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <circle cx="16" cy="16" r="12" />
              <circle cx="16" cy="16" r="7" />
              <circle cx="16" cy="16" r="2" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 14a10 10 0 0 1 18-4" />
              <path d="M24 6v6h-6" />
              <path d="M26 18a10 10 0 0 1-18 4" />
              <path d="M8 26v-6h6" />
            </svg>
          )}
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
              const faceIcon = cell.kind === 'BOMB' ? (
                <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true">
                  <circle cx="16" cy="20" r="8" />
                  <path d="M20 12l2-2 3 1-1 3-2 2z" />
                  <path d="M22 8l1-2 2 1-1 2z" />
                </svg>
              ) : cell.kind === 'ALL' ? (
                <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true">
                  <path d="M6 12h6l10-6v20l-10-6H6z" />
                  <path d="M4 12h2v8H4z" />
                </svg>
              ) : cell.kind === 'ME' ? (
                <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true">
                  <rect x="8" y="14" width="16" height="12" rx="2" />
                  <path d="M12 14v-4a4 4 0 0 1 8 0v4h-2v-4a2 2 0 0 0-4 0v4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 16l6 6 14-14" />
                </svg>
              )
              const faceLabel = cell.kind === 'BOMB' ? '폭탄'
                : cell.kind === 'ALL' ? '전체힌트'
                : cell.kind === 'ME' ? '개인힌트'
                : '일반'
              return (
                <div key={idx} className={cls} onClick={() => handleFlip(idx)}>
                  <div className="card-flip-inner">
                    <div className="card-flip-face card-flip-face--back">?</div>
                    <div className="card-flip-face card-flip-face--front">
                      <div className="mosun-tile-icon">{faceIcon}</div>
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
          className={`pixel-btn mosun-action-btn ${!bombPickerActive ? 'pixel-btn--primary mosun-action-btn--active' : 'pixel-btn--ghost'}`}
          disabled={!isMyTurn || bombPickerActive}
          onClick={() => setBombPickerActive(false)}
        >
          <svg viewBox="0 0 32 32" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 14a10 10 0 0 1 18-4" />
            <path d="M24 6v6h-6" />
            <path d="M26 18a10 10 0 0 1-18 4" />
            <path d="M8 26v-6h6" />
          </svg>
          <span>뒤집기</span>
        </button>
        <button
          type="button"
          className="pixel-btn pixel-btn--secondary mosun-action-btn"
          disabled={!isMyTurn || myPassLeft <= 0 || bombPickerActive}
          onClick={handlePass}
        >
          <svg viewBox="0 0 32 32" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M6 8v16l10-8z" />
            <path d="M18 8v16l10-8z" />
          </svg>
          <span>턴 넘기기 · {myPassLeft}</span>
        </button>
        <button
          type="button"
          className={`pixel-btn ${bombPickerActive ? 'pixel-btn--primary mosun-action-btn--active' : 'pixel-btn--ghost'} mosun-action-btn`}
          disabled={!isMyTurn}
          onClick={activateBombGuess}
        >
          {bombPickerActive ? (
            <svg viewBox="0 0 32 32" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" aria-hidden="true">
              <path d="M8 8l16 16M24 8l-16 16" />
            </svg>
          ) : (
            <svg viewBox="0 0 32 32" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <circle cx="16" cy="16" r="12" />
              <circle cx="16" cy="16" r="7" />
              <circle cx="16" cy="16" r="2" fill="currentColor" />
            </svg>
          )}
          <span>{bombPickerActive ? '취소' : '폭탄 찾기'}</span>
        </button>
      </div>

      <div className="mosun-rules-strip" onClick={() => setRulesOverlay('all-rules')}>
        규칙 히스토리 · 공개 {publicRuleCount} · 내 {myPrivateCount}
      </div>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.isHost === turnIsHost,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{passLeft[p.isHost ? 'host' : 'guest']}★</span>,
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
          <div
            className={`mosun-rule-modal-card mosun-rule-modal-card--${pendingRuleModal.type} ${pendingRuleModal.opponent ? 'mosun-rule-modal-card--opponent' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mosun-rule-modal-eyebrow">
              {pendingRuleModal.type === 'exclusion'
                ? '✦ 배제형 힌트 등장 ✦'
                : pendingRuleModal.opponent
                  ? `${opponentName}이(가) ${pendingRuleModal.scope === 'ALL' ? '전체힌트' : '개인힌트'} 획득`
                  : `${pendingRuleModal.scope === 'ALL' ? '전체힌트' : '개인힌트'} 획득`}
            </div>
            <div className="mosun-rule-modal-icon" aria-hidden="true">
              {pendingRuleModal.scope === 'ALL' ? (
                <svg viewBox="0 0 32 32" width="42" height="42" fill="currentColor"><path d="M6 12h6l10-6v20l-10-6H6z" /><path d="M4 12h2v8H4z" /></svg>
              ) : (
                <svg viewBox="0 0 32 32" width="42" height="42" fill="currentColor"><rect x="8" y="14" width="16" height="12" rx="2" /><path d="M12 14v-4a4 4 0 0 1 8 0v4h-2v-4a2 2 0 0 0-4 0v4z" /></svg>
              )}
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
                    <span className="mosun-rules-kind">{r.kind === 'ALL' ? '공개' : r.owner === (isHost ? 'ROLE_HOST' : 'ROLE_GUEST') ? '내 규칙' : '상대 규칙'}</span>
                    <span className="mosun-rules-text">{r.owner && r.owner !== (isHost ? 'ROLE_HOST' : 'ROLE_GUEST') ? '(비공개)' : r.text}</span>
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
            { label: opponentName, value: rulesLog.filter((r) => r.kind === 'ME' && r.owner !== (isHost ? 'ROLE_HOST' : 'ROLE_GUEST')).length, highlight: gameWinner === opponentName },
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
