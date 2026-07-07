/*
 * Rule generator for 코드네임 · 모순 (solvability-aware).
 *
 * A rule is a constraint on where the bomb can be. We model each rule as:
 *   predicate(candidateBombIdx) => boolean
 *
 * so we can invert it into `possibleBombs` = { i in 0..8 | predicate(i) }.
 * Given the actual placement, we then combine rules by set intersection.
 *
 * Selection targets game-design goals, not just uniform sampling:
 *
 *   - Public rules (3 of them) narrow the bomb to a small pool without
 *     uniquely solving it. Target: 3-5 remaining cells after all 3 public
 *     rules combined.
 *
 *   - Private rules (3 of them, owner-only) each add a bit more info on
 *     top. Target: each ME rule reduces the current owner's candidate
 *     set by at least 1, ending at 1-2 candidates so the owner has real
 *     leverage but is not always certain.
 *
 * If a target can't be hit (e.g. board is too skewed), we relax
 * gracefully instead of throwing — worst case game still plays with
 * looser info.
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
  possibleBombs: number[];  // exposed for the client if it wants to render inference hints
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
 * Rule catalogue as predicates on "candidate bomb index".
 * Each rule is fed a placements array so it can look up other cards.
 * ------------------------------------------------------------------ */

interface RuleCandidate {
  id: string;
  text: string;
  predicate: (candidateBomb: number, placements: Placed[]) => boolean;
}

function indexesOf(kind: CardKind, placements: Placed[]): number[] {
  return placements.filter((p) => p.kind === kind).map((p) => p.index)
}

const RULE_CATALOGUE: RuleCandidate[] = [
  ...[0, 1, 2].flatMap((r) => [
    { id: `bomb-row-${r}`, text: `폭탄은 ${['상단', '중단', '하단'][r]} 행에 있어요.`, predicate: (b: number) => rowOf(b) === r },
    { id: `bomb-not-row-${r}`, text: `폭탄은 ${['상단', '중단', '하단'][r]} 행에 없어요.`, predicate: (b: number) => rowOf(b) !== r },
  ]),
  ...[0, 1, 2].flatMap((c) => [
    { id: `bomb-col-${c}`, text: `폭탄은 ${['왼쪽', '중앙', '오른쪽'][c]} 열에 있어요.`, predicate: (b: number) => colOf(b) === c },
    { id: `bomb-not-col-${c}`, text: `폭탄은 ${['왼쪽', '중앙', '오른쪽'][c]} 열에 없어요.`, predicate: (b: number) => colOf(b) !== c },
  ]),
  { id: 'bomb-corner', text: '폭탄은 모서리 칸이에요.', predicate: (b) => CORNERS.has(b) },
  { id: 'bomb-not-corner', text: '폭탄은 모서리 칸이 아니에요.', predicate: (b) => !CORNERS.has(b) },
  { id: 'bomb-center', text: '폭탄은 중앙 칸이에요.', predicate: (b) => b === CENTER },
  { id: 'bomb-not-center', text: '폭탄은 중앙 칸이 아니에요.', predicate: (b) => b !== CENTER },
  { id: 'bomb-edge', text: '폭탄은 가장자리 칸이에요.', predicate: (b) => EDGES.has(b) },
  { id: 'bomb-not-edge', text: '폭탄은 가장자리 칸이 아니에요.', predicate: (b) => !EDGES.has(b) },
  { id: 'bomb-diag-a', text: '폭탄은 대각선 (↘) 위에 있어요.', predicate: (b) => DIAGONAL_A.has(b) },
  { id: 'bomb-diag-b', text: '폭탄은 대각선 (↙) 위에 있어요.', predicate: (b) => DIAGONAL_B.has(b) },
  { id: 'bomb-no-diag', text: '폭탄은 어느 대각선에도 없어요.', predicate: (b) => !DIAGONAL_A.has(b) && !DIAGONAL_B.has(b) },
  { id: 'bomb-even-idx', text: '폭탄 번호(0~8)는 짝수예요.', predicate: (b) => b % 2 === 0 },
  { id: 'bomb-odd-idx', text: '폭탄 번호(0~8)는 홀수예요.', predicate: (b) => b % 2 === 1 },
  { id: 'bomb-adj-safe', text: '폭탄은 SAFE 카드와 상하좌우로 붙어 있어요.', predicate: (b, pl) => neighborsOrthogonal(b).some((n) => indexesOf('SAFE', pl).includes(n)) },
  { id: 'bomb-not-adj-safe', text: '폭탄은 SAFE 카드와 상하좌우로 붙어 있지 않아요.', predicate: (b, pl) => !neighborsOrthogonal(b).some((n) => indexesOf('SAFE', pl).includes(n)) },
  { id: 'bomb-adj-all', text: '폭탄과 인접한 칸에 전체규칙 카드가 있어요.', predicate: (b, pl) => neighborsOrthogonal(b).some((n) => indexesOf('ALL', pl).includes(n)) },
  { id: 'bomb-not-adj-all', text: '폭탄과 인접한 칸에 전체규칙 카드가 없어요.', predicate: (b, pl) => !neighborsOrthogonal(b).some((n) => indexesOf('ALL', pl).includes(n)) },
  { id: 'bomb-adj-me', text: '폭탄과 인접한 칸에 개인규칙 카드가 있어요.', predicate: (b, pl) => neighborsOrthogonal(b).some((n) => indexesOf('ME', pl).includes(n)) },
  { id: 'bomb-not-adj-me', text: '폭탄과 인접한 칸에 개인규칙 카드가 없어요.', predicate: (b, pl) => !neighborsOrthogonal(b).some((n) => indexesOf('ME', pl).includes(n)) },
  { id: 'bomb-diag-adj-safe', text: '폭탄의 대각선 이웃에 SAFE 카드가 있어요.', predicate: (b, pl) => neighborsDiagonal(b).some((n) => indexesOf('SAFE', pl).includes(n)) },
  { id: 'bomb-diag-adj-me', text: '폭탄의 대각선 이웃에 개인규칙 카드가 있어요.', predicate: (b, pl) => neighborsDiagonal(b).some((n) => indexesOf('ME', pl).includes(n)) },
  { id: 'row-has-safe', text: '폭탄이 있는 행에 SAFE 카드가 있어요.', predicate: (b, pl) => indexesOf('SAFE', pl).some((s) => rowOf(s) === rowOf(b)) },
  { id: 'row-has-all', text: '폭탄이 있는 행에 전체규칙 카드가 있어요.', predicate: (b, pl) => indexesOf('ALL', pl).some((s) => rowOf(s) === rowOf(b)) },
  { id: 'col-has-me', text: '폭탄이 있는 열에 개인규칙 카드가 있어요.', predicate: (b, pl) => indexesOf('ME', pl).some((s) => colOf(s) === colOf(b)) },
  { id: 'col-has-safe', text: '폭탄이 있는 열에 SAFE 카드가 있어요.', predicate: (b, pl) => indexesOf('SAFE', pl).some((s) => colOf(s) === colOf(b)) },
]

interface EvaluatedRule {
  id: string;
  text: string;
  possibleBombs: Set<number>;  // cells i for which predicate(i, placements) === true
}

function evaluateAll(placements: Placed[]): EvaluatedRule[] {
  return RULE_CATALOGUE.map((rc) => {
    const pb = new Set<number>()
    for (const i of ALL_CELLS) if (rc.predicate(i, placements)) pb.add(i)
    return { id: rc.id, text: rc.text, possibleBombs: pb }
  })
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  const out = new Set<number>()
  a.forEach((v) => { if (b.has(v)) out.add(v) })
  return out
}

/* ------------------------------------------------------------------
 * Selection: solvability targets
 *
 *   ALL phase: pick 3 rules such that their intersection contains the
 *   actual bomb AND has size in [TARGET_ALL_MIN, TARGET_ALL_MAX].
 *   ME  phase: pick 3 rules such that intersection with prior state
 *   further reduces the candidate set (each rule must strictly reduce)
 *   ending near TARGET_ME_MIN.
 *
 * We do a small deterministic greedy search over the seeded ordering
 * and fall back to loosest match if the target is impossible.
 * ------------------------------------------------------------------ */

const TARGET_ALL_MIN = 3
const TARGET_ALL_MAX = 5
const TARGET_ME_MIN = 1
const TARGET_ME_MAX = 3

/** Distance to target range: 0 if inside, else linear penalty. */
function distanceTo(size: number, min: number, max: number): number {
  if (size < min) return (min - size) * 3
  if (size > max) return size - max
  return 0
}

function scorePick(candidate: Set<number>, resultingIntersection: Set<number>, min: number, max: number): number {
  // Penalise oversized (uninformative) more than undersized.
  const pen = distanceTo(resultingIntersection.size, min, max)
  // Prefer rules that materially shrink the candidate set.
  const reduction = candidate.size - resultingIntersection.size
  return pen - Math.max(0, reduction) * 0.15
}

interface SelectionResult { all: RuleFact[]; me: RuleFact[]; }

export function generateRuleFacts(placements: Placed[], seed: number): SelectionResult {
  const bomb = placements.find((p) => p.kind === 'BOMB')!.index
  const evaluated = evaluateAll(placements)

  // Only keep rules that are true for the actual bomb — otherwise the game
  // would surface a false statement.
  const truthful = evaluated.filter((r) => r.possibleBombs.has(bomb))

  // Deterministic candidate order — both peers derive identical output.
  const ordered = shuffleFromSeed(truthful, seed ^ 0x9e3779b9)

  // ---- Phase 1: ALL rules (public info) --------------------------------
  const allPicked: EvaluatedRule[] = []
  let allIntersection = new Set(ALL_CELLS)
  while (allPicked.length < CARD_COMPOSITION.ALL) {
    let bestIdx = -1
    let bestScore = Infinity
    for (let i = 0; i < ordered.length; i++) {
      const cand = ordered[i]
      if (allPicked.some((p) => p.id === cand.id)) continue
      const nextInter = intersect(allIntersection, cand.possibleBombs)
      if (!nextInter.has(bomb)) continue  // must never rule out the actual bomb
      const score = scorePick(allIntersection, nextInter, TARGET_ALL_MIN, TARGET_ALL_MAX)
      if (score < bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    if (bestIdx === -1) {
      // Nothing new available — fill with any remaining truthful rule
      const remaining = ordered.find((c) => !allPicked.some((p) => p.id === c.id))
      if (!remaining) break
      allPicked.push(remaining)
      allIntersection = intersect(allIntersection, remaining.possibleBombs)
      continue
    }
    const chosen = ordered[bestIdx]
    allPicked.push(chosen)
    allIntersection = intersect(allIntersection, chosen.possibleBombs)
  }

  // ---- Phase 2: ME rules (owner-only, strictly reduce) -----------------
  const mePicked: EvaluatedRule[] = []
  let meIntersection = new Set(allIntersection)
  while (mePicked.length < CARD_COMPOSITION.ME) {
    let bestIdx = -1
    let bestScore = Infinity
    for (let i = 0; i < ordered.length; i++) {
      const cand = ordered[i]
      if (allPicked.some((p) => p.id === cand.id)) continue
      if (mePicked.some((p) => p.id === cand.id)) continue
      const nextInter = intersect(meIntersection, cand.possibleBombs)
      if (!nextInter.has(bomb)) continue
      if (meIntersection.size <= TARGET_ME_MIN && nextInter.size === meIntersection.size) continue // no info gained past target
      // Prefer rules that produce a strict reduction; force at least -1 while above target.
      const strictReducer = nextInter.size < meIntersection.size
      const score = scorePick(meIntersection, nextInter, TARGET_ME_MIN, TARGET_ME_MAX)
        + (strictReducer ? -0.5 : 0.5)
      if (score < bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    if (bestIdx === -1) {
      const remaining = ordered.find((c) =>
        !allPicked.some((p) => p.id === c.id) && !mePicked.some((p) => p.id === c.id),
      )
      if (!remaining) break
      mePicked.push(remaining)
      meIntersection = intersect(meIntersection, remaining.possibleBombs)
      continue
    }
    const chosen = ordered[bestIdx]
    mePicked.push(chosen)
    meIntersection = intersect(meIntersection, chosen.possibleBombs)
  }

  const toFact = (er: EvaluatedRule, scope: 'ALL' | 'ME'): RuleFact => ({
    ruleId: er.id, text: er.text, scope, possibleBombs: Array.from(er.possibleBombs).sort((a, b) => a - b),
  })

  return {
    all: allPicked.map((r) => toFact(r, 'ALL')),
    me: mePicked.map((r) => toFact(r, 'ME')),
  }
}

export function factForIndex(index: number, placements: Placed[], facts: SelectionResult): RuleFact | null {
  const kind = placements.find((p) => p.index === index)?.kind
  if (!kind) return null
  if (kind === 'ALL') {
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

export { BOARD_SIZE }
