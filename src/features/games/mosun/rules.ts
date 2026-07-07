/*
 * Mosun rule generator v2 — kind & direction references.
 *
 * Design decisions:
 *   1. Rules never reference cards by number ("3번 카드"). They refer to
 *      card KINDS (일반 / 전체규칙 / 개인규칙) and DIRECTIONS (좌/우/위/아래).
 *      Because kinds aren't visible until a card is flipped, the rule
 *      is naturally a "sleeping rule" (spec §B) — the player can't cash
 *      in the info until they've flipped the referenced kind.
 *   2. Rules must NEVER let a single flip resolve the bomb outright.
 *      The pool invariant is enforced twice:
 *         MIN_REMAINING = 2         hard floor (spec §D)
 *         AMBIGUITY_PREFERENCE      soft — we prefer rules that keep the
 *                                    pool ≥ 3 during early / mid game
 *         MAX_REDUCTION_PER_STEP    reject rules whose reduction is
 *                                    "too generous" for the current step
 *   3. Templates carry both text (rendered with slot values) and a
 *      predicate that computes the possibleBombs set from the actual
 *      placements.
 */

export type CardKind = 'BOMB' | 'ALL' | 'ME' | 'SAFE'

export interface Placed {
  index: number;      // 0..8
  kind: CardKind;
}

export type RuleType = 'relation' | 'conditional' | 'elimination' | 'exclusion'

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
const EDGES = new Set([1, 3, 5, 7])
const DIAGONAL_A = new Set([0, 4, 8])
const DIAGONAL_B = new Set([2, 4, 6])
const ALL_CELLS = Array.from({ length: BOARD_SIZE }, (_, i) => i)

const KIND_LABEL: Record<CardKind, string> = {
  BOMB: '폭탄',
  ALL: '전체힌트',
  ME: '개인힌트',
  SAFE: '일반',
}

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

// Directional offsets: bomb sits "to the {dir} of" X → bomb.pos = X + delta
const DIR_OFFSETS: Record<'우측' | '좌측' | '위쪽' | '아래쪽', (i: number) => number | null> = {
  우측: (i) => (colOf(i) < 2 ? i + 1 : null),
  좌측: (i) => (colOf(i) > 0 ? i - 1 : null),
  위쪽: (i) => (rowOf(i) > 0 ? i - 3 : null),
  아래쪽: (i) => (rowOf(i) < 2 ? i + 3 : null),
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

/* ============================================================
 * Regions used by exclusion / conditional templates.
 * ============================================================ */

interface Region {
  slotName: string;
  cells: Set<number>;
}

function allRegions(): Region[] {
  const rowsLabel = ['상단 행', '중단 행', '하단 행']
  const colsLabel = ['왼쪽 열', '중앙 열', '오른쪽 열']
  return [
    ...[0, 1, 2].map<Region>((r) => ({
      slotName: rowsLabel[r],
      cells: new Set(ALL_CELLS.filter((c) => rowOf(c) === r)),
    })),
    ...[0, 1, 2].map<Region>((c) => ({
      slotName: colsLabel[c],
      cells: new Set(ALL_CELLS.filter((cell) => colOf(cell) === c)),
    })),
    { slotName: '모서리', cells: new Set(CORNERS) },
    { slotName: '가장자리', cells: new Set(EDGES) },
    { slotName: '대각선(↘)', cells: new Set(DIAGONAL_A) },
    { slotName: '대각선(↙)', cells: new Set(DIAGONAL_B) },
  ]
}

function indexesOf(kind: CardKind, placements: Placed[]): number[] {
  return placements.filter((p) => p.kind === kind).map((p) => p.index)
}

/* ============================================================
 * Templates — every candidate references a KIND (일반/전체힌트/개인힌트)
 * or a REGION.  No numeric card references.
 * ============================================================ */

export interface Candidate {
  id: string;
  text: string;
  type: RuleType;
  possibleBombs: Set<number>;
}

/**
 * 관계형 relation
 *   "폭탄은 {일반|전체힌트|개인힌트} 카드와 인접해 있어요."
 *   "폭탄은 어떤 {kind} 카드의 {방향}에 있어요."
 *   "폭탄은 어떤 {kind} 카드와 같은 줄에 있어요." / 같은 열
 */
function enumerateRelation(placements: Placed[]): Candidate[] {
  const out: Candidate[] = []
  const REFERENCED_KINDS: CardKind[] = ['SAFE', 'ALL', 'ME']

  for (const kind of REFERENCED_KINDS) {
    const cells = indexesOf(kind, placements)
    if (cells.length === 0) continue

    // Adjacency (orthogonal, at least one of that kind is a neighbour).
    const adjPool = new Set<number>()
    cells.forEach((c) => neighborsOrthogonal(c).forEach((n) => adjPool.add(n)))
    if (adjPool.size > 0) {
      out.push({
        id: `rel-adj-${kind}`,
        type: 'relation',
        text: `폭탄은 ${KIND_LABEL[kind]} 카드와 인접해 있어요.`,
        possibleBombs: adjPool,
      })
    }

    // Directional (bomb sits to the DIR of some kind-card).
    for (const dir of Object.keys(DIR_OFFSETS) as Array<keyof typeof DIR_OFFSETS>) {
      const dirPool = new Set<number>()
      cells.forEach((c) => {
        const t = DIR_OFFSETS[dir](c)
        if (t !== null) dirPool.add(t)
      })
      if (dirPool.size > 0) {
        out.push({
          id: `rel-dir-${kind}-${dir}`,
          type: 'relation',
          text: `폭탄은 어떤 ${KIND_LABEL[kind]} 카드의 ${dir}에 있어요.`,
          possibleBombs: dirPool,
        })
      }
    }

    // Same row / column.
    const rowPool = new Set<number>()
    cells.forEach((c) => ALL_CELLS.forEach((cc) => { if (cc !== c && rowOf(cc) === rowOf(c)) rowPool.add(cc) }))
    if (rowPool.size > 0) {
      out.push({
        id: `rel-row-${kind}`,
        type: 'relation',
        text: `폭탄은 ${KIND_LABEL[kind]} 카드와 같은 줄에 있어요.`,
        possibleBombs: rowPool,
      })
    }
    const colPool = new Set<number>()
    cells.forEach((c) => ALL_CELLS.forEach((cc) => { if (cc !== c && colOf(cc) === colOf(c)) colPool.add(cc) }))
    if (colPool.size > 0) {
      out.push({
        id: `rel-col-${kind}`,
        type: 'relation',
        text: `폭탄은 ${KIND_LABEL[kind]} 카드와 같은 열에 있어요.`,
        possibleBombs: colPool,
      })
    }
  }
  return out
}

/**
 * 조건형 conditional
 *   "어떤 {kind} 카드가 열리면, 폭탄은 {영역}에 있을 수 있어요."
 * Antecedent (그 종류 카드가 열림) is guaranteed to become true during
 * the round → consequent must be true → bomb ∈ region.
 */
function enumerateConditional(placements: Placed[]): Candidate[] {
  const out: Candidate[] = []
  const REFERENCED_KINDS: CardKind[] = ['SAFE', 'ALL', 'ME']
  const regions = allRegions()
  for (const kind of REFERENCED_KINDS) {
    if (indexesOf(kind, placements).length === 0) continue
    for (const region of regions) {
      // Skip tiny regions (they'd become near-elimination).
      if (region.cells.size < 3) continue
      out.push({
        id: `cond-${kind}-${region.slotName}`,
        type: 'conditional',
        text: `어떤 ${KIND_LABEL[kind]} 카드가 열리면, 폭탄은 ${region.slotName}에 있을 수 있어요.`,
        possibleBombs: new Set(region.cells),
      })
    }
  }
  return out
}

/**
 * 소거형 elimination — single named cell excluded (removes exactly 1).
 *
 * Reasoning: user feedback said parity-based elimination halves the
 * search space in one shot, which contradicts the spec's "정보는 점진적
 * 으로 쌓인다" principle. Instead every 소거형 rule now names one
 * specific position (센터 · 각 코너 · 각 가장자리) so at most one cell
 * is removed per rule. That keeps the elimination narrow — the player
 * still has 8 candidates left after using their single 소거형 slot.
 */
function enumerateElimination(): Candidate[] {
  const positions: Array<{ idx: number; label: string }> = [
    { idx: 4, label: '중앙 칸' },
    { idx: 0, label: '왼쪽 상단 코너' },
    { idx: 2, label: '오른쪽 상단 코너' },
    { idx: 6, label: '왼쪽 하단 코너' },
    { idx: 8, label: '오른쪽 하단 코너' },
    { idx: 1, label: '상단 중앙 칸' },
    { idx: 3, label: '왼쪽 중앙 칸' },
    { idx: 5, label: '오른쪽 중앙 칸' },
    { idx: 7, label: '하단 중앙 칸' },
  ]
  return positions.map<Candidate>(({ idx, label }) => ({
    id: `elim-${idx}`,
    type: 'elimination',
    text: `폭탄은 ${label}이 아니에요.`,
    possibleBombs: new Set(ALL_CELLS.filter((c) => c !== idx)),
  }))
}

/**
 * 배제형 exclusion — whole region excluded (판당 1장만).
 */
function enumerateExclusion(): Candidate[] {
  const out: Candidate[] = []
  for (const region of allRegions()) {
    out.push({
      id: `excl-${region.slotName}`,
      type: 'exclusion',
      text: `폭탄은 ${region.slotName}에 없어요.`,
      possibleBombs: new Set(ALL_CELLS.filter((c) => !region.cells.has(c))),
    })
  }
  return out
}

function enumerateAll(placements: Placed[]): Candidate[] {
  return [
    ...enumerateRelation(placements),
    ...enumerateConditional(placements),
    ...enumerateElimination(),
    ...enumerateExclusion(),
  ]
}

/* ============================================================
 * Derivation
 * ============================================================ */

// Target candidate-pool sizes AFTER each new rule.
const ALL_TARGETS: Array<{ min: number; max: number }> = [
  { min: 6, max: 8 },  // after 1 public rule — still broad
  { min: 4, max: 6 },  // after 2
  { min: 3, max: 5 },  // after 3
]
const ME_TARGETS: Array<{ min: number; max: number }> = [
  { min: 3, max: 5 },
  { min: 2, max: 4 },
  { min: 2, max: 3 },
]
const MIN_REMAINING = 2                    // spec floor — never resolve bomb
const MAX_REDUCTION_PER_STEP = 4           // don't collapse pool in one shot
const AMBIGUITY_BONUS_THRESHOLD = 3        // reward pools ≥ 3 during selection

function distanceTo(size: number, min: number, max: number): number {
  if (size < min) return (min - size) * 3
  if (size > max) return size - max
  return 0
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  const out = new Set<number>()
  a.forEach((v) => { if (b.has(v)) out.add(v) })
  return out
}

export interface RevealHistoryEntry {
  cardIndex: number;
  ruleId: string;
  scope: 'ALL' | 'ME';
  type: RuleType;
  ownerId?: string;
}

interface DeriveArgs {
  placements: Placed[];
  seed: number;
  revealHistory: ReadonlyArray<RevealHistoryEntry>;
  revealCardIndex: number;
  scope: 'ALL' | 'ME';
  ownerId?: string;
}

function exclusionUsed(history: ReadonlyArray<RevealHistoryEntry>): boolean {
  return history.some((h) => h.type === 'exclusion')
}

export function deriveRuleForReveal(args: DeriveArgs): RuleFact | null {
  const { placements, seed, revealHistory, revealCardIndex, scope, ownerId } = args
  const bomb = placements.find((p) => p.kind === 'BOMB')!.index

  // Enumerate every candidate this board can phrase, filter truthful.
  const catalogue = enumerateAll(placements)
  const truthful = catalogue.filter((c) => c.possibleBombs.has(bomb))
  const usedIds = new Set(revealHistory.map((h) => h.ruleId))
  const available = truthful.filter((c) => !usedIds.has(c.id))

  const priorAllEntries = revealHistory.filter((h) => h.scope === 'ALL')
  const priorMeSelfEntries = scope === 'ME'
    ? revealHistory.filter((h) => h.scope === 'ME' && h.ownerId === ownerId)
    : []

  const priorRuleSets = [...priorAllEntries, ...priorMeSelfEntries]
    .map((h) => catalogue.find((c) => c.id === h.ruleId))
    .filter((c): c is Candidate => Boolean(c))
    .map((c) => c.possibleBombs)

  const currentPool = priorRuleSets.reduce(
    (acc: Set<number>, s) => intersect(acc, s),
    new Set(ALL_CELLS),
  )

  const curve = scope === 'ALL' ? ALL_TARGETS : ME_TARGETS
  const step = scope === 'ALL' ? priorAllEntries.length : priorMeSelfEntries.length
  const target = curve[Math.min(step, curve.length - 1)]

  const alreadyExclusion = exclusionUsed(revealHistory)

  const scored: Array<{ rule: Candidate; score: number; nextSize: number }> = []
  for (const rule of available) {
    if (rule.type === 'exclusion' && alreadyExclusion) continue
    const next = intersect(currentPool, rule.possibleBombs)
    if (!next.has(bomb)) continue
    if (next.size < MIN_REMAINING) continue             // hard floor
    const reduction = currentPool.size - next.size
    if (reduction > MAX_REDUCTION_PER_STEP) continue    // gradual info only
    // Preferred behaviours (negative score = better):
    //   1. Hit target range.
    //   2. Nudge (not slam) the pool.
    //   3. Bonus if final pool is still ambiguous (≥3).
    //   4. Exclusion carries a small pull so it appears when available.
    const strictReducer = next.size < currentPool.size
    const ambiguityBonus = next.size >= AMBIGUITY_BONUS_THRESHOLD ? -0.25 : 0
    const exclusionBonus = rule.type === 'exclusion' ? -0.35 : 0
    const score = distanceTo(next.size, target.min, target.max)
      - reduction * 0.12
      + (strictReducer ? -0.3 : 0.6)
      + ambiguityBonus
      + exclusionBonus
    scored.push({ rule, score, nextSize: next.size })
  }

  if (scored.length === 0) {
    // Fallback: relax MAX_REDUCTION_PER_STEP, keep MIN_REMAINING.
    const fallback = available.find((r) => {
      if (r.type === 'exclusion' && alreadyExclusion) return false
      const next = intersect(currentPool, r.possibleBombs)
      return next.has(bomb) && next.size >= MIN_REMAINING
    })
    if (!fallback) return null
    return {
      ruleId: fallback.id, text: fallback.text, scope, type: fallback.type,
      possibleBombs: Array.from(fallback.possibleBombs).sort((a, b) => a - b),
    }
  }

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
