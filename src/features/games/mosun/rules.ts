/**
 * Rule engine for 모순.
 *
 * The board is a square SIDE×SIDE grid of face-down cards. Every
 * position is drawn from one of BOMB / ALL / ME / SAFE (`CardKind`).
 * When a player flips a card we derive one truthful hint about the
 * bomb's location — either a public rule (ALL) or a private hint (ME).
 *
 * Two spec constraints drive the design:
 *   1. **Never resolve the bomb.** The candidate pool must contract
 *      gradually and never shrink below MIN_REMAINING (2). "폭탄 찾기"
 *      is the endgame decision — the engine must not steal it.
 *   2. **Rules are stable across the reveal history.** We enumerate
 *      every candidate the current board can phrase, filter for
 *      truthful ones (the bomb sits in the rule's `possibleBombs`
 *      set), skip already-used ids, and score the survivors against a
 *      shrink target curve. Determinism comes from the placement seed
 *      + the reveal index.
 *
 * Board sizes: 3, 5, 7. All helpers accept `side` explicitly; nothing
 * hard-codes 3 any more. Composition (BOMB/ALL/ME/SAFE counts) and
 * shrink-target curves scale per-side via SIZE_PROFILES.
 */

export type CardKind = 'BOMB' | 'ALL' | 'ME' | 'SAFE'
export type RuleType = 'relation' | 'conditional' | 'elimination' | 'exclusion'

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

export type BoardSide = 3 | 4 | 5

/* ============================================================
 * Board math — everything here takes `side` as a parameter.
 * ============================================================ */

function boardSize(side: number): number { return side * side }
function rowOf(i: number, side: number): number { return Math.floor(i / side) }
function colOf(i: number, side: number): number { return i % side }
function allCells(side: number): number[] {
  return Array.from({ length: boardSize(side) }, (_, i) => i)
}

function cornersOf(side: number): Set<number> {
  const last = side - 1
  return new Set([0, last, last * side, last * side + last])
}
function edgesOf(side: number): Set<number> {
  // Non-corner cells on the outermost ring.
  const last = side - 1
  const out = new Set<number>()
  for (let c = 1; c < last; c++) out.add(c)
  for (let c = 1; c < last; c++) out.add(last * side + c)
  for (let r = 1; r < last; r++) out.add(r * side)
  for (let r = 1; r < last; r++) out.add(r * side + last)
  return out
}
function diagonalA(side: number): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < side; i++) out.add(i * side + i)
  return out
}
function diagonalB(side: number): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < side; i++) out.add(i * side + (side - 1 - i))
  return out
}

function neighborsOrthogonal(i: number, side: number): number[] {
  const r = rowOf(i, side)
  const c = colOf(i, side)
  const out: number[] = []
  if (r > 0) out.push(i - side)
  if (r < side - 1) out.push(i + side)
  if (c > 0) out.push(i - 1)
  if (c < side - 1) out.push(i + 1)
  return out
}

const KIND_LABEL: Record<CardKind, string> = {
  BOMB: '폭탄',
  ALL: '전체힌트',
  ME: '개인힌트',
  SAFE: '일반',
}

// Directional offsets: bomb sits "to the {dir} of" X → bomb.pos = X + delta
// Keys stay short so rule IDs remain stable across board sizes.
const DIR_KEYS = ['우측', '좌측', '위쪽', '아래쪽'] as const
type Dir = typeof DIR_KEYS[number]
const DIR_PHRASE: Record<Dir, string> = {
  우측: '바로 오른칸',
  좌측: '바로 왼칸',
  위쪽: '바로 윗칸',
  아래쪽: '바로 아랫칸',
}
function dirOffset(i: number, dir: Dir, side: number): number | null {
  switch (dir) {
    case '우측': return colOf(i, side) < side - 1 ? i + 1 : null
    case '좌측': return colOf(i, side) > 0 ? i - 1 : null
    case '위쪽': return rowOf(i, side) > 0 ? i - side : null
    case '아래쪽': return rowOf(i, side) < side - 1 ? i + side : null
  }
}

/* ============================================================
 * Size profiles — card composition + shrink-target curves per side.
 * ============================================================ */

interface SizeProfile {
  side: BoardSide;
  composition: Record<CardKind, number>;
  allTargets: Array<{ min: number; max: number }>;
  meTargets: Array<{ min: number; max: number }>;
  minRemaining: number;
  maxReductionPerStep: number;
  ambiguityBonusThreshold: number;
}

/**
 * Composition scaling — spec:
 *   각 사이즈 스텝마다 개인·전체 힌트 카드 +1
 *   3×3 (9  cells): BOMB 1 · ALL 3 · ME 3 · SAFE 2
 *   4×4 (16 cells): BOMB 1 · ALL 4 · ME 4 · SAFE 7
 *   5×5 (25 cells): BOMB 1 · ALL 5 · ME 5 · SAFE 14
 * Targets scale roughly with the total pool size.
 */
export const SIZE_PROFILES: Record<BoardSide, SizeProfile> = {
  3: {
    side: 3,
    composition: { BOMB: 1, ALL: 3, ME: 3, SAFE: 2 },
    allTargets: [
      { min: 6, max: 8 },
      { min: 4, max: 6 },
      { min: 3, max: 5 },
    ],
    meTargets: [
      { min: 3, max: 5 },
      { min: 2, max: 4 },
      { min: 2, max: 3 },
    ],
    minRemaining: 2,
    maxReductionPerStep: 4,
    ambiguityBonusThreshold: 3,
  },
  4: {
    side: 4,
    composition: { BOMB: 1, ALL: 4, ME: 4, SAFE: 7 },
    allTargets: [
      { min: 10, max: 14 },
      { min: 7, max: 11 },
      { min: 4, max: 8 },
      { min: 3, max: 6 },
    ],
    meTargets: [
      { min: 6, max: 10 },
      { min: 4, max: 8 },
      { min: 3, max: 5 },
      { min: 2, max: 4 },
    ],
    minRemaining: 2,
    maxReductionPerStep: 6,
    ambiguityBonusThreshold: 4,
  },
  5: {
    side: 5,
    composition: { BOMB: 1, ALL: 5, ME: 5, SAFE: 14 },
    allTargets: [
      { min: 15, max: 20 },
      { min: 10, max: 16 },
      { min: 6, max: 12 },
      { min: 4, max: 8 },
    ],
    meTargets: [
      { min: 8, max: 14 },
      { min: 5, max: 10 },
      { min: 3, max: 6 },
      { min: 2, max: 4 },
    ],
    minRemaining: 3,
    maxReductionPerStep: 10,
    ambiguityBonusThreshold: 5,
  },
}

export const CARD_COMPOSITION = SIZE_PROFILES[3].composition   // legacy export

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

export function generatePlacements(seed: number, side: BoardSide = 3): Placed[] {
  const profile = SIZE_PROFILES[side]
  const pool: CardKind[] = []
  ;(['BOMB', 'ALL', 'ME', 'SAFE'] as CardKind[]).forEach((k) => {
    for (let i = 0; i < profile.composition[k]; i++) pool.push(k)
  })
  // Composition length must equal side² — guard so a mis-tuned profile
  // is caught early instead of silently generating undersized boards.
  const target = boardSize(side)
  if (pool.length !== target) {
    throw new Error(`Mosun composition for side=${side} sums to ${pool.length}, expected ${target}`)
  }
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

function allRegions(side: number): Region[] {
  const regions: Region[] = []
  for (let r = 0; r < side; r++) {
    regions.push({
      slotName: `${r + 1}행`,
      cells: new Set(allCells(side).filter((c) => rowOf(c, side) === r)),
    })
  }
  for (let c = 0; c < side; c++) {
    regions.push({
      slotName: `${c + 1}열`,
      cells: new Set(allCells(side).filter((cell) => colOf(cell, side) === c)),
    })
  }
  regions.push({ slotName: '모서리', cells: cornersOf(side) })
  regions.push({ slotName: '가장자리', cells: edgesOf(side) })
  regions.push({ slotName: '대각선(↘)', cells: diagonalA(side) })
  regions.push({ slotName: '대각선(↙)', cells: diagonalB(side) })
  return regions
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

function enumerateRelation(placements: Placed[], side: number): Candidate[] {
  const out: Candidate[] = []
  const REFERENCED_KINDS: CardKind[] = ['SAFE', 'ALL', 'ME']
  const cells = allCells(side)

  for (const kind of REFERENCED_KINDS) {
    const kindCells = indexesOf(kind, placements)
    if (kindCells.length === 0) continue

    // Adjacency (orthogonal).
    const adjPool = new Set<number>()
    kindCells.forEach((c) => neighborsOrthogonal(c, side).forEach((n) => adjPool.add(n)))
    if (adjPool.size > 0) {
      out.push({
        id: `rel-adj-${kind}`,
        type: 'relation',
        text: `폭탄은 ${KIND_LABEL[kind]} 카드와 인접해 있어요.`,
        possibleBombs: adjPool,
      })
    }

    // Directional.
    for (const dir of DIR_KEYS) {
      const dirPool = new Set<number>()
      kindCells.forEach((c) => {
        const t = dirOffset(c, dir, side)
        if (t !== null) dirPool.add(t)
      })
      if (dirPool.size > 0) {
        out.push({
          id: `rel-dir-${kind}-${dir}`,
          type: 'relation',
          text: `폭탄은 어떤 ${KIND_LABEL[kind]} 카드의 ${DIR_PHRASE[dir]}에 있어요.`,
          possibleBombs: dirPool,
        })
      }
    }

    // Same row / column.
    const rowPool = new Set<number>()
    kindCells.forEach((c) => cells.forEach((cc) => { if (cc !== c && rowOf(cc, side) === rowOf(c, side)) rowPool.add(cc) }))
    if (rowPool.size > 0) {
      out.push({
        id: `rel-row-${kind}`,
        type: 'relation',
        text: `폭탄은 ${KIND_LABEL[kind]} 카드와 같은 줄에 있어요.`,
        possibleBombs: rowPool,
      })
    }
    const colPool = new Set<number>()
    kindCells.forEach((c) => cells.forEach((cc) => { if (cc !== c && colOf(cc, side) === colOf(c, side)) colPool.add(cc) }))
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

function enumerateConditional(placements: Placed[], side: number): Candidate[] {
  const out: Candidate[] = []
  const REFERENCED_KINDS: CardKind[] = ['SAFE', 'ALL', 'ME']
  const regions = allRegions(side)
  for (const kind of REFERENCED_KINDS) {
    if (indexesOf(kind, placements).length === 0) continue
    for (const region of regions) {
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
 * 소거형 — remove exactly one named cell. Positions scale with `side`:
 *   · center (only for odd sizes ≥ 3)
 *   · four corners (always)
 *   · 각 변의 중앙 칸 (only for odd sizes ≥ 3 — corners already cover
 *     the outermost row/col otherwise)
 * IDs keep the "elim-{idx}" shape so history matches survive resizes.
 */
function enumerateElimination(side: number): Candidate[] {
  const last = side - 1
  const positions: Array<{ idx: number; label: string }> = []
  const centerIdx = Math.floor(boardSize(side) / 2)
  if (side % 2 === 1) positions.push({ idx: centerIdx, label: '중앙 칸' })
  positions.push({ idx: 0, label: '왼쪽 상단 코너' })
  positions.push({ idx: last, label: '오른쪽 상단 코너' })
  positions.push({ idx: last * side, label: '왼쪽 하단 코너' })
  positions.push({ idx: last * side + last, label: '오른쪽 하단 코너' })
  if (side >= 3) {
    const mid = Math.floor(side / 2)
    positions.push({ idx: mid, label: '상단 중앙 칸' })
    positions.push({ idx: mid * side, label: '왼쪽 중앙 칸' })
    positions.push({ idx: mid * side + last, label: '오른쪽 중앙 칸' })
    positions.push({ idx: last * side + mid, label: '하단 중앙 칸' })
  }
  const cells = allCells(side)
  return positions.map<Candidate>(({ idx, label }) => ({
    id: `elim-${idx}`,
    type: 'elimination',
    text: `폭탄은 ${label}이 아니에요.`,
    possibleBombs: new Set(cells.filter((c) => c !== idx)),
  }))
}

function enumerateExclusion(side: number): Candidate[] {
  const out: Candidate[] = []
  const cells = allCells(side)
  for (const region of allRegions(side)) {
    out.push({
      id: `excl-${region.slotName}`,
      type: 'exclusion',
      text: `폭탄은 ${region.slotName}에 없어요.`,
      possibleBombs: new Set(cells.filter((c) => !region.cells.has(c))),
    })
  }
  return out
}

function enumerateAll(placements: Placed[], side: number): Candidate[] {
  return [
    ...enumerateRelation(placements, side),
    ...enumerateConditional(placements, side),
    ...enumerateElimination(side),
    ...enumerateExclusion(side),
  ]
}

/* ============================================================
 * Derivation
 * ============================================================ */

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
  side?: BoardSide;
}

function exclusionUsed(history: ReadonlyArray<RevealHistoryEntry>): boolean {
  return history.some((h) => h.type === 'exclusion')
}

export function deriveRuleForReveal(args: DeriveArgs): RuleFact | null {
  const { placements, seed, revealHistory, revealCardIndex, scope, ownerId } = args
  const side: BoardSide = args.side ?? 3
  const profile = SIZE_PROFILES[side]
  const bomb = placements.find((p) => p.kind === 'BOMB')!.index

  const catalogue = enumerateAll(placements, side)
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
    new Set(allCells(side)),
  )

  const curve = scope === 'ALL' ? profile.allTargets : profile.meTargets
  const step = scope === 'ALL' ? priorAllEntries.length : priorMeSelfEntries.length
  const target = curve[Math.min(step, curve.length - 1)]

  const alreadyExclusion = exclusionUsed(revealHistory)
  const totalReveals = revealHistory.length
  const exclusionLocked = totalReveals < 2

  const scored: Array<{ rule: Candidate; score: number; nextSize: number }> = []
  for (const rule of available) {
    if (rule.type === 'exclusion' && (alreadyExclusion || exclusionLocked)) continue
    const next = intersect(currentPool, rule.possibleBombs)
    if (!next.has(bomb)) continue
    if (next.size < profile.minRemaining) continue
    const reduction = currentPool.size - next.size
    if (reduction > profile.maxReductionPerStep) continue
    const strictReducer = next.size < currentPool.size
    const ambiguityBonus = next.size >= profile.ambiguityBonusThreshold ? -0.25 : 0
    const exclusionPenalty = rule.type === 'exclusion' ? 0.15 : 0
    const score = distanceTo(next.size, target.min, target.max)
      - reduction * 0.12
      + (strictReducer ? -0.3 : 0.6)
      + ambiguityBonus
      + exclusionPenalty
    scored.push({ rule, score, nextSize: next.size })
  }

  if (scored.length === 0) {
    const fallback = available.find((r) => {
      if (r.type === 'exclusion' && alreadyExclusion) return false
      const next = intersect(currentPool, r.possibleBombs)
      return next.has(bomb) && next.size >= profile.minRemaining
    })
    if (!fallback) return null
    return {
      ruleId: fallback.id, text: fallback.text, scope, type: fallback.type,
      possibleBombs: Array.from(fallback.possibleBombs).sort((a, b) => a - b),
    }
  }

  scored.sort((a, b) => a.score - b.score || a.rule.id.localeCompare(b.rule.id))
  const topK = scored.slice(0, Math.min(5, scored.length))
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

/** Legacy export — defaults to 3×3 board size (9 cells). Kept for
 *  call sites that guard board initialisation against a fixed count.
 *  New call sites should read boardSize(side) directly. */
export const BOARD_SIZE = boardSize(3)
export { boardSize }
