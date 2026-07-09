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
    maxReductionPerStep: 3,
    ambiguityBonusThreshold: 3,
  },
  4: {
    side: 4,
    composition: { BOMB: 1, ALL: 4, ME: 4, SAFE: 7 },
    allTargets: [
      { min: 12, max: 15 },
      { min: 9,  max: 12 },
      { min: 6,  max: 10 },
      { min: 4,  max: 7  },
    ],
    meTargets: [
      { min: 8, max: 12 },
      { min: 6, max: 9 },
      { min: 4, max: 7 },
      { min: 3, max: 5 },
    ],
    // Bumped floor 2 → 3 so the pool doesn't collapse to two candidates
    // after a couple of reveals — that starved the rule engine and made
    // the "좁힐 규칙이 없어요" placeholder fire way too often.
    minRemaining: 3,
    // Slower shrink cap: was 6, now 4. Combined with the higher floor,
    // every reveal gets a meaningful rule for the whole 4×4 arc.
    maxReductionPerStep: 4,
    ambiguityBonusThreshold: 5,
  },
  5: {
    side: 5,
    composition: { BOMB: 1, ALL: 5, ME: 5, SAFE: 14 },
    allTargets: [
      { min: 18, max: 22 },
      { min: 14, max: 18 },
      { min: 10, max: 15 },
      { min: 6,  max: 11 },
      { min: 5,  max: 8  },
    ],
    meTargets: [
      { min: 12, max: 16 },
      { min: 8,  max: 12 },
      { min: 5,  max: 9 },
      { min: 4,  max: 7 },
    ],
    minRemaining: 4,          // was 3 · bigger board needs more headroom
    maxReductionPerStep: 6,   // was 10 · same reason — kept slower shrink
    ambiguityBonusThreshold: 7,
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
    throw new Error(`BombHunt composition for side=${side} sums to ${pool.length}, expected ${target}`)
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

    // Directional — user callout: pointing at "cell in direction X of a
    // known card" narrows to a small (often single-cell) set, which
    // reads as an elimination in disguise. Only surface directional
    // relative rules when the resulting pool is at least 3 cells so
    // it still functions as a real range hint.
    for (const dir of DIR_KEYS) {
      const dirPool = new Set<number>()
      kindCells.forEach((c) => {
        const t = dirOffset(c, dir, side)
        if (t !== null) dirPool.add(t)
      })
      if (dirPool.size >= 3) {
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

/**
 * 조건형 candidates. The previous wording ("어떤 X 카드가 열리면 …")
 * implied a dependency on a specific kind being flipped that the rule
 * didn't actually enforce — every such rule is truthful independent of
 * that condition. Reworded to be plain region-based statements. The
 * "condition" flavour is preserved by pairing the rule with the fact
 * that it was surfaced BECAUSE a hint card of the referenced kind was
 * just flipped, but the rule itself just tells you where the bomb sits.
 */
function enumerateConditional(placements: Placed[], side: number): Candidate[] {
  const out: Candidate[] = []
  const REFERENCED_KINDS: CardKind[] = ['SAFE', 'ALL', 'ME']
  const regions = allRegions(side)
  const cells = allCells(side)
  const total = boardSize(side)
  for (const kind of REFERENCED_KINDS) {
    if (indexesOf(kind, placements).length === 0) continue
    for (const region of regions) {
      if (region.cells.size < 3) continue
      if (region.cells.size >= total) continue  // trivial 100% region — nothing to narrow
      // Positive region rule: bomb ∈ region.
      out.push({
        id: `cond-${kind}-in-${region.slotName}`,
        type: 'conditional',
        text: `힌트: 폭탄은 ${region.slotName} 안에 있어요.`,
        possibleBombs: new Set(region.cells),
      })
      // Negative region rule: bomb ∉ region.
      if (region.cells.size <= Math.floor(total * 0.6)) {
        out.push({
          id: `cond-${kind}-notin-${region.slotName}`,
          type: 'conditional',
          text: `힌트: 폭탄은 ${region.slotName}에 없어요.`,
          possibleBombs: new Set(cells.filter((c) => !region.cells.has(c))),
        })
      }
    }
  }
  return out
}

/**
 * 소거형 — remove exactly one named cell. On boards larger than 3×3
 * the old "상단 중앙 칸" style labels became ambiguous (there are
 * multiple 상단 cells), so we lean on precise "N행 M열" coordinates
 * with a directional suffix in parentheses for readability.
 * Every non-corner face-up cell is fair game.
 * IDs keep the "elim-{idx}" shape so history matches survive resizes.
 */
/**
 * 소거형 — remove exactly one cell. Restricted to the CORNER + CENTER
 * positions only. Historically we produced one per cell (side*side
 * candidates), which drowned the pool: on a 5×5 board 25 elim rules
 * competed with ~40 relation / conditional / positional rules, so
 * "N행 M열이 아니에요" ended up being the most common surface even
 * though each one narrows by exactly 1 cell. Restricting to corners
 * + center gives a small deterministic set (≤5) so a whole match of
 * elim rules can't spam a single narrowing style.
 */
function enumerateElimination(side: number): Candidate[] {
  const cells = allCells(side)
  const targets = new Set<number>([...cornersOf(side)])
  if (side % 2 === 1) {
    // Odd side has an unambiguous center cell.
    const midRow = Math.floor(side / 2), midCol = Math.floor(side / 2)
    targets.add(midRow * side + midCol)
  } else {
    // Even side: use the four inner cells as centre candidates.
    const midA = Math.floor(side / 2) - 1
    const midB = Math.floor(side / 2)
    for (const r of [midA, midB]) for (const c of [midA, midB]) targets.add(r * side + c)
  }
  return [...targets].map<Candidate>((idx) => {
    const r = rowOf(idx, side)
    const c = colOf(idx, side)
    const label = `${r + 1}행 ${c + 1}열`
    return {
      id: `elim-${idx}`,
      type: 'elimination',
      text: `폭탄은 ${label}이 아니에요.`,
      possibleBombs: new Set(cells.filter((cc) => cc !== idx)),
    }
  })
}

/**
 * 위치 성격 규칙 — 폭탄이 특정 위치 프로퍼티를 갖는다/안 갖는다.
 * 코너/가장자리/대각선/중앙 열/중앙 행 등 순수 위치 술어. Board
 * geometry에만 의존해서 오판이 없다.
 */
function enumeratePositional(side: number): Candidate[] {
  const out: Candidate[] = []
  const cells = allCells(side)
  const total = boardSize(side)
  const corners = cornersOf(side)
  const edges = edgesOf(side)
  const diagA = diagonalA(side)
  const diagB = diagonalB(side)
  const positional: Array<{ name: string; cells: Set<number> }> = [
    { name: '모서리(코너)', cells: corners },
    { name: '가장자리',    cells: edges },
    { name: '대각선(↘)',   cells: diagA },
    { name: '대각선(↙)',   cells: diagB },
  ]
  if (side % 2 === 1) {
    const mid = Math.floor(side / 2)
    positional.push({
      name: '중앙 행',
      cells: new Set(cells.filter((i) => rowOf(i, side) === mid)),
    })
    positional.push({
      name: '중앙 열',
      cells: new Set(cells.filter((i) => colOf(i, side) === mid)),
    })
  }
  for (const p of positional) {
    if (p.cells.size === 0 || p.cells.size >= total) continue
    out.push({
      id: `pos-in-${p.name}`,
      type: 'conditional',
      text: `폭탄은 ${p.name}에 있어요.`,
      possibleBombs: new Set(p.cells),
    })
    out.push({
      id: `pos-notin-${p.name}`,
      type: 'conditional',
      text: `폭탄은 ${p.name}에 없어요.`,
      possibleBombs: new Set(cells.filter((c) => !p.cells.has(c))),
    })
  }
  return out
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

/**
 * 방금 뒤집은 카드 기준 관계형 — the just-revealed card becomes an
 * anchor, and rules describe the bomb's position relative to IT. Gives
 * per-reveal variety even on a mostly-known board because every new
 * reveal spawns a fresh anchor set.
 */
function enumerateRelativeToReveal(anchor: number, side: number): Candidate[] {
  const out: Candidate[] = []
  const anchorRow = rowOf(anchor, side)
  const anchorCol = colOf(anchor, side)
  const cells = allCells(side)

  // Adjacency (up/down/left/right of the anchor) — pool 2-4 cells.
  // User feedback: only surface adjacency when the pool has 3+ cells
  // so it doesn't collapse to "must be exactly this cell" style hints.
  const adj = new Set<number>(neighborsOrthogonal(anchor, side))
  if (adj.size >= 3) {
    out.push({
      id: `revrel-adj-${anchor}`,
      type: 'relation',
      text: `폭탄은 방금 뒤집은 카드와 인접해 있어요.`,
      possibleBombs: adj,
    })
  }

  // Half-plane rules — bomb sits in the multi-row / multi-column
  // region on ONE SIDE of the anchor. User called out the earlier
  // wording ("…의 왼쪽에 있어요") as ambiguous — sounded like
  // "immediately to the left of that card", which is single-cell.
  // Reworded to be explicit about the RANGE meaning ("…보다 왼쪽 열
  // 영역에 있어요") and gated on pool ≥ 4 cells so a barely-off-edge
  // anchor doesn't produce a near-singleton half.
  const leftHalf  = new Set<number>(cells.filter((c) => colOf(c, side) < anchorCol))
  const rightHalf = new Set<number>(cells.filter((c) => colOf(c, side) > anchorCol))
  const upHalf    = new Set<number>(cells.filter((c) => rowOf(c, side) < anchorRow))
  const downHalf  = new Set<number>(cells.filter((c) => rowOf(c, side) > anchorRow))
  const halves: Array<{ dir: string; label: string; pool: Set<number> }> = [
    { dir: 'left',  label: '왼쪽 열 영역에',  pool: leftHalf },
    { dir: 'right', label: '오른쪽 열 영역에', pool: rightHalf },
    { dir: 'up',    label: '위쪽 행 영역에',  pool: upHalf },
    { dir: 'down',  label: '아래쪽 행 영역에', pool: downHalf },
  ]
  for (const h of halves) {
    if (h.pool.size < 4) continue
    out.push({
      id: `revrel-half-${h.dir}-${anchor}`,
      type: 'conditional',
      text: `폭탄은 방금 뒤집은 카드보다 ${h.label} 있어요.`,
      possibleBombs: h.pool,
    })
  }

  // L-shaped half-plane (2 quadrants): "…의 왼쪽 위 사분면에 있어요"
  // gives a wider region than a single half but still ≠ full-half.
  const quadrants: Array<{ dir: string; label: string; pred: (c: number) => boolean }> = [
    { dir: 'tl', label: '왼쪽 위',   pred: (c) => colOf(c, side) <= anchorCol && rowOf(c, side) <= anchorRow && c !== anchor },
    { dir: 'tr', label: '오른쪽 위', pred: (c) => colOf(c, side) >= anchorCol && rowOf(c, side) <= anchorRow && c !== anchor },
    { dir: 'bl', label: '왼쪽 아래', pred: (c) => colOf(c, side) <= anchorCol && rowOf(c, side) >= anchorRow && c !== anchor },
    { dir: 'br', label: '오른쪽 아래', pred: (c) => colOf(c, side) >= anchorCol && rowOf(c, side) >= anchorRow && c !== anchor },
  ]
  for (const q of quadrants) {
    const pool = new Set<number>(cells.filter(q.pred))
    if (pool.size < 4 || pool.size >= cells.length - 1) continue
    out.push({
      id: `revrel-quad-${q.dir}-${anchor}`,
      type: 'conditional',
      text: `폭탄은 방금 뒤집은 카드의 ${q.label} 사분면 안에 있어요.`,
      possibleBombs: pool,
    })
  }

  // Same row / column — reworded to be explicit ("같은 행 영역", not
  // "같은 행" which read as "somewhere on that horizontal line" but
  // some testers parsed as "beside it").
  const sameRow = new Set<number>(cells.filter((c) => rowOf(c, side) === anchorRow && c !== anchor))
  if (sameRow.size >= 3) {
    out.push({
      id: `revrel-row-${anchor}`,
      type: 'relation',
      text: `폭탄은 방금 뒤집은 카드와 같은 행에 있어요.`,
      possibleBombs: sameRow,
    })
  }
  const sameCol = new Set<number>(cells.filter((c) => colOf(c, side) === anchorCol && c !== anchor))
  if (sameCol.size >= 3) {
    out.push({
      id: `revrel-col-${anchor}`,
      type: 'relation',
      text: `폭탄은 방금 뒤집은 카드와 같은 열에 있어요.`,
      possibleBombs: sameCol,
    })
  }

  // Manhattan-distance bands. Gives a "폭탄은 정확히 두 칸 거리 안에
  // 있어요" flavour that's neither adjacency nor half-plane.
  for (const d of [2, 3] as const) {
    const band = new Set<number>(
      cells.filter((c) => {
        const dist = Math.abs(rowOf(c, side) - anchorRow) + Math.abs(colOf(c, side) - anchorCol)
        return dist >= 1 && dist <= d
      }),
    )
    if (band.size < 4 || band.size >= cells.length - 1) continue
    out.push({
      id: `revrel-dist-${d}-${anchor}`,
      type: 'relation',
      text: `폭탄은 방금 뒤집은 카드로부터 ${d}칸 이내에 있어요.`,
      possibleBombs: band,
    })
  }

  // Complement — "…로부터 D칸 이상 떨어져 있어요" gives a big range
  // rule (all far cells) that plays well as a persistent constraint.
  for (const d of [2, 3] as const) {
    const farBand = new Set<number>(
      cells.filter((c) => {
        const dist = Math.abs(rowOf(c, side) - anchorRow) + Math.abs(colOf(c, side) - anchorCol)
        return dist >= d
      }),
    )
    if (farBand.size < 5 || farBand.size >= cells.length - 1) continue
    out.push({
      id: `revrel-far-${d}-${anchor}`,
      type: 'relation',
      text: `폭탄은 방금 뒤집은 카드로부터 ${d}칸 이상 떨어져 있어요.`,
      possibleBombs: farBand,
    })
  }
  return out
}

function enumerateAll(placements: Placed[], side: number, anchor?: number): Candidate[] {
  const raw = [
    ...enumerateRelation(placements, side),
    ...enumerateConditional(placements, side),
    ...enumeratePositional(side),
    ...enumerateElimination(side),
    ...enumerateExclusion(side),
    ...(typeof anchor === 'number' ? enumerateRelativeToReveal(anchor, side) : []),
  ]
  // Validation pass — a candidate must:
  //   · have a non-empty possibleBombs set
  //   · not span the entire board (100% is trivially true, useless)
  //   · have text that doesn't drift with size changes
  const total = boardSize(side)
  const valid = raw.filter((c) =>
    c.possibleBombs.size > 0 &&
    c.possibleBombs.size < total &&
    c.text.trim().length > 0,
  )
  // De-dup by (text, size-of-set) — two candidates that would produce
  // identical rule text AND identical narrowing are functionally the
  // same. Prefer the first one (stable id-order).
  const seen = new Set<string>()
  return valid.filter((c) => {
    const key = `${c.text}:${c.possibleBombs.size}:${[...c.possibleBombs].sort((a, b) => a - b).join(',')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
  /** Cells that are already face-up (and therefore known not to be the
   * bomb). Rules whose `possibleBombs` set is a strict superset of the
   * live candidate pool would give the player zero new information —
   * we skip them so a rule like "폭탄은 왼쪽 중앙에 없어요" doesn't
   * fire when the left-centre cell is already revealed as SAFE. */
  revealedIndices?: ReadonlyArray<number>;
}

function exclusionUsed(history: ReadonlyArray<RevealHistoryEntry>): boolean {
  return history.some((h) => h.type === 'exclusion')
}

export function deriveRuleForReveal(args: DeriveArgs): RuleFact | null {
  const { placements, seed, revealHistory, revealCardIndex, scope, ownerId } = args
  const side: BoardSide = args.side ?? 3
  const profile = SIZE_PROFILES[side]
  const bomb = placements.find((p) => p.kind === 'BOMB')!.index

  const catalogue = enumerateAll(placements, side, revealCardIndex)
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

  // Base pool: all cells minus the ones already flipped face-up (those
  // cells are known-safe by observation, no rule needs to re-state it).
  // Then intersect with every prior rule's set.
  const revealedSet = new Set(args.revealedIndices ?? [])
  const initialPool = new Set(allCells(side).filter((c) => !revealedSet.has(c)))
  const currentPool = priorRuleSets.reduce(
    (acc: Set<number>, s) => intersect(acc, s),
    initialPool,
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
    // Hard gate: rule that doesn't narrow the pool at all is
    // meaningless. Previous version only penalised via score; a
    // useless rule could still leak through as the least-bad option.
    // Explicit skip so `힌트: 폭탄은 …` never fires without actually
    // updating the candidate pool.
    if (reduction === 0) continue
    if (reduction > profile.maxReductionPerStep) continue
    const ambiguityBonus = next.size >= profile.ambiguityBonusThreshold ? -0.25 : 0
    // Rule-type shaping — the user reported elimination + negative-region
    // rules were spamming the pool. Weight the score so relation /
    // positive-conditional / positive-positional statements bubble to
    // the top; elimination + exclusion (both "폭탄은 X에 없어요" style)
    // stay in the mix but only surface when the friendlier types can't
    // provide the same narrowing.
    const isNegativeText = /없어요\.$/.test(rule.text) || /아니에요\.$/.test(rule.text)
    const typeShape =
      rule.type === 'relation'     ? -0.35 :
      rule.type === 'conditional'  ? (isNegativeText ? 0.35 : -0.15) :
      rule.type === 'elimination'  ?  0.7  :   // was 0
      rule.type === 'exclusion'    ?  0.55 :   // was 0.15
      0
    const score = distanceTo(next.size, target.min, target.max)
      - reduction * 0.12
      - 0.3                                   // reducer already gate-guaranteed
      + ambiguityBonus
      + typeShape
    scored.push({ rule, score, nextSize: next.size })
  }

  if (scored.length === 0) {
    // Softened fallback: search across THREE rungs of leniency before
    // giving up. Prior version required `next.size >= profile.
    // minRemaining` AND already-guaranteed truthfulness — the moment
    // the pool sat at minRemaining, every remaining rule dropped it
    // below and we surfaced the "규칙이 없어요" placeholder even
    // though there were still meaningful relative rules to give.
    const searchRungs: Array<(r: Candidate) => boolean> = [
      // Rung 1: rule that keeps pool at ≥ minRemaining (may not narrow)
      (r) => {
        if (r.type === 'exclusion' && alreadyExclusion) return false
        const next = intersect(currentPool, r.possibleBombs)
        return next.has(bomb) && next.size >= profile.minRemaining
      },
      // Rung 2: allow one below minRemaining as long as pool > 1
      (r) => {
        if (r.type === 'exclusion' && alreadyExclusion) return false
        const next = intersect(currentPool, r.possibleBombs)
        return next.has(bomb) && next.size >= 2
      },
      // Rung 3: any truthful rule that still contains the bomb
      (r) => {
        const next = intersect(currentPool, r.possibleBombs)
        return next.has(bomb) && next.size >= 1
      },
    ]
    for (const test of searchRungs) {
      const fallback = available.find(test)
      if (!fallback) continue
      return {
        ruleId: fallback.id,
        text: fallback.text,
        scope,
        type: fallback.type,
        possibleBombs: Array.from(fallback.possibleBombs).sort((a, b) => a - b),
      }
    }
    return null
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
