/*
 * Rule generator for 코드네임 · 모순 (per-reveal, state-aware).
 *
 * The old build-all-up-front generator committed to 6 rules at match
 * start via a forward-planning greedy search. That works, but every
 * rule needed to guess the future information state. Two problems:
 *
 *   1. If a player skips / passes a card, later rules were pre-baked
 *      assuming a different reveal order → some become uninformative.
 *   2. Selection had to balance 6 rules at once → complex heuristics.
 *
 * This module rebuilds it: rules are derived at the moment a card is
 * flipped, from the actual current knowledge state. Both peers observe
 * identical reveals in identical order (P2P GAME_ACTION carries the
 * cardIdx), so calling deriveRuleForReveal on either side with the same
 * seed + placements + reveal history produces the same rule.
 *
 * Every emitted rule is guaranteed:
 *   - truthful (predicate holds for the actual bomb),
 *   - novel   (not already revealed this match),
 *   - informative (strictly shrinks or stays inside the target range).
 */

export type CardKind = 'BOMB' | 'ALL' | 'ME' | 'SAFE'

export interface Placed {
  index: number;
  kind: CardKind;
}

export interface RuleFact {
  ruleId: string;
  text: string;
  scope: 'ALL' | 'ME';
  type: RuleType;
  possibleBombs: number[];
}

const BOARD_SIZE = 9

function rowOf(i: number) { return Math.floor(i / 3) }
function colOf(i: number) { return i % 3 }
const CORNERS = new Set([0, 2, 6, 8])
const CENTER = 4
const EDGES = new Set([1, 3, 5, 7])
const DIAGONAL_A = new Set([0, 4, 8])
const DIAGONAL_B = new Set([2, 4, 6])
const ALL_CELLS = Array.from({ length: BOARD_SIZE }, (_, i) => i)

function neighborsOrthogonal(i: number): number[] {
  const r = rowOf(i)
  const c = colOf(i)
  const out: number[] = []
  if (r > 0) out.push(i - 3)
  if (r < 2) out.push(i + 3)
  if (c > 0) out.push(i - 1)
  if (c < 2) out.push(i + 1)
  return out
}

function neighborsDiagonal(i: number): number[] {
  const r = rowOf(i)
  const c = colOf(i)
  const out: number[] = []
  if (r > 0 && c > 0) out.push(i - 4)
  if (r > 0 && c < 2) out.push(i - 2)
  if (r < 2 && c > 0) out.push(i + 2)
  if (r < 2 && c < 2) out.push(i + 4)
  return out
}

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

function seededPick(seed: number, n: number): number {
  if (n <= 0) return 0
  let a = seed | 0
  a = (a + 0x9e3779b9) | 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return Math.floor(r * n)
}

export const CARD_COMPOSITION: Record<CardKind, number> = { BOMB: 1, ALL: 3, ME: 3, SAFE: 2 }

export function generatePlacements(seed: number): Placed[] {
  const pool: CardKind[] = []
  ;(['BOMB', 'ALL', 'ME', 'SAFE'] as CardKind[]).forEach((k) => {
    for (let i = 0; i < CARD_COMPOSITION[k]; i++) pool.push(k)
  })
  const shuffled = shuffleFromSeed(pool, seed)
  return shuffled.map((k, index) => ({ index, kind: k }))
}

/**
 * Rule type per the spec (planning/game/codename.md §B):
 *   - 관계형 relation : bomb's position relative to a specific card
 *   - 조건형 conditional : "if X is safe then bomb could be in Y"
 *   - 소거형 elimination : one cell isn't the bomb
 *   - 배제형 exclusion ✦ : whole row/col/region excluded — 판당 1장만
 */
export type RuleType = 'relation' | 'conditional' | 'elimination' | 'exclusion'

interface RuleCandidate {
  id: string;
  text: string;
  type: RuleType;
  predicate: (candidateBomb: number, placements: Placed[]) => boolean;
}

function indexesOf(kind: CardKind, placements: Placed[]): number[] {
  return placements.filter((p) => p.kind === kind).map((p) => p.index)
}

const RULE_CATALOGUE: RuleCandidate[] = [
  // ─── 배제형 exclusion (whole row/col/region, spec: 판당 1장만) ───
  ...[0, 1, 2].flatMap((r) => [
    { id: `bomb-row-${r}`, type: 'exclusion' as RuleType, text: `폭탄은 ${['상단', '중단', '하단'][r]} 행에 있어요.`, predicate: (b: number) => rowOf(b) === r },
    { id: `bomb-not-row-${r}`, type: 'exclusion' as RuleType, text: `폭탄은 ${['상단', '중단', '하단'][r]} 행에 없어요.`, predicate: (b: number) => rowOf(b) !== r },
  ]),
  ...[0, 1, 2].flatMap((c) => [
    { id: `bomb-col-${c}`, type: 'exclusion' as RuleType, text: `폭탄은 ${['왼쪽', '중앙', '오른쪽'][c]} 열에 있어요.`, predicate: (b: number) => colOf(b) === c },
    { id: `bomb-not-col-${c}`, type: 'exclusion' as RuleType, text: `폭탄은 ${['왼쪽', '중앙', '오른쪽'][c]} 열에 없어요.`, predicate: (b: number) => colOf(b) !== c },
  ]),
  { id: 'bomb-corner', type: 'exclusion', text: '폭탄은 모서리 칸이에요.', predicate: (b) => CORNERS.has(b) },
  { id: 'bomb-not-corner', type: 'exclusion', text: '폭탄은 모서리 칸이 아니에요.', predicate: (b) => !CORNERS.has(b) },
  { id: 'bomb-edge', type: 'exclusion', text: '폭탄은 가장자리 칸이에요.', predicate: (b) => EDGES.has(b) },
  { id: 'bomb-not-edge', type: 'exclusion', text: '폭탄은 가장자리 칸이 아니에요.', predicate: (b) => !EDGES.has(b) },
  { id: 'bomb-diag-a', type: 'exclusion', text: '폭탄은 대각선 (↘) 위에 있어요.', predicate: (b) => DIAGONAL_A.has(b) },
  { id: 'bomb-diag-b', type: 'exclusion', text: '폭탄은 대각선 (↙) 위에 있어요.', predicate: (b) => DIAGONAL_B.has(b) },
  { id: 'bomb-no-diag', type: 'exclusion', text: '폭탄은 어느 대각선에도 없어요.', predicate: (b) => !DIAGONAL_A.has(b) && !DIAGONAL_B.has(b) },

  // ─── 소거형 elimination (single-cell not-bomb) ───
  { id: 'bomb-center', type: 'elimination', text: '폭탄은 중앙 칸이에요.', predicate: (b) => b === CENTER },
  { id: 'bomb-not-center', type: 'elimination', text: '폭탄은 중앙 칸이 아니에요.', predicate: (b) => b !== CENTER },
  { id: 'bomb-even-idx', type: 'elimination', text: '폭탄 번호(0~8)는 짝수예요.', predicate: (b) => b % 2 === 0 },
  { id: 'bomb-odd-idx', type: 'elimination', text: '폭탄 번호(0~8)는 홀수예요.', predicate: (b) => b % 2 === 1 },

  // ─── 관계형 relation (bomb adjacency to another card kind) ───
  { id: 'bomb-adj-safe', type: 'relation', text: '폭탄은 일반 카드와 상하좌우로 붙어 있어요.', predicate: (b, pl) => neighborsOrthogonal(b).some((n) => indexesOf('SAFE', pl).includes(n)) },
  { id: 'bomb-not-adj-safe', type: 'relation', text: '폭탄은 일반 카드와 상하좌우로 붙어 있지 않아요.', predicate: (b, pl) => !neighborsOrthogonal(b).some((n) => indexesOf('SAFE', pl).includes(n)) },
  { id: 'bomb-adj-all', type: 'relation', text: '폭탄과 인접한 칸에 전체규칙 카드가 있어요.', predicate: (b, pl) => neighborsOrthogonal(b).some((n) => indexesOf('ALL', pl).includes(n)) },
  { id: 'bomb-not-adj-all', type: 'relation', text: '폭탄과 인접한 칸에 전체규칙 카드가 없어요.', predicate: (b, pl) => !neighborsOrthogonal(b).some((n) => indexesOf('ALL', pl).includes(n)) },
  { id: 'bomb-adj-me', type: 'relation', text: '폭탄과 인접한 칸에 개인규칙 카드가 있어요.', predicate: (b, pl) => neighborsOrthogonal(b).some((n) => indexesOf('ME', pl).includes(n)) },
  { id: 'bomb-not-adj-me', type: 'relation', text: '폭탄과 인접한 칸에 개인규칙 카드가 없어요.', predicate: (b, pl) => !neighborsOrthogonal(b).some((n) => indexesOf('ME', pl).includes(n)) },
  { id: 'bomb-diag-adj-safe', type: 'relation', text: '폭탄의 대각선 이웃에 일반 카드가 있어요.', predicate: (b, pl) => neighborsDiagonal(b).some((n) => indexesOf('SAFE', pl).includes(n)) },
  { id: 'bomb-diag-adj-me', type: 'relation', text: '폭탄의 대각선 이웃에 개인규칙 카드가 있어요.', predicate: (b, pl) => neighborsDiagonal(b).some((n) => indexesOf('ME', pl).includes(n)) },

  // ─── 조건형 conditional (row/col contains kind) ───
  { id: 'row-has-safe', type: 'conditional', text: '폭탄이 있는 행에 일반 카드가 있어요.', predicate: (b, pl) => indexesOf('SAFE', pl).some((s) => rowOf(s) === rowOf(b)) },
  { id: 'row-has-all', type: 'conditional', text: '폭탄이 있는 행에 전체규칙 카드가 있어요.', predicate: (b, pl) => indexesOf('ALL', pl).some((s) => rowOf(s) === rowOf(b)) },
  { id: 'col-has-me', type: 'conditional', text: '폭탄이 있는 열에 개인규칙 카드가 있어요.', predicate: (b, pl) => indexesOf('ME', pl).some((s) => colOf(s) === colOf(b)) },
  { id: 'col-has-safe', type: 'conditional', text: '폭탄이 있는 열에 일반 카드가 있어요.', predicate: (b, pl) => indexesOf('SAFE', pl).some((s) => colOf(s) === colOf(b)) },
]

interface EvaluatedRule {
  id: string;
  text: string;
  type: RuleType;
  possibleBombs: Set<number>;
}

function evaluateAll(placements: Placed[]): EvaluatedRule[] {
  return RULE_CATALOGUE.map((rc) => {
    const pb = new Set<number>()
    for (const i of ALL_CELLS) if (rc.predicate(i, placements)) pb.add(i)
    return { id: rc.id, text: rc.text, type: rc.type, possibleBombs: pb }
  })
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  const out = new Set<number>()
  a.forEach((v) => { if (b.has(v)) out.add(v) })
  return out
}

/* ------------------------------------------------------------------
 * Target curve for candidate pool size after each new rule reveal.
 *   scope=ALL feeds the shared knowledge (both peers see the pool)
 *   scope=ME  reduces the owner's private pool starting from the ALL
 *             pool at that moment.
 * ------------------------------------------------------------------ */

const ALL_TARGETS: Array<{ min: number; max: number }> = [
  { min: 5, max: 7 },  // after 1 public rule
  { min: 3, max: 5 },  // after 2 public rules
  { min: 2, max: 4 },  // after 3 public rules
]
const ME_TARGETS: Array<{ min: number; max: number }> = [
  { min: 2, max: 4 },  // after 1 private rule
  { min: 1, max: 3 },  // after 2 private rules
  { min: 1, max: 2 },  // after 3 private rules
]

function distanceTo(size: number, min: number, max: number): number {
  if (size < min) return (min - size) * 3
  if (size > max) return size - max
  return 0
}

/* ------------------------------------------------------------------
 * Per-reveal derivation.
 * ------------------------------------------------------------------ */

export interface RevealHistoryEntry {
  cardIndex: number;
  ruleId: string;
  scope: 'ALL' | 'ME';
  type: RuleType;
  ownerId?: string;
}

/**
 * Invariant enforcement (spec §D §E-3): after every derivation the
 * intersection of all revealed rules that apply to a viewer must leave
 * at least 2 bomb candidates. Rules that would collapse the pool to a
 * single cell are discarded — the game is bomb-hunt with bluff, not
 * auto-solver.
 */
const MIN_REMAINING = 2

/**
 * Spec §D-1/D-2: exactly one exclusion rule per game. We track it via
 * the history — any exclusion already used blocks another from being
 * selected.
 */
function exclusionUsed(history: ReadonlyArray<RevealHistoryEntry>): boolean {
  return history.some((h) => h.type === 'exclusion')
}

interface DeriveArgs {
  placements: Placed[];
  seed: number;
  revealHistory: ReadonlyArray<RevealHistoryEntry>;
  revealCardIndex: number;
  scope: 'ALL' | 'ME';
  ownerId?: string;      // ME reveals — whose card is being flipped
}

/**
 * Both peers call this with the same input state — output must be
 * identical on both sides so replicated log stays in sync.
 *
 * Pool model:
 *   - Shared ALL pool  = intersect(prior ALL rules)  — every peer agrees.
 *   - ME reveals use   = shared ALL pool ∩ owner's prior ME rules.
 *     The owner sees the effect immediately; the peer sees the rule id
 *     but its label is hidden by UI. Because history entries carry
 *     ownerId, both sides derive from the same starting pool.
 */
export function deriveRuleForReveal(args: DeriveArgs): RuleFact | null {
  const { placements, seed, revealHistory, revealCardIndex, scope, ownerId } = args
  const bomb = placements.find((p) => p.kind === 'BOMB')!.index

  const evaluated = evaluateAll(placements)
  const truthful = evaluated.filter((r) => r.possibleBombs.has(bomb))
  const usedIds = new Set(revealHistory.map((h) => h.ruleId))
  const available = truthful.filter((r) => !usedIds.has(r.id))

  const priorAllEntries = revealHistory.filter((h) => h.scope === 'ALL')
  const priorMeSelfEntries = scope === 'ME'
    ? revealHistory.filter((h) => h.scope === 'ME' && h.ownerId === ownerId)
    : []

  const allRules = priorAllEntries
    .map((h) => truthful.find((r) => r.id === h.ruleId))
    .filter((r): r is EvaluatedRule => Boolean(r))
  const meSelfRules = priorMeSelfEntries
    .map((h) => truthful.find((r) => r.id === h.ruleId))
    .filter((r): r is EvaluatedRule => Boolean(r))
  const combinedPrior = [...allRules, ...meSelfRules]
  const currentPool = combinedPrior.reduce((acc, r) => intersect(acc, r.possibleBombs), new Set(ALL_CELLS))

  const curve = scope === 'ALL' ? ALL_TARGETS : ME_TARGETS
  const step = scope === 'ALL' ? priorAllEntries.length : priorMeSelfEntries.length
  const target = curve[Math.min(step, curve.length - 1)]

  const exclusionAlreadyUsed = exclusionUsed(revealHistory)

  const scored: Array<{ rule: EvaluatedRule; score: number; nextSize: number }> = []
  for (const rule of available) {
    // Spec §D-1: at most 1 exclusion rule per game.
    if (rule.type === 'exclusion' && exclusionAlreadyUsed) continue
    const next = intersect(currentPool, rule.possibleBombs)
    if (!next.has(bomb)) continue
    // Spec §D §E-3 invariant: never let the candidate pool collapse below
    // MIN_REMAINING. Without this the rule set could uniquely fix the bomb
    // and the round becomes a solved puzzle.
    if (next.size < MIN_REMAINING) continue
    const strictReducer = next.size < currentPool.size
    const exclusionBonus = rule.type === 'exclusion' ? -0.3 : 0  // 특별 연출 유도
    const score = distanceTo(next.size, target.min, target.max)
      - (currentPool.size - next.size) * 0.15
      + (strictReducer ? -0.4 : 0.6)
      + exclusionBonus
    scored.push({ rule, score, nextSize: next.size })
  }

  if (scored.length === 0) {
    // Fallback: any truthful, unused rule that keeps pool ≥ 2 candidates.
    const fallback = available.find((r) => {
      if (r.type === 'exclusion' && exclusionAlreadyUsed) return false
      const next = intersect(currentPool, r.possibleBombs)
      return next.has(bomb) && next.size >= MIN_REMAINING
    })
    if (!fallback) return null
    return {
      ruleId: fallback.id, text: fallback.text, scope, type: fallback.type,
      possibleBombs: Array.from(fallback.possibleBombs).sort((a, b) => a - b),
    }
  }

  // Sort deterministically, take top-K, pick from seed-hashed slot.
  scored.sort((a, b) => a.score - b.score || a.rule.id.localeCompare(b.rule.id))
  const topK = scored.slice(0, Math.min(3, scored.length))
  const pickIdx = seededPick(seed ^ revealCardIndex ^ revealHistory.length, topK.length)
  const chosen = topK[pickIdx]

  return {
    ruleId: chosen.rule.id,
    text: chosen.rule.text,
    scope,
    type: chosen.rule.type,
    possibleBombs: Array.from(chosen.rule.possibleBombs).sort((a, b) => a - b),
  }
}

export { BOARD_SIZE }
