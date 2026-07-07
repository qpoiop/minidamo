/*
 * Master-rule catalogue for 컬러 브레이커.
 *
 * Each rule = pure predicate (prev, cur) => 'O' | 'X'. Difficulty tier
 * lets the game pick appropriate rules for how long the match should
 * last / how much observation the player is willing to do.
 *
 *   T1 EASY   — solo membership, single color (deducible in ~3 taps)
 *   T2 MEDIUM — 2-color membership or transition rules
 *   T3 HARD   — pair combos (need to remember previous tap)
 */

export const COLORS = ['R', 'G', 'B', 'Y'] as const
export type ColorKey = (typeof COLORS)[number]

export type RuleTier = 1 | 2 | 3

export interface MasterRule {
  id: string;
  label: string;
  tier: RuleTier;
  check: (prev: ColorKey | null, cur: ColorKey) => 'O' | 'X';
}

const COMBOS_2: Array<ColorKey[]> = [
  ['R', 'G'], ['R', 'B'], ['R', 'Y'],
  ['G', 'B'], ['G', 'Y'], ['B', 'Y'],
]

function membershipRule(set: ColorKey[], tier: RuleTier): MasterRule {
  const s = new Set(set)
  const id = `mem-${set.join('')}`
  const label = `${set.join('·')}이면 O, 그 외 X`
  return { id, label, tier, check: (_p, cur) => (s.has(cur) ? 'O' : 'X') }
}

function prevExactRule(x: ColorKey): MasterRule {
  return {
    id: `prev-${x}`,
    label: `이전이 ${x}면 O, 아니면 X`,
    tier: 2,
    check: (prev) => (prev === x ? 'O' : 'X'),
  }
}

const SAME_AS_PREV: MasterRule = {
  id: 'same', label: '이전과 같은 색이면 O, 다르면 X', tier: 2,
  check: (prev, cur) => (prev === cur ? 'O' : 'X'),
}
const DIFF_FROM_PREV: MasterRule = {
  id: 'diff', label: '이전과 다른 색이면 O, 같으면 X', tier: 2,
  check: (prev, cur) => (prev !== null && prev !== cur ? 'O' : 'X'),
}

function pairComboRule(p: ColorKey, q: ColorKey): MasterRule {
  return {
    id: `pair-${p}-${q}`,
    label: `이전 ${p} → 현재 ${q}면 O, 그 외 X`,
    tier: 3,
    check: (prev, cur) => (prev === p && cur === q ? 'O' : 'X'),
  }
}

export const RULE_BANK: readonly MasterRule[] = [
  // Tier 1: solo single color
  ...COLORS.map((c) => membershipRule([c], 1)),

  // Tier 2: solo 2-color + transitions + prev-exact
  ...COMBOS_2.map((pair) => membershipRule(pair, 2)),
  ...COLORS.map((c) => prevExactRule(c)),
  SAME_AS_PREV,
  DIFF_FROM_PREV,

  // Tier 3: pair combos
  pairComboRule('R', 'G'),
  pairComboRule('G', 'B'),
  pairComboRule('B', 'R'),
  pairComboRule('Y', 'R'),
  pairComboRule('R', 'Y'),
  pairComboRule('G', 'R'),
] as const

function seededRandom(seed: number): number {
  let a = seed | 0
  a = (a + 0x6d2b79f5) | 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Choose a rule matching a specific tier. Falls back to a neighbouring
 * tier if the requested tier's bucket is empty (defensive).
 */
export function pickRuleIndex(seed: number, tier?: RuleTier): number {
  const target = tier ?? tierFromSeed(seed)
  const eligible = RULE_BANK
    .map((r, i) => ({ i, tier: r.tier }))
    .filter((r) => r.tier === target)
  const pool = eligible.length > 0 ? eligible : RULE_BANK.map((r, i) => ({ i, tier: r.tier }))
  const pick = Math.floor(seededRandom(seed) * pool.length)
  return pool[pick].i
}

/** Distribute tiers roughly 40 / 40 / 20 so most matches are moderate. */
function tierFromSeed(seed: number): RuleTier {
  const r = seededRandom(seed ^ 0xa1b2c3d4)
  if (r < 0.4) return 1
  if (r < 0.8) return 2
  return 3
}

export function ruleById(id: string): MasterRule | undefined {
  return RULE_BANK.find((r) => r.id === id)
}
