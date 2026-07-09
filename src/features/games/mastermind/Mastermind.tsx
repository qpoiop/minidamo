import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { TurnTransitionToast } from '../common/TurnTransitionToast'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { RegistryGuide } from '../common/RegistryGuide'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { ALL_SYMBOLS, CODE_LENGTH, SYMBOL_PATHS } from './symbols'
import type { NyangSymbol } from './symbols'
import { generateCode, evaluateGuess } from './rules'
import './mastermind.css'
import { useRoleParticipants } from '../common/useRoleParticipants'
import { useMatchRestart } from '../common/useMatchRestart'

interface MastermindProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  soloMode?: boolean;
  /** matchOption = peek 사용 횟수 · matchOption2 = disrupt 사용 횟수 */
  matchOption?: number;
  matchOption2?: number;
}

/** Match presets — value is the matchOption number stored in
 * gameSettings.rounds. Kept co-located with the game so the game
 * screen can look up peek / disrupt counts in one place.
 * `rounds` is reserved for the upcoming multi-round loop but is not
 * yet consumed by the game — currently the first successful declare
 * ends the match regardless of preset. Labels reflect the shipped
 * behaviour so we don't over-promise. */
/** 훔쳐보기 · 교란 각각 매칭. matchOption = peek key, matchOption2 =
 *  disrupt key. Value 1/3/5 를 그대로 카운트로 매핑. */
const COUNT_BY_KEY: Record<number, number> = { 1: 1, 3: 2, 5: 3 }
export const NYANGHO_PRESETS: Record<number, {
  label: string;
  rounds: number;
  peek: number;
  disrupt: number;
}> = {
  1: { label: '훔 1', rounds: 1, peek: 1, disrupt: 1 },
  3: { label: '훔 2', rounds: 1, peek: 2, disrupt: 2 },
  5: { label: '훔 3', rounds: 1, peek: 3, disrupt: 3 },
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

export function Mastermind({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
  soloMode = false,
  matchOption = 1,
  matchOption2 = 1,
}: MastermindProps) {
  // peek · disrupt 를 개별 옵션에서 조립. NYANGHO_PRESETS 는 legacy
  // 호환용으로 남기고 여기서 count 를 직접 합침.
  const peekCount = COUNT_BY_KEY[matchOption] ?? 1
  const disruptCount = COUNT_BY_KEY[matchOption2] ?? 1
  const preset = { rounds: 1, peek: peekCount, disrupt: disruptCount, label: `훔 ${peekCount} · 교 ${disruptCount}` }
  const [seed, setSeed] = useState<number>(() => ((isHost || soloMode) ? (Math.random() * 2 ** 31) | 0 : 0))
  // Solo/test-mode isolation: per-role slots for state that the peer
  // shouldn't leak into. In multiplayer only the current role's slot
  // is ever written since isHost doesn't flip. In solo mode toggling
  // the role in the TestMode toolbar switches which slot is displayed,
  // so the tester can play both sides with their own history / spent
  // cards / draft, while the shared seed + turn state (same code, same
  // alternation) survive the toggle.
  const roleKey = isHost ? 'host' : 'guest'
  const [draftPerRole, setDraftPerRole] = useState<Record<'host' | 'guest', Array<NyangSymbol | null>>>(() => ({
    host: Array(CODE_LENGTH).fill(null),
    guest: Array(CODE_LENGTH).fill(null),
  }))
  const draft = draftPerRole[roleKey]
  const setDraft = (updater: Array<NyangSymbol | null> | ((prev: Array<NyangSymbol | null>) => Array<NyangSymbol | null>)) => {
    setDraftPerRole((prev) => ({
      ...prev,
      [roleKey]: typeof updater === 'function' ? updater(prev[roleKey]) : updater,
    }))
  }
  const [historyPerRole, setHistoryPerRole] = useState<Record<'host' | 'guest', HistoryRow[]>>(() => ({ host: [], guest: [] }))
  const history = historyPerRole[roleKey]
  const setHistory = (updater: HistoryRow[] | ((prev: HistoryRow[]) => HistoryRow[])) => {
    setHistoryPerRole((prev) => ({
      ...prev,
      [roleKey]: typeof updater === 'function' ? updater(prev[roleKey]) : updater,
    }))
  }
  const [oppStatePerRole, setOppStatePerRole] = useState<Record<'host' | 'guest', OpponentState>>(() => ({
    host: { guessCount: 0, bestExact: 0 },
    guest: { guessCount: 0, bestExact: 0 },
  }))
  const oppState = oppStatePerRole[roleKey]
  const setOppState = (updater: OpponentState | ((prev: OpponentState) => OpponentState)) => {
    setOppStatePerRole((prev) => ({
      ...prev,
      [roleKey]: typeof updater === 'function' ? updater(prev[roleKey]) : updater,
    }))
  }
  const [peekLeftPerRole, setPeekLeftPerRole] = useState<Record<'host' | 'guest', number>>(() => ({
    host: preset.peek,
    guest: preset.peek,
  }))
  const peekLeft = peekLeftPerRole[roleKey]
  const setPeekLeft = (updater: number | ((prev: number) => number)) => {
    setPeekLeftPerRole((prev) => ({
      ...prev,
      [roleKey]: typeof updater === 'function' ? updater(prev[roleKey]) : updater,
    }))
  }
  const [disruptLeftPerRole, setDisruptLeftPerRole] = useState<Record<'host' | 'guest', number>>(() => ({
    host: preset.disrupt,
    guest: preset.disrupt,
  }))
  const disruptLeft = disruptLeftPerRole[roleKey]
  const setDisruptLeft = (updater: number | ((prev: number) => number)) => {
    setDisruptLeftPerRole((prev) => ({
      ...prev,
      [roleKey]: typeof updater === 'function' ? updater(prev[roleKey]) : updater,
    }))
  }
  // Round tracker — reserved for the multi-round follow-up; single-
  // round matches don't touch it. Kept as state so match reset can
  // clear it without a scope leak later.
  const [, setRoundScore] = useState<{ host: number; guest: number }>({ host: 0, guest: 0 })
  const [, setCurrentRound] = useState(1)
  const [oppPeekRow, setOppPeekRow] = useState<HistoryRow | null>(null)
  const [peekReveal, setPeekReveal] = useState<{ idxA: number; idxB: number } | null>(null)
  const [pendingDeclare, setPendingDeclare] = useState<NyangSymbol[] | null>(null)
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  // Narrative reason for the match ending — drives the game-over card
  // copy so users understand WHY they won/lost, not just the outcome.
  const [endReason, setEndReason] = useState<
    | 'declare-correct'
    | 'declare-wrong'
    | 'opp-declare-correct'
    | 'opp-declare-wrong'
    | null
  >(null)
  // Turn gate — Mastermind-style but strictly alternating so the user
  // isn't guessing three times in a row without giving the peer a chance.
  // Host has first turn by convention.
  const [turnIsHost, setTurnIsHost] = useState(true)
  // Enforced turn alternation — solo/test mode users switch role via
  // the TestMode toolbar to act as the other side (state persists,
  // no board reset).
  const isMyTurn = turnIsHost === isHost && isOpponentOnline && !gameWinner
  void soloMode
  const [guideOpen, setGuideOpen] = useState(false)
  const [peekTaintPerRole, setPeekTaintPerRole] = useState<Record<'host' | 'guest', boolean>>(() => ({ host: false, guest: false }))
  const peekTaint = peekTaintPerRole[roleKey]
  const setPeekTaint = (v: boolean) => setPeekTaintPerRole((prev) => ({ ...prev, [roleKey]: v }))
  const [disruptPendingPerRole, setDisruptPendingPerRole] = useState<Record<'host' | 'guest', boolean>>(() => ({ host: false, guest: false }))
  const disruptPending = disruptPendingPerRole[roleKey]
  const setDisruptPending = (v: boolean) => setDisruptPendingPerRole((prev) => ({ ...prev, [roleKey]: v }))
  // Short-lived flash strip shown after either player uses a card.
  const [actionFlash, setActionFlash] = useState<{ text: string; tone: 'peek' | 'disrupt' } | null>(null)
  const flashTimerRef = useRef<number | null>(null)
  const showActionFlash = useCallback((text: string, tone: 'peek' | 'disrupt') => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setActionFlash({ text, tone })
    flashTimerRef.current = window.setTimeout(() => setActionFlash(null), 2400)
  }, [])
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current) }, [])

  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])
  const seedBroadcastRef = useRef(false)

  const { myName, opponentName } = useRoleParticipants(players, isHost)

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
    const nextSeed = (isHost || soloMode) ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = nextSeed
    setSeed(nextSeed)
    // Reset BOTH role slots so solo/test-mode toggle doesn't retain
    // ghost state from a previous match.
    const emptyDraft = Array(CODE_LENGTH).fill(null)
    setDraftPerRole({ host: emptyDraft, guest: [...emptyDraft] })
    setHistoryPerRole({ host: [], guest: [] })
    setOppStatePerRole({
      host: { guessCount: 0, bestExact: 0 },
      guest: { guessCount: 0, bestExact: 0 },
    })
    setPeekLeftPerRole({ host: preset.peek, guest: preset.peek })
    setDisruptLeftPerRole({ host: preset.disrupt, guest: preset.disrupt })
    setPeekTaintPerRole({ host: false, guest: false })
    setDisruptPendingPerRole({ host: false, guest: false })
    setOppPeekRow(null)
    setPendingDeclare(null)
    setGameWinner(null)
    setEndReason(null)
    setTurnIsHost(true)
    setRoundScore({ host: 0, guest: 0 })
    setCurrentRound(1)
    return nextSeed
  }, [isHost, soloMode, preset.peek, preset.disrupt])

  const onHostPostReset = useCallback((nextSeed: number) => {
    setTimeout(() => {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'NYANG_SEED', hostScore: nextSeed },
      })
    }, 60)
  }, [sendMessage, peerId])
  const { handleRestartMatch } = useMatchRestart({ applyMatchReset, sendMessage, peerId, isHost, onHostPostReset })

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
          // Peer completed a guess — turn returns to me.
          setTurnIsHost(isHost)
          return
        }
        if (actionType === 'NYANG_PEEK') {
          // Opponent peeked at me → tag them + grant me +1 peek + flash.
          setPeekTaint(true)
          setPeekLeft((n) => n + 1)
          showActionFlash(`${opponentName}이(가) 내 시도를 훔쳐봤어요. 훔쳐보기 +1을 얻었어요.`, 'peek')
          return
        }
        if (actionType === 'NYANG_DISRUPT') {
          // Opponent used disrupt → my next guess feedback will be fake.
          setDisruptPending(true)
          showActionFlash(`${opponentName}이(가) 교란 카드를 썼어요. 내 다음 추측 피드백이 왜곡돼요.`, 'disrupt')
          return
        }
        if (actionType === 'NYANG_WIN' && typeof hostScore === 'number') {
          // hostScore === 1: opponent solved; === 2: opponent bust (wrong declare).
          if (hostScore === 1) {
            setEndReason('opp-declare-correct')
            finishMatchByWinner(opponentName)
          } else if (hostScore === 2) {
            setEndReason('opp-declare-wrong')
            finishMatchByWinner(myName)
          }
          return
        }
      }
      // GAME_RESET · RESTART handled by useMatchRestart listener.
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [isHost, sendSeed, finishMatchByWinner, myName, opponentName])

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
    if (!isMyTurn) return
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
    // Pass the turn — peer will see NYANG_PROGRESS and act.
    setTurnIsHost(!isHost)
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
    setEndReason(correct ? 'declare-correct' : 'declare-wrong')
    finishMatchByWinner(correct ? myName : opponentName)
    setPendingDeclare(null)
  }

  const cancelDeclare = () => setPendingDeclare(null)

  const usePeek = () => {
    if (peekLeft <= 0) return
    // Peek reveals ONE cell of the actual code — 2 was too generous
    // (half the answer in a 4-cell code). A single cell is a nudge,
    // not a spoiler; the player still has to solve the rest.
    setPeekLeft((n) => n - 1)
    const code = generateCode(seedRef.current)
    // Deterministic per-peek pick — successive peeks land on
    // different cells so buying a second card isn't wasted on the
    // same reveal.
    const rng = (seedRef.current ^ (peekLeft * 2654435761)) >>> 0
    const idxA = rng % CODE_LENGTH
    const shown: Array<NyangSymbol | null> = Array(CODE_LENGTH).fill(null)
    shown[idxA] = code[idxA]
    setOppPeekRow({
      guess: shown.map((s) => s ?? 'star'),
      exact: 1,
      miss: 0,
    })
    setPeekReveal({ idxA, idxB: idxA })
    showActionFlash(`훔쳐보기 발동! ${opponentName}에게도 알림이 갔어요.`, 'peek')
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'NYANG_PEEK' },
    })
    // Solo/test mode: sendMessage is a no-op so the peer role never
    // sees the effect. Apply directly to the opposite slot so the
    // tester can verify the flow.
    if (soloMode) {
      const oppKey: 'host' | 'guest' = isHost ? 'guest' : 'host'
      setPeekTaintPerRole((p) => ({ ...p, [oppKey]: true }))
      setPeekLeftPerRole((p) => ({ ...p, [oppKey]: p[oppKey] + 1 }))
    }
  }

  const useDisrupt = () => {
    if (disruptLeft <= 0) return
    setDisruptLeft((n) => n - 1)
    showActionFlash(`교란 발동! ${opponentName}의 다음 피드백이 왜곡돼요.`, 'disrupt')
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'NYANG_DISRUPT' },
    })
    // Solo/test mode: apply the effect to the opposite role slot
    // directly so the tester can verify that the peer's next guess
    // is distorted.
    if (soloMode) {
      const oppKey: 'host' | 'guest' = isHost ? 'guest' : 'host'
      setDisruptPendingPerRole((p) => ({ ...p, [oppKey]: true }))
    }
  }

  // ---- Render ---------------------------------------------------------
  const guessCount = history.length
  const bestExact = history.reduce((m, r) => Math.max(m, r.exact), 0)
  const bestRowIdx = history.reduce((mi, r, i) => history[mi].exact >= r.exact ? mi : i, 0)

  return (
    <div className="game-screen" data-my-turn={isMyTurn && !gameWinner ? '1' : '0'}>
      <GameHeader code="NYANGHO" onHelp={() => setGuideOpen(true)} onExit={onExit} onRestart={handleRestartMatch} isHost={isHost} />
      <GameTurnStrip
        turnText={
          gameWinner
            ? '매치 종료'
            : isMyTurn
              ? '내 턴 · 추측 or 정답 선언'
              : `${opponentName} 턴 · 대기`
        }
        connectionLabel={`내 ${guessCount}회·최고 ${bestExact} / 상대 ${oppState.guessCount}회·최고 ${oppState.bestExact}`}
        variant={gameWinner ? 'idle' : isMyTurn ? 'default' : 'idle'}
        isMyTurn={!!isMyTurn}
      />

      {peekTaint && (
        <div className="mastermind-flash mastermind-flash--peek">
          상대에게 훔쳐보기 당했어요. 훔쳐보기 +1.
          <button type="button" onClick={() => setPeekTaint(false)}>확인</button>
        </div>
      )}
      {disruptPending && (
        <div className="mastermind-flash mastermind-flash--disrupt">
          다음 추측 피드백이 <b>왜곡</b>돼요. 신중히 결정.
        </div>
      )}
      {actionFlash && (
        <div className={`mastermind-flash mastermind-flash--${actionFlash.tone}`} key={actionFlash.text}>
          {actionFlash.text}
        </div>
      )}

      <div className="mastermind-history">
        <div className="mastermind-history-title">내 추측 기록</div>
        {history.length === 0 ? (
          <div className="mastermind-history-empty">기호를 골라 첫 추측을 만들어요</div>
        ) : (
          history.map((row, i) => (
            <div
              key={i}
              className={`mastermind-row ${i === bestRowIdx && row.exact > 0 ? 'is-best' : ''} ${row.disrupted ? 'is-disrupted' : ''}`}
            >
              <span className="mastermind-row-idx">#{i + 1}</span>
              <div className="mastermind-row-glyphs">
                {row.guess.map((s, j) => <SymbolCell key={j} symbol={s} size={22} highlight={i === bestRowIdx && row.exact > 0} />)}
              </div>
              <div className="mastermind-row-feedback">
                <span className="mastermind-fb"><span className="mastermind-dot mastermind-dot--exact" />{row.exact}</span>
                <span className="mastermind-fb"><span className="mastermind-dot mastermind-dot--miss" />{row.miss}</span>
                {row.disrupted && <span className="mastermind-fb-tag">교란</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mastermind-draft">
        <span className="mastermind-draft-label">추측 코드</span>
        <div className="mastermind-draft-slots">
          {draft.map((s, i) => (
            <button
              key={i}
              type="button"
              className={`mastermind-slot ${s ? 'is-filled' : ''}`}
              // Tap on an occupied slot clears just that slot. Empty
              // slots are non-actionable — the palette below is the
              // way to fill them, avoiding the "빈 칸 눌렀더니 물고기가
              // 채워짐" bug.
              onClick={() => { if (s) setDraft((prev) => { const next = prev.slice(); next[i] = null; return next }) }}
              disabled={!s}
              aria-label={`${i + 1}번 칸`}
            >
              {s ? <SymbolCell symbol={s} size={17} highlight /> : <span className="mastermind-slot-q">?</span>}
            </button>
          ))}
        </div>
        <button type="button" className="mastermind-clear" onClick={clearDraft} aria-label="지우기">✕</button>
      </div>

      <div className="mastermind-palette">
        {ALL_SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            className="mastermind-palette-btn"
            onClick={() => handleTapPalette(s)}
            aria-label={s}
          >
            <SymbolCell symbol={s} size={21} />
          </button>
        ))}
      </div>

      <div className="mastermind-actions">
        <button
          type="button"
          className="mastermind-action mastermind-action--primary"
          disabled={!draftComplete || !!gameWinner || !isMyTurn}
          onClick={submitGuess}
          title={!isMyTurn ? `${opponentName} 턴` : undefined}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <path d="M4 12.5l5 5 11-11" />
          </svg>
          추측 제출
        </button>
        <button
          type="button"
          className="mastermind-action mastermind-action--declare"
          disabled={!draftComplete || !!gameWinner || !isMyTurn}
          onClick={openDeclare}
          title={!isMyTurn ? `${opponentName} 턴` : undefined}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <path d="M4 5h11l3 3v11h-14z" />
            <path d="M8 12h6M8 15h6" />
          </svg>
          정답 선언
        </button>
        <button
          type="button"
          className="mastermind-action mastermind-action--peek"
          disabled={peekLeft <= 0 || !!gameWinner}
          onClick={usePeek}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          훔쳐보기
          <span className="mastermind-badge">{peekLeft}</span>
        </button>
        <button
          type="button"
          className="mastermind-action mastermind-action--disrupt"
          disabled={disruptLeft <= 0 || !!gameWinner}
          onClick={useDisrupt}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <path d="M4 6h11l3 3M20 18h-11l-3-3" />
          </svg>
          교란
          <span className="mastermind-badge">{disruptLeft}</span>
        </button>
      </div>

      {oppPeekRow && peekReveal && (
        <div className="mastermind-peek-overlay" onClick={() => { setOppPeekRow(null); setPeekReveal(null) }}>
          <div className="mastermind-peek-card" onClick={(e) => e.stopPropagation()}>
            <div className="mastermind-peek-title">훔쳐보기 · 코드 힌트</div>
            <div className="mastermind-peek-body">
              {peekReveal.idxA + 1}번 칸의 정답 심볼이에요.
            </div>
            <div className="mastermind-row-glyphs" style={{ justifyContent: 'center' }}>
              {oppPeekRow.guess.map((s, i) => (
                i === peekReveal.idxA
                  ? <SymbolCell key={i} symbol={s} size={22} highlight />
                  // Non-revealed cells render as the same "?" slot the
                  // draft row uses. Filling them with 별 was misleading
                  // because 별 is also a real code symbol.
                  : (
                    <span key={i} className="mastermind-slot" aria-hidden="true">
                      <span className="mastermind-slot-q">?</span>
                    </span>
                  )
              ))}
            </div>
            <button type="button" className="mastermind-clear" onClick={() => { setOppPeekRow(null); setPeekReveal(null) }}>닫기</button>
          </div>
        </div>
      )}

      {pendingDeclare && (
        <div className="mastermind-declare-overlay" onClick={cancelDeclare}>
          <div className="mastermind-declare-card" onClick={(e) => e.stopPropagation()}>
            <div className="mastermind-declare-eyebrow">DECLARE ANSWER</div>
            <div className="mastermind-declare-body">
              이 조합이 <b>암호와 정확히 같으면 즉시 승리</b>, 틀리면 <span className="mastermind-declare-danger">그 판 패배</span>. 되돌릴 수 없어요.
            </div>
            <div className="mastermind-declare-glyphs">
              {pendingDeclare.map((s, i) => <SymbolCell key={i} symbol={s} size={28} highlight />)}
            </div>
            <button type="button" className="mastermind-declare-commit" onClick={commitDeclare}>이 조합으로 지른다</button>
            <button type="button" className="mastermind-declare-cancel" onClick={cancelDeclare}>더 추측할게</button>
          </div>
        </div>
      )}

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <TurnTransitionToast isMyTurn={isMyTurn} opponentName={opponentName} suppress={!!gameWinner} />
      <RegistryGuide gameId="mastermind" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {gameWinner && (() => {
        const iWon = gameWinner === myName
        const title = iWon ? 'YOU WIN' : 'YOU LOSE'
        const eyebrow =
          endReason === 'declare-correct'    ? '정답 선언 성공'
          : endReason === 'declare-wrong'    ? '정답 선언 실패'
          : endReason === 'opp-declare-correct' ? `${opponentName}의 선언 성공`
          : endReason === 'opp-declare-wrong'   ? `${opponentName}의 선언 실패`
          : '매치 종료'
        const line1 =
          endReason === 'declare-correct'    ? `${myName}이(가) 4칸 조합을 정확히 지목했어요.`
          : endReason === 'declare-wrong'    ? `${myName}의 선언이 코드와 달라 즉시 패배.`
          : endReason === 'opp-declare-correct' ? `${opponentName}이(가) 나보다 먼저 정답을 선언했어요.`
          : endReason === 'opp-declare-wrong'   ? `${opponentName}이(가) 오답을 선언해 자동 패배 → 나의 승.`
          : ''
        return (
          <GameOverModal
            title={title}
            winnerText={eyebrow}
            outcome={iWon ? 'win' : 'lose'}
            scoreSummary={[
              { label: myName, value: `${guessCount}회 시도`, highlight: iWon },
              { label: opponentName, value: `${oppState.guessCount}회 시도`, highlight: !iWon },
            ]}
            note={line1}
            onRestart={handleRestartMatch}
            onLobby={onLobby}
            onChooseOther={onChooseOther}
            onExit={onExit}
            restartDisabled={!isOpponentOnline}
            restartHint={!isOpponentOnline ? '상대방 재연결 대기 중' : undefined}
          />
        )
      })()}
    </div>
  )
}

interface SymbolCellProps { symbol: NyangSymbol; size?: number; highlight?: boolean }
function SymbolCell({ symbol, size = 20, highlight }: SymbolCellProps) {
  const path = SYMBOL_PATHS[symbol]
  return (
    <span className={`mastermind-sym ${highlight ? 'is-hi' : ''}`}>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
        <path d={path} />
      </svg>
    </span>
  )
}
