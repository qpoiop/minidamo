import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { RegistryGuide } from '../common/RegistryGuide'

interface BombHuntProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  reconnecting?: boolean;
  soloMode?: boolean;
  boardSide?: BoardSide;
}

import { boardSize, deriveRuleForReveal, generatePlacements } from './rules'
import type { BoardSide } from './rules'
import type { CardKind, RevealHistoryEntry, RuleType } from './rules'
import { RuleRevealModal } from './RuleRevealModal'
import { BombHuntConfirm } from './BombHuntConfirm'
import { BombHuntGameOver } from './BombHuntGameOver'
import { useEffectsFire } from '../../../effects/EffectsProvider'
import { PALETTE } from '../../../styles/palette'
import { useRoleParticipants } from '../common/useRoleParticipants'
import { useMatchRestart } from '../common/useMatchRestart'

interface CardState {
  kind: CardKind;
  ownerId?: string;
  revealed: boolean;
  revealedBy?: string;
}

const PASS_ALLOWANCE = 1

/**
 * Nonsense flavour lines shown when the rule generator can't add a new
 * rule without violating spec §D's ≥2 floor. Pool is seeded so both
 * peers pick the same line for the same reveal — the "규칙" also gets
 * a synthetic ruleId that carries state, so the log stays in sync.
 * Tone: keeps the game's arcade-tarot beat instead of breaking into
 * error copy.
 */
const NONSENSE_LINES: readonly string[] = [
  '무난이는 항상 무난하다.',
  '바나나는 노란색이다.',
  '동그란 세모는 실존한다.',
  '밤은 밤에 온다.',
  '폭탄은 남은 카드 중에 있다.',
]

function pickPlaceholderLine(seed: number, revealCardIndex: number, historyLength: number): string {
  const salt = (seed ^ (revealCardIndex * 2654435761) ^ (historyLength * 40503)) >>> 0
  return NONSENSE_LINES[salt % NONSENSE_LINES.length]
}

function initialBoardFromSeed(seed: number, side: BoardSide = 3): CardState[] {
  const placements = generatePlacements(seed, side)
  return placements.map((p) => ({ kind: p.kind, revealed: false }))
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

export function BombHunt({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true,
  reconnecting = false,
  soloMode = false,
  boardSide = 3,
}: BombHuntProps) {
  const BOARD_SIZE_LOCAL = boardSize(boardSide)
  // Guest waits for host's BOMBHUNT_SEED over P2P. In solo/test mode
  // there is no peer, so self-seed like the host to avoid the
  // "보드 동기화 중…" freeze after switching roles.
  const [seed, setSeed] = useState<number>(() =>
    (isHost || soloMode) ? (Math.random() * 2 ** 31) | 0 : 0,
  )
  const [board, setBoard] = useState<CardState[]>(() =>
    (isHost || soloMode) ? initialBoardFromSeed(seed, boardSide) : [],
  )
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
  const [pendingBombIdx, setPendingBombIdx] = useState<number | null>(null)
  const [bombLoss, setBombLoss] = useState<{ bombIdx: number; loserByHost: boolean } | null>(null)
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [rulesLog, setRulesLog] = useState<RulesLogRow[]>([])
  const [rulesOverlay, setRulesOverlay] = useState<'all-rules' | 'opp-personal' | null>(null)
  const [lastOppRule, setLastOppRule] = useState<string | null>(null)
  // Modal shown when *I* reveal an ALL or my own ME. Displays the rule
  // text and blocks the board until dismissed so the user actually
  // reads the fresh info.
  const [pendingRuleModal, setPendingRuleModal] = useState<{ scope: 'ALL' | 'ME'; text: string; type: RuleType; opponent?: boolean } | null>(null)
  const [passToast, setPassToast] = useState<{ who: string; ts: number } | null>(null)
  useEffect(() => {
    if (!passToast) return
    const t = setTimeout(() => setPassToast(null), 1600)
    return () => clearTimeout(t)
  }, [passToast])
  const fire = useEffectsFire()

  // Identify self + opponent by role, not by peer id — peerId is the
  // room id on the host and `<roomId>:me` on the guest, and the initial
  // players array on the guest carries the host as `roomId` while the
  // guest itself is `roomId:me`. That means `players.find(p => p.id === peerId)`
  // on the GUEST side matches the HOST entry, silently swapping myName
  // and opponentName. Root cause of "폭탄 지목했는데 졌다고 뜸" and
  // "개인규칙 획득 시 상대 이름이 반대로 뜸".
  const { opponent, myName, opponentName } = useRoleParticipants(players, isHost)
  // Both the visual read and the click gate use the same alternation.
  // Solo/test mode used to skip the gate (canAct = true always) but
  // that turned the game into infinite turns — the tester had to
  // remember to keep track of whose move it was. Now the gate is
  // enforced across the board: to act as the other side in test mode,
  // flip the role toggle in the TestMode toolbar; state persists so
  // the seed/board don't reset.
  const isMyTurn = turnIsHost === isHost && isOpponentOnline && !gameWinner
  const canAct = isMyTurn
  void soloMode  // kept in the prop signature for future overrides

  const boardRef = useRef(board)
  useEffect(() => { boardRef.current = board }, [board])

  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])
  const turnIsHostRef = useRef(turnIsHost)
  useEffect(() => { turnIsHostRef.current = turnIsHost }, [turnIsHost])

  // Ephemeral toast whenever the turn changes so the tester (or a
  // player who was looking away from the strip) sees whose move it is.
  const [turnToast, setTurnToast] = useState<{ text: string; mine: boolean; ts: number } | null>(null)
  const prevTurnIsHostRef = useRef(turnIsHost)
  useEffect(() => {
    if (prevTurnIsHostRef.current === turnIsHost) return
    prevTurnIsHostRef.current = turnIsHost
    if (gameWinner) return
    const mine = turnIsHost === isHost
    setTurnToast({
      text: mine ? '내 턴 · 카드 선택' : `${opponentName} 턴 · 대기`,
      mine,
      ts: Date.now(),
    })
    const t = setTimeout(() => setTurnToast(null), 1500)
    return () => clearTimeout(t)
  }, [turnIsHost, isHost, opponentName, gameWinner])
  // Ref-tracked rulesLog + a debug counter so applyRevealLocal always reads
  // the freshest history even if called with a stale useCallback closure.
  const rulesLogRef = useRef(rulesLog)
  useEffect(() => { rulesLogRef.current = rulesLog }, [rulesLog])
  // Opponent name mirror — the p2p handler runs outside the React
  // render commit path and can't rely on the deps-driven closure.
  const opponentNameRef = useRef('상대방')
  useEffect(() => { opponentNameRef.current = opponent?.name ?? '상대방' }, [opponent?.name])

  // Handshake: guest sends HELLO on mount, host responds with the seed.
  // Guarantees delivery regardless of listener attach order — no blind
  // burst. If host has already sent (guest was slow), guest can also
  // idempotently accept whatever seed arrives first.
  const seedBroadcastRef = useRef(false)
  // 스테일메이트 → 재셔플 setTimeout · unmount 시 setState-on-unmounted 방지.
  const reshuffleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (reshuffleTimerRef.current) clearTimeout(reshuffleTimerRef.current)
  }, [])
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
      payload: { actionType: 'BOMBHUNT_HELLO' },
    })
    sendHello()
    const retry = setTimeout(() => {
      if (boardRef.current.length === BOARD_SIZE_LOCAL) return
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
      payload: { actionType: 'BOMBHUNT_SEED', hostScore: seedRef.current },
    })
  }, [isHost, peerId, sendMessage])

  // Reset returns the freshly minted seed so callers (rematch flow) can
  // rebroadcast it. Host must re-send BOMBHUNT_SEED after every reset —
  // spec §Rematch, ARCHITECTURE §6.
  const applyMatchReset = useCallback((): number => {
    const nextSeed = (isHost || soloMode) ? ((Math.random() * 2 ** 31) | 0) : 0
    seedRef.current = nextSeed
    setSeed(nextSeed)
    setBoard((isHost || soloMode) ? initialBoardFromSeed(nextSeed, boardSide) : [])
    setTurnIsHost(true)
    setBombPickerActive(false)
    setGameWinner(null)
    setRulesLog([])
    setLastOppRule(null)
    setPendingRuleModal(null)
    setPassLeft({ host: PASS_ALLOWANCE, guest: PASS_ALLOWANCE })
    seedBroadcastRef.current = false
    return nextSeed
  }, [isHost])

  // Re-seed the guest immediately after the rematch; without this the
  // guest sits on "보드 동기화 중…". Same broadcast used for the initial
  // handshake.
  const onHostPostReset = useCallback((nextSeed: number) => {
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BOMBHUNT_SEED', hostScore: nextSeed },
    })
    seedBroadcastRef.current = true
  }, [sendMessage, peerId])
  const { handleRestartMatch } = useMatchRestart({ applyMatchReset, sendMessage, peerId, isHost, onHostPostReset })

  const finishMatchByRole = useCallback((winnerIsHost: boolean) => {
    const w = players.find((p) => p.isHost === winnerIsHost)
    setGameWinner(w?.name ?? '알 수 없음')
  }, [players])
  // applyRevealLocal keeps a light deps array ([isHost, fire]) by design
  // (see comment near its own deps below), so it doesn't re-close over
  // finishMatchByRole when `players` changes. Mirror the latest instance
  // into a ref — same pattern as rulesLogRef/opponentNameRef above — so a
  // bomb reveal always resolves the winner name against current players.
  const finishMatchByRoleRef = useRef(finishMatchByRole)
  useEffect(() => { finishMatchByRoleRef.current = finishMatchByRole }, [finishMatchByRole])

  const applyRevealLocal = useCallback((idx: number, byIsHost: boolean) => {
    // Owner id is resolved via role so both peers agree on which player
    // "owns" a private rule regardless of local id naming (host uses
    // "${roomId}:guest", guest uses "${roomId}:me" for the SAME player).
    const ownerRoleId = byIsHost ? 'ROLE_HOST' : 'ROLE_GUEST'
    const iAmOwner = byIsHost === isHost

    // Read the card kind SYNCHRONOUSLY from the ref before we queue
    // setBoard. Assigning into a `let` inside the setBoard updater is
    // fragile — React may re-invoke the updater or defer it, so any
    // outer-scope variable populated inside is not guaranteed to be
    // set by the time the code after setBoard runs. That was the
    // root cause of (a) bomb reveals not ending the match and
    // (b) ME/ALL reveals showing no modal: the follow-up branches
    // checked outer vars that were still null.
    const currentBoard = boardRef.current
    const currentCell = currentBoard[idx]
    if (!currentCell || currentCell.revealed) return
    const revealedKind: CardKind = currentCell.kind
    const bombRevealed = revealedKind === 'BOMB'

    setBoard((prev) => {
      if (!prev[idx] || prev[idx].revealed) return prev
      const next = prev.slice()
      next[idx] = { ...next[idx], revealed: true, revealedBy: ownerRoleId, ownerId: next[idx].kind === 'ME' ? ownerRoleId : undefined }
      return next
    })

    if (revealedKind === 'ALL' || revealedKind === 'ME') {
      // Derive placements straight from the seed. Reading boardRef here
      // was racy: on the guest side, BOMBHUNT_SEED and BOMBHUNT_FLIP can arrive
      // in the same tick, and the ref update commits AFTER the setBoard
      // for the SEED — the FLIP handler would then see the pre-seed
      // (empty) board and yield an empty placements array, causing
      // deriveRuleForReveal to return null → no modal → no log entry.
      const placements = generatePlacements(seedRef.current, boardSide)
      const historySnapshot: RevealHistoryEntry[] = rulesLogRef.current.map((r) => ({
        cardIndex: r.cardIndex, ruleId: r.ruleId, scope: r.scope, ownerId: r.owner, type: r.type,
      }))
      const scope = revealedKind === 'ALL' ? 'ALL' as const : 'ME' as const
      // Cells already face-up (excluding the one being flipped this turn)
      // count as "known safe" — the derivation skips rules that would
      // just re-state that fact.
      const revealedIndices = boardRef.current
        .map((c, i) => c.revealed && i !== idx ? i : -1)
        .filter((i) => i >= 0)
      const fact = deriveRuleForReveal({
        placements,
        seed: seedRef.current,
        revealHistory: historySnapshot,
        revealCardIndex: idx,
        scope,
        ownerId: scope === 'ME' ? ownerRoleId : undefined,
        side: boardSide,
        revealedIndices,
      })
      if (fact) {
        setRulesLog((prev) => [...prev, {
          kind: revealedKind,
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
            color: PALETTE.fgAccent,
          })
        }
      } else {
        // Legitimate "no new rule" state: pool already at MIN_REMAINING=2
        // so any further rule would collapse it to 1 and identify the
        // bomb deterministically — breaking spec §D. Owner sees a
        // deterministic-per-reveal nonsense line (spec-tone flavour so
        // the moment reads as a beat, not an error) plus a parenthetical
        // that spells out the actual signal: no more shrinking rules
        // left. Opponent, per privacy rules, still sees only the
        // 비공개 notice.
        const nonsense = pickPlaceholderLine(seedRef.current, idx, rulesLogRef.current.length)
        const ownerText = `${nonsense} (더 이상 좁힐 규칙이 없어요.)`
        setRulesLog((prev) => [...prev, {
          kind: revealedKind,
          text: iAmOwner ? ownerText : '규칙 획득 (조건 부족)',
          owner: scope === 'ME' ? ownerRoleId : undefined,
          ruleId: `placeholder-${idx}-${prev.length}`,
          cardIndex: idx,
          scope,
          type: 'conditional',
        }])
        setPendingRuleModal({
          scope,
          text: (scope === 'ME' && !iAmOwner) ? '(내용은 상대만 알아요)' : ownerText,
          type: 'conditional',
          opponent: !iAmOwner,
        })
      }
    }

    if (bombRevealed) {
      // Track bomb outcome so the game-over screen can pick the "BOOM"
      // variant when the local player is the loser.
      setBombLoss({ bombIdx: idx, loserByHost: byIsHost })
      finishMatchByRoleRef.current(!byIsHost)
      return
    }
    // Spec §B: 일반(SAFE) → 정보 없음, 턴 넘어감. Every non-bomb reveal
    // hands the turn over. Prior version kept the turn on SAFE, which
    // contradicted the spec's "turn continuation" table (BombHunt has no
    // continuation action — see ARCHITECTURE §3.3).
    setTurnIsHost((v) => !v)

    // Stalemate check: if every non-bomb card is now face-up, the
    // next flip would deterministically hit the bomb. Reshuffle for
    // a new round instead of forcing a lose-by-inevitability.
    const nonBombRemaining = boardRef.current.filter((c, i) => i !== idx && !c.revealed && c.kind !== 'BOMB').length
    if (nonBombRemaining === 0 && isHost) {
      // Only the host re-seeds so both peers land on the same layout.
      if (reshuffleTimerRef.current) clearTimeout(reshuffleTimerRef.current)
      reshuffleTimerRef.current = setTimeout(() => {
        reshuffleTimerRef.current = null
        const nextSeed = (Math.random() * 2 ** 31) | 0
        seedRef.current = nextSeed
        setSeed(nextSeed)
        setBoard(initialBoardFromSeed(nextSeed, boardSide))
        setRulesLog([])
        setLastOppRule(null)
        setPendingRuleModal(null)
        setTurnIsHost(true)
        sendMessage({
          type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
          payload: { actionType: 'BOMBHUNT_SEED', hostScore: nextSeed },
        })
      }, 900)
    }
  // rulesLog and finishMatchByRole dropped from deps — both are read via
  // refs (rulesLogRef / finishMatchByRoleRef) so the callback identity
  // doesn't churn on every log append or players update. Fewer stale
  // event-listener re-binds and no possibility of an in-flight event
  // seeing an older applyRevealLocal closure.
  }, [isHost, fire])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || !msg.type) return
      // NOTE: no self-filter — dispatchInbound only fires for RECEIVED messages;
      // peerId (roomId) is identical on both sides so the old senderId===peerId
      // check was actually dropping every remote GAME_ACTION.
      if (msg.type === 'GAME_ACTION') {
        const { actionType, cellIdx, hostScore, guestScore } = msg.payload
        if (actionType === 'BOMBHUNT_HELLO') {
          // Guest arrived → host replies with current seed.
          if (isHost) sendSeed()
          return
        }
        if (actionType === 'BOMBHUNT_SEED' && typeof hostScore === 'number') {
          if (seedRef.current === hostScore && boardRef.current.length === BOARD_SIZE_LOCAL) return
          // Update the ref synchronously — the next BOMBHUNT_FLIP in the same
          // tick reads seedRef.current for its deterministic placement
          // rebuild and can't wait for the React commit cycle to update it.
          seedRef.current = hostScore
          setSeed(hostScore)
          setBoard(initialBoardFromSeed(hostScore, boardSide))
          // Any prior round's rule history / turn state is stale after a
          // reshuffle (bomb-only stalemate). Wipe both sides so the two
          // peers land on the same fresh round together.
          setRulesLog([])
          setLastOppRule(null)
          setPendingRuleModal(null)
          setTurnIsHost(true)
        } else if (actionType === 'BOMBHUNT_FLIP' && typeof cellIdx === 'number') {
          // The sender was whoever's turn it was. Boolean turn state
          // avoids any peerId disambiguation.
          applyRevealLocal(cellIdx, turnIsHostRef.current)
        } else if (actionType === 'BOMBHUNT_PASS') {
          const senderRoleKey: 'host' | 'guest' = turnIsHostRef.current ? 'host' : 'guest'
          setPassLeft((prev) => ({ ...prev, [senderRoleKey]: Math.max(0, prev[senderRoleKey] - 1) }))
          setTurnIsHost((v) => !v)
          const senderName = opponentNameRef.current
          setRulesLog((prev) => [...prev, {
            kind: 'SAFE',
            text: `${senderName}이(가) 턴을 넘겼어요`,
            ruleId: `pass-${prev.length}`,
            cardIndex: -1,
            scope: 'ALL',
            type: 'conditional',
          }])
          setPassToast({ who: senderName, ts: Date.now() })
        } else if (actionType === 'BOMBHUNT_BOMB_GUESS' && typeof cellIdx === 'number') {
          // Read the bomb index straight from the seed (deterministic
          // on every peer) rather than boardRef.current[cellIdx], which
          // can lag a reshuffle by one React commit. Divergence here
          // was the reason a correct guess sometimes showed as a loss.
          const placements = generatePlacements(seedRef.current, boardSide)
          const canonicalBomb = placements.find((p) => p.kind === 'BOMB')?.index ?? -1
          const guessedRight = cellIdx === canonicalBomb
          finishMatchByRole(guessedRight ? turnIsHostRef.current : !turnIsHostRef.current)
        } else if (actionType === 'BOMBHUNT_SCORE_SYNC' && typeof guestScore === 'number') {
          // reserved
        }
      }
      // GAME_RESET · RESTART handled by useMatchRestart listener.
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [peerId, players, applyRevealLocal, finishMatchByRole, isHost, sendSeed])

  const myRoleKey: 'host' | 'guest' = isHost ? 'host' : 'guest'
  const myPassLeft = passLeft[myRoleKey]

  const handleFlip = (idx: number) => {
    if (!canAct) return
    if (bombPickerActive) {
      // Two-step commit (spec §폭탄 찾기 확인): open confirm modal
      // first — the guess is irreversible so we require re-confirm
      // before broadcasting.
      setPendingBombIdx(idx)
      return
    }
    if (board[idx]?.revealed) return
    applyRevealLocal(idx, isHost)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BOMBHUNT_FLIP', cellIdx: idx },
    })
  }

  const commitBombGuess = () => {
    const idx = pendingBombIdx
    if (idx == null) return
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BOMBHUNT_BOMB_GUESS', cellIdx: idx },
    })
    // Same fix as the remote handler — derive the canonical bomb index
    // from placements, not from boardRef.current (which trails a
    // reshuffle by one React commit).
    const placements = generatePlacements(seedRef.current, boardSide)
    const canonicalBomb = placements.find((p) => p.kind === 'BOMB')?.index ?? -1
    const guessedRight = idx === canonicalBomb
    finishMatchByRole(guessedRight ? isHost : !isHost)
    setBombPickerActive(false)
    setPendingBombIdx(null)
  }

  const handlePass = () => {
    if (!canAct) return
    if (myPassLeft <= 0) return
    setPassLeft((prev) => ({ ...prev, [myRoleKey]: Math.max(0, prev[myRoleKey] - 1) }))
    setTurnIsHost((v) => !v)
    setRulesLog((prev) => [...prev, {
      kind: 'SAFE',
      text: `${myName}이(가) 턴을 넘겼어요`,
      ruleId: `pass-${prev.length}`,
      cardIndex: -1,
      scope: 'ALL',
      type: 'conditional',
    }])
    setPassToast({ who: myName, ts: Date.now() })
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'BOMBHUNT_PASS' },
    })
  }

  const activateBombGuess = () => {
    if (!canAct) return
    setBombPickerActive((v) => !v)
  }

  const turnText = gameWinner
    ? '매치 종료'
    : !isOpponentOnline
      ? '상대 연결 대기'
      : isMyTurn
        ? bombPickerActive ? '폭탄 위치 선택' : '내 턴 · 카드 선택'
        : `${opponentName} 턴`

  const boardReady = board.length === BOARD_SIZE_LOCAL
  const publicRuleCount = rulesLog.filter((r) => r.kind === 'ALL').length
  const myPrivateCount = rulesLog.filter((r) => r.kind === 'ME' && r.owner === (isHost ? 'ROLE_HOST' : 'ROLE_GUEST')).length

  return (
    <div className="game-screen" data-my-turn={isMyTurn && !gameWinner ? '1' : '0'}>
      <GameHeader
        code="BOMBHUNT"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={
          isOpponentOnline
            ? `전체 ${publicRuleCount} · 개인 ${myPrivateCount}`
            : '재연결 중…'
        }
        variant={isMyTurn ? (bombPickerActive ? 'serve' : 'default') : 'idle'}
        isMyTurn={isMyTurn}
      />

      {lastOppRule && (
        <div className="bombhunt-flash" onAnimationEnd={() => setLastOppRule(null)}>
          {lastOppRule}
        </div>
      )}

      {/* Explicit action-mode banner so player always knows what the
       * next card tap will do. Colour tracks the active mode. */}
      <div className={`bombhunt-mode-banner ${bombPickerActive ? 'bombhunt-mode-banner--target' : 'bombhunt-mode-banner--flip'}`}>
        <span className="bombhunt-mode-icon" aria-hidden="true">
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
        <span className="bombhunt-mode-text">
          {bombPickerActive ? '폭탄 지목 모드 · 폭탄으로 의심되는 카드를 탭' : '뒤집기 모드 · 탭한 카드를 열어요'}
        </span>
      </div>

      <div className="game-board-region">
        {boardReady ? (
          <div
            className={`bombhunt-board bombhunt-board--side-${boardSide}`}
            style={{ gridTemplateColumns: `repeat(${boardSide}, 1fr)` }}
          >
            {board.map((cell, idx) => {
              const face = cell.revealed
              const kindLower = cell.kind.toLowerCase()
              const cls = [
                'card-flip bombhunt-tile',
                `bombhunt-tile--${kindLower}`,
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
                      <div className="bombhunt-tile-icon">{faceIcon}</div>
                      <div className="bombhunt-tile-label">{faceLabel}</div>
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

      {passToast && (
        <div className="bombhunt-pass-toast" key={passToast.ts} role="status">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
            <path d="M5 5l7 7-7 7M12 5l7 7-7 7" />
          </svg>
          <span><b>{passToast.who}</b>이(가) 턴을 넘겼어요</span>
        </div>
      )}
      {turnToast && !passToast && (
        <div className={`bombhunt-turn-toast ${turnToast.mine ? 'bombhunt-turn-toast--mine' : 'bombhunt-turn-toast--opp'}`} key={turnToast.ts} role="status">
          {turnToast.text}
        </div>
      )}
      <div className="bombhunt-actions">
        <button
          type="button"
          className={`pixel-btn bombhunt-action-btn ${!bombPickerActive ? 'pixel-btn--primary bombhunt-action-btn--active' : 'pixel-btn--ghost'}`}
          disabled={!canAct}
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
          className="pixel-btn pixel-btn--secondary bombhunt-action-btn"
          disabled={!canAct || myPassLeft <= 0 || bombPickerActive}
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
          className={`pixel-btn ${bombPickerActive ? 'pixel-btn--primary bombhunt-action-btn--active' : 'pixel-btn--ghost'} bombhunt-action-btn`}
          disabled={!canAct}
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

      <button
        type="button"
        className="bombhunt-rules-strip"
        onClick={() => setRulesOverlay('all-rules')}
        aria-label="규칙 히스토리 열기"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M16 4v3h3" />
          <path d="M8 11h8M8 14h8M8 17h5" />
        </svg>
        규칙 히스토리
        <span className="bombhunt-rules-strip-badge bombhunt-rules-strip-badge--all">전체 {publicRuleCount}</span>
        <span className="bombhunt-rules-strip-badge bombhunt-rules-strip-badge--me">개인 {myPrivateCount}</span>
      </button>

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: p.isHost === turnIsHost,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: (
            <span className="participant-symbol" title="남은 패스권" aria-label="남은 패스권">
              패스권 {passLeft[p.isHost ? 'host' : 'guest']}
            </span>
          ),
        }))}
        hint="힌트를 캐고, 폭탄을 좁혀요"
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} reconnecting={reconnecting} onExit={onExit} />

      <RegistryGuide gameId="bombhunt" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {pendingRuleModal && (
        <RuleRevealModal
          scope={pendingRuleModal.scope}
          type={pendingRuleModal.type}
          text={pendingRuleModal.text}
          opponent={!!pendingRuleModal.opponent}
          opponentName={opponentName}
          onConfirm={() => setPendingRuleModal(null)}
        />
      )}

      {rulesOverlay === 'all-rules' && (
        <div className="bombhunt-rules-overlay" onClick={() => setRulesOverlay(null)}>
          <div className="bombhunt-rules-card" onClick={(e) => e.stopPropagation()}>
            <div className="bombhunt-rules-title">규칙 히스토리</div>
            {rulesLog.length === 0 ? (
              <div className="bombhunt-rules-empty">아직 공개된 규칙이 없어요.</div>
            ) : (
              <ul className="bombhunt-rules-list">
                {rulesLog.map((r, i) => (
                  <li key={i} className={`bombhunt-rules-item bombhunt-rules-item--${r.kind.toLowerCase()}`}>
                    <span className="bombhunt-rules-kind">{r.kind === 'ALL' ? '전체' : r.owner === (isHost ? 'ROLE_HOST' : 'ROLE_GUEST') ? '개인' : '상대 개인'}</span>
                    <span className="bombhunt-rules-text">{r.owner && r.owner !== (isHost ? 'ROLE_HOST' : 'ROLE_GUEST') ? '(비공개)' : r.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="pixel-btn pixel-btn--ghost bombhunt-rules-close" onClick={() => setRulesOverlay(null)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {pendingBombIdx !== null && (
        <BombHuntConfirm
          cellNumber={pendingBombIdx + 1}
          onConfirm={commitBombGuess}
          onCancel={() => setPendingBombIdx(null)}
        />
      )}

      {gameWinner && (() => {
        const bombIdx = bombLoss?.bombIdx ?? generatePlacements(seedRef.current, boardSide).find((p) => p.kind === 'BOMB')?.index ?? 0
        const iAmWinner = gameWinner === myName
        const outcome: 'win-guess' | 'win-opp-bomb' | 'lose-bomb' | 'lose-guess' = bombLoss
          ? (bombLoss.loserByHost === isHost ? 'lose-bomb' : 'win-opp-bomb')
          : (iAmWinner ? 'win-guess' : 'lose-guess')
        return (
          <BombHuntGameOver
            outcome={outcome}
            winnerName={gameWinner}
            loserName={iAmWinner ? opponentName : myName}
            bombIndex={bombIdx}
            boardSide={boardSide}
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
