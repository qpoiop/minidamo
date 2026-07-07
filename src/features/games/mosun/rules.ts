/*
 * Mosun rule generator — template + slot system (spec §E).
 *
 *   1. Type-tagged templates carry a text shape with slots ({X}, {영역})
 *      and an enumeration function that grounds those slots against the
 *      current placements (which real card index / which region).
 *   2. enumerate() produces every slot-filled candidate for the current
 *      board. Each carries `possibleBombs` = the set of cells where the
 *      bomb could sit if that rule holds.
 *   3. deriveRuleForReveal picks from truthful candidates whose predicate
 *      is satisfied by the actual bomb position AND leaves ≥2 candidates
 *      in the running pool (spec's core invariant).
 *
 * All text is built by rendering the template with concrete slot values,
 * so a rule can never contradict the board: it refers to the actual
 * cards / regions on this board, not a pre-baked sentence.
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

// Display numbers use 1-indexed (spec examples: "7번", "4번").
const disp = (i: number) => i + 1

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

/* ================================================================
 * Regions used by exclusion / conditional templates.
 * ================================================================ */

interface Region {
  slotName: string;  // human label for {영역} slot
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
    { slotName: '대각선 (↘)', cells: new Set(DIAGONAL_A) },
    { slotName: '대각선 (↙)', cells: new Set(DIAGONAL_B) },
  ]
}

/* ================================================================
 * Templates — each returns a list of concrete rules for the given
 * placements. Rule ids are unique per (template, slot values) so the
 * dedup set inside the derivation can trust them.
 *
 * Every enumerated candidate carries the set of cells where the bomb
 * would sit IF this rule holds → the derivation intersects these
 * against the truthful pool.
 * ================================================================ */

export interface Candidate {
  id: string;
  text: string;
  type: RuleType;
  possibleBombs: Set<number>;
}

/** 관계형 relation: bomb relates to a specific other card. */
function enumerateRelation(placements: Placed[]): Candidate[] {
  const out: Candidate[] = []
  const nonBombCells = placements.filter((p) => p.kind !== 'BOMB').map((p) => p.index)
  for (const x of nonBombCells) {
    // 인접(상하좌우)
    out.push({
      id: `rel-adj-${x}`,
      type: 'relation',
      text: `폭탄은 ${disp(x)}번 카드와 인접해 있어요.`,
      possibleBombs: new Set(neighborsOrthogonal(x)),
    })
    // 같은 줄 (row)
    out.push({
      id: `rel-row-${x}`,
      type: 'relation',
      text: `폭탄은 ${disp(x)}번 카드와 같은 줄에 있어요.`,
      possibleBombs: new Set(ALL_CELLS.filter((c) => c !== x && rowOf(c) === rowOf(x))),
    })
    // 같은 열 (col)
    out.push({
      id: `rel-col-${x}`,
      type: 'relation',
      text: `폭탄은 ${disp(x)}번 카드와 같은 열에 있어요.`,
      possibleBombs: new Set(ALL_CELLS.filter((c) => c !== x && colOf(c) === colOf(x))),
    })
    // 대각선 방향
    const diag = new Set<number>()
    if (DIAGONAL_A.has(x)) DIAGONAL_A.forEach((c) => { if (c !== x) diag.add(c) })
    if (DIAGONAL_B.has(x)) DIAGONAL_B.forEach((c) => { if (c !== x) diag.add(c) })
    if (diag.size > 0) {
      out.push({
        id: `rel-diag-${x}`,
        type: 'relation',
        text: `폭탄은 ${disp(x)}번 카드와 대각선 방향에 있어요.`,
        possibleBombs: diag,
      })
    }
  }
  return out
}

/** 소거형 elimination: one specific cell is not the bomb. */
function enumerateElimination(placements: Placed[]): Candidate[] {
  return placements
    .filter((p) => p.kind !== 'BOMB')
    .map<Candidate>((p) => ({
      id: `elim-${p.index}`,
      type: 'elimination',
      text: `${disp(p.index)}번 카드는 폭탄이 아니에요.`,
      possibleBombs: new Set(ALL_CELLS.filter((c) => c !== p.index)),
    }))
}

/** 조건형 conditional: "if X is safe, bomb could be in region R". */
function enumerateConditional(placements: Placed[]): Candidate[] {
  const out: Candidate[] = []
  const safeCards = placements.filter((p) => p.kind !== 'BOMB').map((p) => p.index)
  const regions = allRegions()
  for (const x of safeCards) {
    for (const region of regions) {
      // Skip regions that fully contain X — statement becomes trivial.
      if (region.cells.has(x) && region.cells.size <= 3) continue
      out.push({
        id: `cond-${x}-${region.slotName}`,
        type: 'conditional',
        text: `${disp(x)}번이 안전이면, 폭탄은 ${region.slotName}에 있을 수 있어요.`,
        // Bomb must be in region for statement to be true (since X is
        // actually safe, antecedent holds → consequent required true).
        possibleBombs: new Set(region.cells),
      })
    }
  }
  return out
}

/** 배제형 exclusion: whole region excluded (판당 1장만). */
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
    ...enumerateElimination(placements),
    ...enumerateConditional(placements),
    ...enumerateExclusion(),
  ]
}

/* ================================================================
 * Derivation
 * ================================================================ */

const ALL_TARGETS: Array<{ min: number; max: number }> = [
  { min: 5, max: 7 },  // after 1 public rule
  { min: 3, max: 5 },  // after 2 public rules
  { min: 2, max: 4 },  // after 3 public rules
]
const ME_TARGETS: Array<{ min: number; max: number }> = [
  { min: 2, max: 4 },
  { min: 2, max: 3 },
  { min: 2, max: 2 },
]
const MIN_REMAINING = 2

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

  // 1. Enumerate every possible rule that can be phrased for this board.
  const catalogue = enumerateAll(placements)
    // Spec §B: 참조 카드가 규칙 카드 자신을 가리키지 않게.
    .filter((c) => !c.id.endsWith(`-${revealCardIndex}`))

  // 2. Filter truthful (bomb actually satisfies the rule).
  const truthful = catalogue.filter((c) => c.possibleBombs.has(bomb))

  // 3. Filter used.
  const usedIds = new Set(revealHistory.map((h) => h.ruleId))
  const available = truthful.filter((c) => !usedIds.has(c.id))

  // 4. Current pool this viewer's derivation should target.
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

  // 5. Score.
  const scored: Array<{ rule: Candidate; score: number }> = []
  for (const rule of available) {
    if (rule.type === 'exclusion' && alreadyExclusion) continue
    const next = intersect(currentPool, rule.possibleBombs)
    if (!next.has(bomb)) continue
    if (next.size < MIN_REMAINING) continue    // spec invariant: 후보 ≥ 2
    const strictReducer = next.size < currentPool.size
    const exclusionBonus = rule.type === 'exclusion' ? -0.35 : 0
    const score = distanceTo(next.size, target.min, target.max)
      - (currentPool.size - next.size) * 0.15
      + (strictReducer ? -0.4 : 0.6)
      + exclusionBonus
    scored.push({ rule, score })
  }

  if (scored.length === 0) {
    // Fallback: any truthful, unused rule that keeps pool valid.
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
