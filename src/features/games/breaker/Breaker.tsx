import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { GameGuideModal } from '../common/GameGuideModal'

interface BreakerProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
}

import { COLORS, RULE_BANK, pickRuleIndex } from './rules'
import type { ColorKey } from './rules'

const RULES = RULE_BANK
const MAX_ATTEMPTS = 10

const COLOR_STYLES: Record<ColorKey, { cssVar: string; label: string }> = {
  R: { cssVar: 'var(--game-color-r)', label: 'R' },
  G: { cssVar: 'var(--game-color-g)', label: 'G' },
  B: { cssVar: 'var(--game-color-b)', label: 'B' },
  Y: { cssVar: 'var(--game-color-y)', label: 'Y' },
}

interface Tap {
  by: string;   // playerId
  color: ColorKey;
  outcome: 'O' | 'X';
}

export function Breaker({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
}: BreakerProps) {
  const [seed, setSeed] = useState<number>(() => (isHost ? (Math.random() * 2 ** 31) | 0 : 0))
  const [ruleId, setRuleId] = useState<string>(() => {
    if (!isHost) return ''
    return RULES[pickRuleIndex(seed)].id
  })
  const [taps, setTaps] = useState<Tap[]>([])
  const [turnHostId, setTurnHostId] = useState<string>(() => players.find((p) => p.isHost)?.id ?? '')
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState<Record<string, number>>({})
  const [guideOpen, setGuideOpen] = useState(false)
  const [declareOpen, setDeclareOpen] = useState(false)
  const [wrongDeclareBy, setWrongDeclareBy] = useState<string | null>(null)

  const currentRule = RULES.find((r) => r.id === ruleId) ?? null
  const me = players.find((p) => p.id === peerId)
  const opponent = players.find((p) => p.id !== peerId)
  const myName = me?.name ?? '나'
  const opponentName = opponent?.name ?? '상대방'
  const isMyTurn = turnHostId === peerId && isOpponentOnline && !gameWinner && wrongDeclareBy !== peerId

  const tapsRef = useRef(taps)
  useEffect(() => { tapsRef.current = taps }, [taps])

  const seedBroadcastRef = useRef(false)
  useEffect(() => {
    if (!isHost || seedBroadcastRef.current) return
    if (!isOpponentOnline) return
    seedBroadcastRef.current = true
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BREAKER_SEED', hostScore: seed, guestScore: RULES.findIndex((r) => r.id === ruleId) },
    })
    const pl: Record<string, number> = {}
    players.forEach((p) => { pl[p.id] = MAX_ATTEMPTS })
    setAttemptsLeft(pl)
  }, [isHost, isOpponentOnline, peerId, seed, ruleId, sendMessage, players])

  useEffect(() => {
    if (isHost) return
    if (players.length < 2) return
    if (Object.keys(attemptsLeft).length > 0) return
    const pl: Record<string, number> = {}
    players.forEach((p) => { pl[p.id] = MAX_ATTEMPTS })
    setAttemptsLeft(pl)
  }, [isHost, players, attemptsLeft])

  const applyMatchReset = useCallback(() => {
    const nextSeed = isHost ? ((Math.random() * 2 ** 31) | 0) : 0
    setSeed(nextSeed)
    if (isHost) {
      setRuleId(RULES[pickRuleIndex(nextSeed)].id)
    } else {
      setRuleId('')
    }
    setTaps([])
    setTurnHostId(players.find((p) => p.isHost)?.id ?? '')
    setGameWinner(null)
    setWrongDeclareBy(null)
    setDeclareOpen(false)
    const pl: Record<string, number> = {}
    players.forEach((p) => { pl[p.id] = MAX_ATTEMPTS })
    setAttemptsLeft(pl)
    seedBroadcastRef.current = false
  }, [isHost, players])

  const handleRestartMatch = useCallback(() => {
    applyMatchReset()
    sendMessage({
      type: 'GAME_RESET', senderId: peerId, timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
  }, [applyMatchReset, peerId, sendMessage])

  const applyTapLocal = useCallback((color: ColorKey, byId: string) => {
    if (!currentRule) return
    setTaps((prev) => {
      const last = prev[prev.length - 1]?.color ?? null
      const outcome = currentRule.check(last, color)
      const next = [...prev, { by: byId, color, outcome }]
      setAttemptsLeft((a) => ({ ...a, [byId]: Math.max(0, (a[byId] ?? 0) - 1) }))
      return next
    })
    setTurnHostId((cur) => players.find((p) => p.id !== cur)?.id ?? cur)
  }, [currentRule, players])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.senderId === peerId) return
      if (msg.type === 'GAME_ACTION') {
        const { actionType, cellIdx, hostScore, guestScore } = msg.payload
        if (actionType === 'BREAKER_SEED' && typeof hostScore === 'number' && typeof guestScore === 'number') {
          setSeed(hostScore)
          setRuleId(RULES[Math.max(0, Math.min(RULES.length - 1, guestScore))].id)
        } else if (actionType === 'BREAKER_TAP' && typeof cellIdx === 'number' && cellIdx >= 0 && cellIdx < COLORS.length) {
          applyTapLocal(COLORS[cellIdx], msg.senderId)
        } else if (actionType === 'BREAKER_DECLARE' && typeof cellIdx === 'number') {
          const rule = RULES[cellIdx]
          if (!rule) return
          if (rule.id === ruleId) {
            const w = players.find((p) => p.id === msg.senderId)
            setGameWinner(w?.name ?? '알 수 없음')
          } else {
            setWrongDeclareBy(msg.senderId)
            setTimeout(() => setWrongDeclareBy(null), 4000)
          }
        }
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [peerId, players, ruleId, applyTapLocal, applyMatchReset])

  // Auto-lose if attempts exhausted
  useEffect(() => {
    if (gameWinner) return
    if (players.length < 2) return
    const out = players.filter((p) => (attemptsLeft[p.id] ?? MAX_ATTEMPTS) <= 0)
    if (out.length === 0) return
    const survivor = players.find((p) => !out.includes(p))
    if (survivor) setGameWinner(survivor.name)
  }, [attemptsLeft, players, gameWinner])

  const handleColorTap = (color: ColorKey) => {
    if (!isMyTurn) return
    if ((attemptsLeft[peerId] ?? 0) <= 0) return
    applyTapLocal(color, peerId)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BREAKER_TAP', cellIdx: COLORS.indexOf(color) },
    })
  }

  const handleDeclare = (chosenIdx: number) => {
    if (!isMyTurn) return
    setDeclareOpen(false)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BREAKER_DECLARE', cellIdx: chosenIdx },
    })
    const rule = RULES[chosenIdx]
    if (rule?.id === ruleId) setGameWinner(myName)
    else {
      setWrongDeclareBy(peerId)
      setTimeout(() => setWrongDeclareBy(null), 4000)
    }
  }

  const turnText = gameWinner
    ? '매치 종료'
    : !isOpponentOnline
      ? '상대 연결 대기'
      : wrongDeclareBy === peerId
        ? '오답 · 잠시 정지'
        : isMyTurn
          ? '내 턴 · 색 선택'
          : `${opponentName} 턴`

  const boardReady = !!currentRule
  const lastTaps = taps.slice(-6)
  const myAttempts = attemptsLeft[peerId] ?? MAX_ATTEMPTS
  const oppAttempts = opponent ? (attemptsLeft[opponent.id] ?? MAX_ATTEMPTS) : 0

  return (
    <div className="game-screen">
      <GameHeader
        code="BREAKER"
        playerCount={2}
        ruleTag={`${MAX_ATTEMPTS}회 시도`}
        onHelp={() => setGuideOpen(true)}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={isOpponentOnline ? `내 ${myAttempts} · 상대 ${oppAttempts}` : '재연결 중…'}
        variant={isMyTurn ? 'default' : 'idle'}
      />

      <div className="game-board-region">
        <div className="breaker-board">
          {boardReady ? (
            <>
              <div className="breaker-scoreboard">
                {lastTaps.length === 0 ? (
                  <div className="breaker-scoreboard-empty">색을 눌러 관찰하세요</div>
                ) : (
                  lastTaps.map((t, i) => (
                    <div key={i} className="breaker-scoreboard-cell">
                      <span className="breaker-scoreboard-color" style={{ background: COLOR_STYLES[t.color].cssVar }}>
                        {COLOR_STYLES[t.color].label}
                      </span>
                      <span className={`breaker-scoreboard-outcome breaker-scoreboard-outcome--${t.outcome.toLowerCase()}`}>
                        {t.outcome}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="breaker-color-grid">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="breaker-color-btn"
                    style={{ background: COLOR_STYLES[c].cssVar }}
                    disabled={!isMyTurn || myAttempts <= 0}
                    onClick={() => handleColorTap(c)}
                  >
                    {COLOR_STYLES[c].label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="memory-board-loading">규칙 동기화 중…</div>
          )}
        </div>
      </div>

      <div className="breaker-declare-row">
        <button
          type="button"
          className="pixel-btn pixel-btn--primary"
          disabled={!isMyTurn || myAttempts <= 0}
          onClick={() => setDeclareOpen(true)}
        >
          정답 선언
        </button>
      </div>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.id === turnHostId,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">{attemptsLeft[p.id] ?? MAX_ATTEMPTS}회</span>,
        }))}
        hint="색과 O/X를 관찰해 마스터 룰을 알아내세요"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />

      <GameGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="컬러 브레이커 가이드"
        steps={[
          { title: '보드', desc: '4색 버튼 · 정답 시퀀스 O/X가 전광판에 표시.' },
          { title: '내 턴', desc: '색을 눌러 관찰. 규칙을 알겠으면 "정답 선언".' },
          { title: '승리', desc: `먼저 마스터 룰을 정확히 선언 or 상대 시도 ${MAX_ATTEMPTS}회 소진시 승리.` },
        ]}
      />

      {declareOpen && (
        <div className="mosun-rules-overlay" onClick={() => setDeclareOpen(false)}>
          <div className="mosun-rules-card" onClick={(e) => e.stopPropagation()}>
            <div className="mosun-rules-title">마스터 룰 선언</div>
            <ul className="mosun-rules-list">
              {RULES.map((r, i) => (
                <li key={r.id} className="mosun-rules-item">
                  <button type="button" className="pixel-btn pixel-btn--secondary breaker-declare-choice" onClick={() => handleDeclare(i)}>
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="pixel-btn pixel-btn--ghost mosun-rules-close" onClick={() => setDeclareOpen(false)}>
              취소
            </button>
          </div>
        </div>
      )}

      {gameWinner && (
        <GameOverModal
          title="GAME OVER"
          winnerText={`${gameWinner} 승리`}
          scoreSummary={[
            { label: myName, value: `${MAX_ATTEMPTS - myAttempts}회` },
            { label: opponentName, value: `${MAX_ATTEMPTS - oppAttempts}회` },
            { label: '마스터 룰', value: currentRule?.label ?? '' },
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
