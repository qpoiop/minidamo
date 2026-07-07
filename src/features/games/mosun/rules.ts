/*
 * Rule generator for 코드네임 · 모순.
 *
 * A generated rule is always evaluated against the actual board layout —
 * every rule the game surfaces is guaranteed to be TRUE for the current
 * arrangement, so the player never runs into a self-contradiction. No AI
 * involved: rules are a small combinatorial vocabulary of predicates.
 *
 * The generator:
 *   1. Places cards deterministically from a seed (BOMB × 1, ALL × 3, ME × 3,
 *      SAFE × 2 across 9 cells).
 *   2. For each ALL / ME slot picks a template family, evaluates every
 *      template variant against the layout, and only keeps variants that
 *      resolve TRUE.
 *   3. Filters out trivial / redundant rules — the same fact is never
 *      shown twice.
 */

export type CardKind = 'BOMB' | 'ALL' | 'ME' | 'SAFE'

export interface Placed {
  index: number;
  kind: CardKind;
}

export interface RuleFact {
  ruleId: string;       // stable template id — useful for dedupe / analytics
  text: string;         // player-facing sentence
  scope: 'ALL' | 'ME';  // who sees the fact
}

const BOARD_SIZE = 9

// 3×3 layout helpers
function rowOf(i: number) { return Math.floor(i / 3) }
function colOf(i: number) { return i % 3 }
const CORNERS = new Set([0, 2, 6, 8])
const CENTER = 4
const EDGES = new Set([1, 3, 5, 7])
const DIAGONAL_A = new Set([0, 4, 8])
const DIAGONAL_B = new Set([2, 4, 6])

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

export const CARD_COMPOSITION: Record<CardKind, number> = { BOMB: 1, ALL: 3, ME: 3, SAFE: 2 }

export function generatePlacements(seed: number): Placed[] {
  const pool: CardKind[] = []
  ;(['BOMB', 'ALL', 'ME', 'SAFE'] as CardKind[]).forEach((k) => {
    for (let i = 0; i < CARD_COMPOSITION[k]; i++) pool.push(k)
  })
  const shuffled = shuffleFromSeed(pool, seed)
  return shuffled.map((k, index) => ({ index, kind: k }))
}

/* ------------------------------------------------------------------
 * Rule templates
 *
 * Each factory returns a predicate + text — the generator picks variants,
 * evaluates predicate(board) and only surfaces variants whose predicate
 * holds. So integrity is guaranteed constructively.
 * ------------------------------------------------------------------ */

function pickBombIdx(placements: Placed[]): number {
  return placements.find((p) => p.kind === 'BOMB')!.index
}

function indexesOf(kind: CardKind, placements: Placed[]): number[] {
  return placements.filter((p) => p.kind === kind).map((p) => p.index)
}

/* Instead of parametric factories with dynamic text, define concrete
 * rule candidates as (text, predicate) pairs and evaluate them against
 * the current board. Only truthful rules pass through.
 */

function candidatesForBoard(placements: Placed[]): Array<{ id: string; text: string; predicate: boolean }> {
  const bomb = pickBombIdx(placements)
  const allCells = indexesOf('ALL', placements)
  const meCells = indexesOf('ME', placements)
  const safeCells = indexesOf('SAFE', placements)

  const nbrOrtho = neighborsOrthogonal(bomb)
  const nbrDiag = neighborsDiagonal(bomb)

  const rowNames = ['상단 행', '중단 행', '하단 행']
  const colNames = ['왼쪽 열', '중앙 열', '오른쪽 열']

  const list: Array<{ id: string; text: string; predicate: boolean }> = []

  // Row / column
  for (let r = 0; r < 3; r++) {
    list.push({
      id: `bomb-row-${r}`,
      text: `폭탄은 ${rowNames[r]}에 있어요.`,
      predicate: rowOf(bomb) === r,
    })
    list.push({
      id: `bomb-not-row-${r}`,
      text: `폭탄은 ${rowNames[r]}에 없어요.`,
      predicate: rowOf(bomb) !== r,
    })
  }
  for (let c = 0; c < 3; c++) {
    list.push({
      id: `bomb-col-${c}`,
      text: `폭탄은 ${colNames[c]}에 있어요.`,
      predicate: colOf(bomb) === c,
    })
    list.push({
      id: `bomb-not-col-${c}`,
      text: `폭탄은 ${colNames[c]}에 없어요.`,
      predicate: colOf(bomb) !== c,
    })
  }

  // Structural position
  list.push({ id: 'bomb-corner', text: '폭탄은 모서리 칸이에요.', predicate: CORNERS.has(bomb) })
  list.push({ id: 'bomb-not-corner', text: '폭탄은 모서리 칸이 아니에요.', predicate: !CORNERS.has(bomb) })
  list.push({ id: 'bomb-center', text: '폭탄은 중앙 칸이에요.', predicate: bomb === CENTER })
  list.push({ id: 'bomb-not-center', text: '폭탄은 중앙 칸이 아니에요.', predicate: bomb !== CENTER })
  list.push({ id: 'bomb-edge', text: '폭탄은 가장자리 (모서리 아닌 바깥) 칸이에요.', predicate: EDGES.has(bomb) })

  // Diagonal
  list.push({ id: 'bomb-diag-a', text: '폭탄은 대각선(↘)에 있어요.', predicate: DIAGONAL_A.has(bomb) })
  list.push({ id: 'bomb-diag-b', text: '폭탄은 대각선(↙)에 있어요.', predicate: DIAGONAL_B.has(bomb) })
  list.push({ id: 'bomb-no-diag', text: '폭탄은 대각선에 없어요.', predicate: !DIAGONAL_A.has(bomb) && !DIAGONAL_B.has(bomb) })

  // Parity of index
  list.push({ id: 'bomb-even-idx', text: '폭탄 번호(0-8)는 짝수예요.', predicate: bomb % 2 === 0 })
  list.push({ id: 'bomb-odd-idx', text: '폭탄 번호(0-8)는 홀수예요.', predicate: bomb % 2 === 1 })

  // Adjacency (orthogonal) to specific kinds
  const anyOrthoIn = (set: number[]) => nbrOrtho.some((n) => set.includes(n))
  const allOrthoNotIn = (set: number[]) => nbrOrtho.every((n) => !set.includes(n))
  list.push({ id: 'bomb-adj-safe', text: '폭탄은 SAFE 카드와 인접(상하좌우)해 있어요.', predicate: anyOrthoIn(safeCells) })
  list.push({ id: 'bomb-not-adj-safe', text: '폭탄은 SAFE 카드와 인접해 있지 않아요.', predicate: allOrthoNotIn(safeCells) })
  list.push({ id: 'bomb-adj-all', text: '폭탄과 인접한 칸에 전체규칙 카드가 있어요.', predicate: anyOrthoIn(allCells) })
  list.push({ id: 'bomb-not-adj-all', text: '폭탄과 인접한 칸에 전체규칙 카드가 없어요.', predicate: allOrthoNotIn(allCells) })
  list.push({ id: 'bomb-adj-me', text: '폭탄과 인접한 칸에 개인규칙 카드가 있어요.', predicate: anyOrthoIn(meCells) })
  list.push({ id: 'bomb-not-adj-me', text: '폭탄과 인접한 칸에 개인규칙 카드가 없어요.', predicate: allOrthoNotIn(meCells) })

  // Diagonal adjacency
  const anyDiagIn = (set: number[]) => nbrDiag.some((n) => set.includes(n))
  list.push({ id: 'bomb-diag-adj-safe', text: '폭탄의 대각선 인접에 SAFE가 있어요.', predicate: anyDiagIn(safeCells) })
  list.push({ id: 'bomb-diag-adj-all', text: '폭탄의 대각선 인접에 전체규칙 카드가 있어요.', predicate: anyDiagIn(allCells) })

  // Row / column occupancy counts
  const inRowKind = (r: number, kind: CardKind) => placements.filter((p) => rowOf(p.index) === r && p.kind === kind)
  const inColKind = (c: number, kind: CardKind) => placements.filter((p) => colOf(p.index) === c && p.kind === kind)
  const bombRow = rowOf(bomb)
  const bombCol = colOf(bomb)
  list.push({ id: 'row-has-safe', text: '폭탄이 있는 행에 SAFE 카드가 있어요.', predicate: inRowKind(bombRow, 'SAFE').length > 0 })
  list.push({ id: 'row-has-all', text: '폭탄이 있는 행에 전체규칙 카드가 있어요.', predicate: inRowKind(bombRow, 'ALL').length > 0 })
  list.push({ id: 'col-has-me', text: '폭탄이 있는 열에 개인규칙 카드가 있어요.', predicate: inColKind(bombCol, 'ME').length > 0 })
  list.push({ id: 'col-has-safe', text: '폭탄이 있는 열에 SAFE 카드가 있어요.', predicate: inColKind(bombCol, 'SAFE').length > 0 })

  return list
}

/**
 * Deterministic rule assignment for the current board:
 *   - up to 3 unique ALL facts
 *   - up to 3 unique ME facts (one per ME card slot; owner filled at reveal
 *     time on the client)
 * All facts have predicate === true against the board.
 */
export function generateRuleFacts(placements: Placed[], seed: number): { all: RuleFact[]; me: RuleFact[] } {
  const truthful = candidatesForBoard(placements).filter((c) => c.predicate)
  // Deterministic shuffle so both peers pick the same subset from the seed.
  const shuffled = shuffleFromSeed(truthful, seed ^ 0x9e3779b9)
  const picked: typeof truthful = []
  const usedIds = new Set<string>()
  for (const cand of shuffled) {
    if (usedIds.has(cand.id)) continue
    picked.push(cand)
    usedIds.add(cand.id)
    if (picked.length >= CARD_COMPOSITION.ALL + CARD_COMPOSITION.ME) break
  }
  // Split first N as ALL, next M as ME
  const all: RuleFact[] = picked.slice(0, CARD_COMPOSITION.ALL).map((c) => ({
    ruleId: c.id, text: c.text, scope: 'ALL',
  }))
  const me: RuleFact[] = picked.slice(CARD_COMPOSITION.ALL, CARD_COMPOSITION.ALL + CARD_COMPOSITION.ME).map((c) => ({
    ruleId: c.id, text: c.text, scope: 'ME',
  }))
  return { all, me }
}

/**
 * Given a placements array + a specific card index, return the rule fact
 * mapped to that card. Falls back to a generic "safe" reveal text for
 * SAFE / BOMB cells.
 */
export function factForIndex(index: number, placements: Placed[], facts: { all: RuleFact[]; me: RuleFact[] }): RuleFact | null {
  const kind = placements.find((p) => p.index === index)?.kind
  if (!kind) return null
  if (kind === 'ALL') {
    // Assign ALL slots in board order
    const allIdxs = placements.filter((p) => p.kind === 'ALL').map((p) => p.index)
    const pos = allIdxs.indexOf(index)
    return facts.all[pos] ?? null
  }
  if (kind === 'ME') {
    const meIdxs = placements.filter((p) => p.kind === 'ME').map((p) => p.index)
    const pos = meIdxs.indexOf(index)
    return facts.me[pos] ?? null
  }
  return null
}

/* Kept exports mirror the previous file's shape so the Mosun component
 * migrates with minimal churn — BOARD_SIZE constant re-exported for clarity. */
export { BOARD_SIZE }
