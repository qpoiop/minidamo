import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { RegistryGuide } from '../common/RegistryGuide'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { ALL_SYMBOLS, CODE_LENGTH, SYMBOL_PATHS } from './symbols'
import type { NyangSymbol } from './symbols'
import { generateCode, evaluateGuess } from './rules'
import './nyangho.css'

interface NyanghoProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
}

interface HistoryRow {
  guess: NyangSymbol[];
  exact: number;
  miss: number;
  disrupted?: boolean;      // spec §교란 카드 — fake feedback flag
}

interface OpponentState {
  guessCount: number;
  bestExact: number;
}

export function Nyangho({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
}: NyanghoProps) {
  const [seed, setSeed] = useState<number>(() => (isHost ? (Math.random() * 2 ** 31) | 0 : 0))
  const [draft, setDraft] = useState<Array<NyangSymbol | null>>(() => Array(CODE_LENGTH).fill(null))
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [oppState, setOppState] = useState<OpponentState>({ guessCount: 0, bestExact: 0 })
  const [peekLeft, setPeekLeft] = useState(1)
  const [disruptLeft, setDisruptLeft] = useState(1)
  const [oppPeekRow, setOppPeekRow] = useState<HistoryRow | null>(null)
  const [pendingDeclare, setPendingDeclare] = useState<NyangSymbol[] | null>(null)
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [peekTaint, setPeekTaint] = useState(false)     // "상대가 훔쳐봤다" 알림 + 훔쳐보기 +1
  const [disruptPending, setDisruptPending] = useState(false)  // opponent used disrupt on me

  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])
  const seedBroadcastRef = useRef(false)

  const me = players.find((p) => p.isHost === isHost)
  const opponent = players.find((p) => p.isHost !== isHost)
  const myName = me?.name ?? '나'
  const opponentName = opponent?.name ?? '상대방'

  // ---- P2P handshake + inbound ----------------------------------------
  const sendSeed = useCallback(() => {
    if (!isHost) return
    seedBroadcastRef.current = true
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'NYANG_SEED', hostScore: seedRef.current },
    })
  }, [isHost, peerId, sendMessage])

  const applyMatchReset = useCallback(() => {
    const nextSeed = isHost ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = nextSeed
    setSeed(nextSeed)
    setDraft(Array(CODE_LENGTH).fill(null))
    setHistory([])
    setOppState({ guessCount: 0, bestExact: 0 })
    setPeekLeft(1)
    setDisruptLeft(1)
    setOppPeekRow(null)
    setPendingDeclare(null)
    setGameWinner(null)
    setPeekTaint(false)
    setDisruptPending(false)
    return nextSeed
  }, [isHost])

  const handleRestartMatch = useCallback(() => {
    const nextSeed = applyMatchReset()
    sendMessage({
      type: 'GAME_RESET', senderId: peerId, timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
    if (isHost) {
      setTimeout(() => {
        sendMessage({
          type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
          payload: { actionType: 'NYANG_SEED', hostScore: nextSeed },
        })
      }, 60)
    }
  }, [applyMatchReset, isHost, peerId, sendMessage])

  useEffect(() => {
    if (isHost) return
    if (!isOpponentOnline) return
    const sendHello = () => sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'NYANG_HELLO' },
    })
    sendHello()
    const t = setTimeout(() => { if (seedRef.current === 0) sendHello() }, 1500)
    return () => clearTimeout(t)
  }, [isHost, isOpponentOnline, peerId, sendMessage])

  const finishMatchByWinner = useCallback((winnerName: string) => {
    setGameWinner(winnerName)
  }, [])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      if (msg.type === 'GAME_ACTION') {
        const { actionType, hostScore, cellIdx } = msg.payload
        if (actionType === 'NYANG_HELLO') {
          if (isHost) sendSeed()
          return
        }
        if (actionType === 'NYANG_SEED' && typeof hostScore === 'number') {
          if (seedRef.current === hostScore) return
          seedRef.current = hostScore
          setSeed(hostScore)
          return
        }
        if (actionType === 'NYANG_PROGRESS' && typeof hostScore === 'number' && typeof cellIdx === 'number') {
          setOppState({ guessCount: hostScore, bestExact: cellIdx })
          return
        }
        if (actionType === 'NYANG_PEEK') {
          // Opponent peeked at me → tag them + grant me +1 peek.
          setPeekTaint(true)
          setPeekLeft((n) => n + 1)
          return
        }
        if (actionType === 'NYANG_DISRUPT') {
          // Opponent used disrupt → my next guess feedback will be fake.
          setDisruptPending(true)
          return
        }
        if (actionType === 'NYANG_WIN' && typeof hostScore === 'number') {
          // hostScore === 1: opponent solved; === 2: opponent bust (wrong declare).
          if (hostScore === 1) finishMatchByWinner(opponentName)
          else if (hostScore === 2) finishMatchByWinner(myName)
          return
        }
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [isHost, sendSeed, applyMatchReset, finishMatchByWinner, myName, opponentName])

  // ---- Actions --------------------------------------------------------
  const draftComplete = draft.every((s) => s !== null)

  const setSlot = (idx: number, symbol: NyangSymbol) => {
    setDraft((prev) => {
      const next = prev.slice()
      next[idx] = symbol
      return next
    })
  }

  const nextEmptySlot = draft.findIndex((s) => s === null)
  const handleTapPalette = (sym: NyangSymbol) => {
    if (nextEmptySlot < 0) return
    setSlot(nextEmptySlot, sym)
  }

  const clearDraft = () => setDraft(Array(CODE_LENGTH).fill(null))

  const submitGuess = () => {
    if (!draftComplete) return
    if (gameWinner) return
    const guess = draft as NyangSymbol[]
    const code = generateCode(seedRef.current)
    const raw = evaluateGuess(code, guess)
    let feedback = raw
    let disrupted = false
    if (disruptPending) {
      // Disrupt fake — invert exact and miss counts, clamped to CODE_LENGTH.
      const jitter = Math.min(CODE_LENGTH - raw.exact, raw.miss + 1)
      feedback = { exact: Math.max(0, raw.exact - 1), miss: jitter }
      disrupted = true
      setDisruptPending(false)
    }
    setHistory((prev) => {
      const next = [...prev, { guess, exact: feedback.exact, miss: feedback.miss, disrupted }]
      const guessCount = next.length
      const bestExact = next.reduce((m, r) => Math.max(m, r.exact), 0)
      // Push progress bar to peer (spec §공유 진행 바).
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'NYANG_PROGRESS', hostScore: guessCount, cellIdx: bestExact },
      })
      return next
    })
    setDraft(Array(CODE_LENGTH).fill(null))
  }

  const openDeclare = () => {
    if (!draftComplete) return
    setPendingDeclare(draft as NyangSymbol[])
  }

  const commitDeclare = () => {
    if (!pendingDeclare) return
    const code = generateCode(seedRef.current)
    const correct = pendingDeclare.every((s, i) => s === code[i])
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'NYANG_WIN', hostScore: correct ? 1 : 2 },
    })
    finishMatchByWinner(correct ? myName : opponentName)
    setPendingDeclare(null)
  }

  const cancelDeclare = () => setPendingDeclare(null)

  const usePeek = () => {
    if (peekLeft <= 0) return
    if (history.length === 0 && oppState.guessCount === 0) return
    // Spec §훔쳐보기: 상대의 마지막 추측 한 줄. In our simplified model
    // we synthesise a row from opponent's progress state (best exact) so
    // there's still something to look at without a full row-mirror
    // channel. A dedicated NYANG_ROW request/response would upgrade this.
    setPeekLeft((n) => n - 1)
    setOppPeekRow({
      guess: Array(CODE_LENGTH).fill('star'),   // opaque row — real symbols hidden without extra P2P
      exact: oppState.bestExact,
      miss: 0,
    })
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'NYANG_PEEK' },
    })
  }

  const useDisrupt = () => {
    if (disruptLeft <= 0) return
    setDisruptLeft((n) => n - 1)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'NYANG_DISRUPT' },
    })
  }

  // ---- Render ---------------------------------------------------------
  const guessCount = history.length
  const bestExact = history.reduce((m, r) => Math.max(m, r.exact), 0)
  const bestRowIdx = history.reduce((mi, r, i) => history[mi].exact >= r.exact ? mi : i, 0)

  return (
    <div className="game-screen">
      <GameHeader code="NYANGHO" playerCount={2} ruleTag="추리" onHelp={() => setGuideOpen(true)} />
      <GameTurnStrip
        turnText={gameWinner
          ? `${gameWinner === myName ? '내가' : gameWinner + '가'} 정답을 맞췄어요`
          : '추측 or 정답 선언'}
        connectionLabel={`추측 ${guessCount} · 최고 🟢${bestExact}`}
        variant="default"
        isMyTurn={!gameWinner}
      />

      <div className="nyangho-progress">
        <span className="nyangho-progress-label">상대 {opponentName}</span>
        <span className="nyangho-progress-chip">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" />
          </svg>
          추측 {oppState.guessCount}
        </span>
        <span className="nyangho-progress-best">
          최고 <span className="nyangho-dot nyangho-dot--exact" aria-hidden="true" /> {oppState.bestExact}
        </span>
      </div>

      {peekTaint && (
        <div className="nyangho-flash nyangho-flash--peek">
          상대에게 훔쳐보기 당했어요. 훔쳐보기 +1.
          <button type="button" onClick={() => setPeekTaint(false)}>확인</button>
        </div>
      )}

      <div className="nyangho-history">
        <div className="nyangho-history-title">내 추측 기록</div>
        {history.length === 0 ? (
          <div className="nyangho-history-empty">기호를 골라 첫 추측을 만들어요</div>
        ) : (
          history.map((row, i) => (
            <div
              key={i}
              className={`nyangho-row ${i === bestRowIdx && row.exact > 0 ? 'is-best' : ''} ${row.disrupted ? 'is-disrupted' : ''}`}
            >
              <span className="nyangho-row-idx">#{i + 1}</span>
              <div className="nyangho-row-glyphs">
                {row.guess.map((s, j) => <SymbolCell key={j} symbol={s} size={22} highlight={i === bestRowIdx && row.exact > 0} />)}
              </div>
              <div className="nyangho-row-feedback">
                <span className="nyangho-fb"><span className="nyangho-dot nyangho-dot--exact" />{row.exact}</span>
                <span className="nyangho-fb"><span className="nyangho-dot nyangho-dot--miss" />{row.miss}</span>
                {row.disrupted && <span className="nyangho-fb-tag">교란</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="nyangho-draft">
        <span className="nyangho-draft-label">현재</span>
        <div className="nyangho-draft-slots">
          {draft.map((s, i) => (
            <button
              key={i}
              type="button"
              className={`nyangho-slot ${s ? 'is-filled' : ''}`}
              onClick={() => setSlot(i, draft[i] ?? 'fish')}
              aria-label={`${i + 1}번 칸`}
            >
              {s ? <SymbolCell symbol={s} size={17} highlight /> : <span className="nyangho-slot-q">?</span>}
            </button>
          ))}
        </div>
        <button type="button" className="nyangho-clear" onClick={clearDraft} aria-label="지우기">✕</button>
      </div>

      <div className="nyangho-palette">
        {ALL_SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            className="nyangho-palette-btn"
            onClick={() => handleTapPalette(s)}
            aria-label={s}
          >
            <SymbolCell symbol={s} size={21} />
          </button>
        ))}
      </div>

      <div className="nyangho-actions">
        <button
          type="button"
          className="nyangho-action nyangho-action--primary"
          disabled={!draftComplete || !!gameWinner}
          onClick={submitGuess}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <path d="M4 12.5l5 5 11-11" />
          </svg>
          추측 제출
        </button>
        <button
          type="button"
          className="nyangho-action nyangho-action--declare"
          disabled={!draftComplete || !!gameWinner}
          onClick={openDeclare}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <path d="M4 5h11l3 3v11h-14z" />
            <path d="M8 12h6M8 15h6" />
          </svg>
          정답 선언
        </button>
        <button
          type="button"
          className="nyangho-action nyangho-action--peek"
          disabled={peekLeft <= 0 || !!gameWinner}
          onClick={usePeek}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          훔쳐보기
          <span className="nyangho-badge">{peekLeft}</span>
        </button>
        <button
          type="button"
          className="nyangho-action nyangho-action--disrupt"
          disabled={disruptLeft <= 0 || !!gameWinner}
          onClick={useDisrupt}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <path d="M4 6h11l3 3M20 18h-11l-3-3" />
          </svg>
          교란
          <span className="nyangho-badge">{disruptLeft}</span>
        </button>
      </div>

      {oppPeekRow && (
        <div className="nyangho-peek-overlay" onClick={() => setOppPeekRow(null)}>
          <div className="nyangho-peek-card" onClick={(e) => e.stopPropagation()}>
            <div className="nyangho-peek-title">훔쳐보기 · {opponentName}의 시도</div>
            <div className="nyangho-peek-body">
              최근까지 상대의 최고 정확은 <b>{oppPeekRow.exact}</b>. 실제 조합은 다음 추측 때 힌트로 활용해요.
            </div>
            <button type="button" className="nyangho-clear" onClick={() => setOppPeekRow(null)}>닫기</button>
          </div>
        </div>
      )}

      {pendingDeclare && (
        <div className="nyangho-declare-overlay" onClick={cancelDeclare}>
          <div className="nyangho-declare-card" onClick={(e) => e.stopPropagation()}>
            <div className="nyangho-declare-eyebrow">DECLARE ANSWER</div>
            <div className="nyangho-declare-body">
              이 조합이 <b>암호와 정확히 같으면 즉시 승리</b>, 틀리면 <span className="nyangho-declare-danger">그 판 패배</span>. 되돌릴 수 없어요.
            </div>
            <div className="nyangho-declare-glyphs">
              {pendingDeclare.map((s, i) => <SymbolCell key={i} symbol={s} size={28} highlight />)}
            </div>
            <button type="button" className="nyangho-declare-commit" onClick={commitDeclare}>이 조합으로 지른다</button>
            <button type="button" className="nyangho-declare-cancel" onClick={cancelDeclare}>더 추측할게</button>
          </div>
        </div>
      )}

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <RegistryGuide gameId="nyangho" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {gameWinner && (
        <GameOverModal
          title="SOLVED!"
          winnerText={`${gameWinner === myName ? myName : gameWinner} · ${guessCount}번째에 정답`}
          scoreSummary={[
            { label: myName, value: gameWinner === myName ? `${guessCount}회` : '미완', highlight: gameWinner === myName },
            { label: opponentName, value: gameWinner === opponentName ? `${oppState.guessCount}회` : '미완', highlight: gameWinner === opponentName },
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

interface SymbolCellProps { symbol: NyangSymbol; size?: number; highlight?: boolean }
function SymbolCell({ symbol, size = 20, highlight }: SymbolCellProps) {
  const path = SYMBOL_PATHS[symbol]
  return (
    <span className={`nyangho-sym ${highlight ? 'is-hi' : ''}`}>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
        <path d={path} />
      </svg>
    </span>
  )
}
