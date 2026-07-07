/*
 * Master-rule catalogue for 컬러 브레이커.
 *
 * Each rule is a pure predicate ColorKey (previous, current) → 'O' | 'X'.
 * Integrity is guaranteed by construction — the game simply feeds the
 * two most recent taps through the predicate; no fuzzy generation.
 *
 * Families:
 *   - solo        : depends on current color only
 *   - pair        : depends on (previous, current)
 *   - membership  : "color ∈ set" (RGBY subsets)
 *   - transition  : same/different from previous
 */

export const COLORS = ['R', 'G', 'B', 'Y'] as const
export type ColorKey = (typeof COLORS)[number]

export interface MasterRule {
  id: string;
  label: string;                                     // player-facing text
  check: (prev: ColorKey | null, cur: ColorKey) => 'O' | 'X';
}

const COMBOS_2: Array<ColorKey[]> = [
  ['R', 'G'], ['R', 'B'], ['R', 'Y'],
  ['G', 'B'], ['G', 'Y'], ['B', 'Y'],
]

/** Solo: "cur ∈ S" → O else X. */
function membershipRule(set: ColorKey[]): MasterRule {
  const s = new Set(set)
  const label = `${set.join('·')}이면 O, 그 외 X`
  const id = `mem-${set.join('')}`
  return { id, label, check: (_p, cur) => (s.has(cur) ? 'O' : 'X') }
}

/** Pair: "prev === X" → O else X. */
function prevExactRule(x: ColorKey): MasterRule {
  return {
    id: `prev-${x}`,
    label: `이전이 ${x}면 O, 아니면 X`,
    check: (prev) => (prev === x ? 'O' : 'X'),
  }
}

/** Transition rules. */
const SAME_AS_PREV: MasterRule = {
  id: 'same',
  label: '이전과 같은 색이면 O, 다르면 X',
  check: (prev, cur) => (prev === cur ? 'O' : 'X'),
}
const DIFF_FROM_PREV: MasterRule = {
  id: 'diff',
  label: '이전과 다른 색이면 O, 같으면 X',
  check: (prev, cur) => (prev !== null && prev !== cur ? 'O' : 'X'),
}

/** Pair-combo rules: "prev ∈ P and cur ∈ Q" style. */
function pairComboRule(p: ColorKey, q: ColorKey): MasterRule {
  return {
    id: `pair-${p}-${q}`,
    label: `이전 ${p} → 현재 ${q}면 O, 그 외 X`,
    check: (prev, cur) => (prev === p && cur === q ? 'O' : 'X'),
  }
}

export const RULE_BANK: readonly MasterRule[] = [
  // Solo membership
  ...COLORS.map((c) => membershipRule([c])),
  ...COMBOS_2.map((pair) => membershipRule(pair)),
  membershipRule(['R', 'G', 'B']),
  membershipRule(['R', 'B', 'Y']),
  membershipRule(['G', 'B', 'Y']),

  // Prev-exact
  ...COLORS.map((c) => prevExactRule(c)),

  // Transition
  SAME_AS_PREV,
  DIFF_FROM_PREV,

  // Pair combos (curated — not all 16 to keep the catalogue readable)
  pairComboRule('R', 'G'),
  pairComboRule('G', 'B'),
  pairComboRule('B', 'R'),
  pairComboRule('Y', 'R'),
] as const

/**
 * Pick a rule from the bank using a seeded PRNG.
 * Both peers derive the same index from the same broadcast seed.
 */
export function pickRuleIndex(seed: number): number {
  let a = seed | 0
  a = (a + 0x6d2b79f5) | 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return Math.floor(r * RULE_BANK.length)
}
