/*
 * Breaker rule generator — template + slot system.
 *
 * Same design ethos as the Mosun overhaul:
 *   - Rules are composed from typed templates with slots. No hand-baked
 *     sentence list, no static array.
 *   - Every emitted rule ships:
 *       label     player-facing text with slots filled in,
 *       check(prev, cur)  pure predicate → 'O' | 'X',
 *       tier      difficulty (T1 easy, T2 mid, T3 hard),
 *       family    'solo' | 'transition' | 'pair' | 'meta'.
 *   - Master rule is chosen at match-start via a seed hash that picks
 *     one tier bucket, then samples inside it. Both peers derive the
 *     same rule from the same seed → no network echo needed.
 *
 * Templates:
 *   T1 SOLO         "{C1} 색이면 O, 그 외 X"
 *   T1 TRANSITION   "이전과 같은 색이면 O, 다르면 X" · 반대
 *   T2 SOLO 2-color "{C1}·{C2} 중 하나면 O, 그 외 X"
 *   T2 PREV         "이전이 {C1}이면 O, 아니면 X"
 *                   "이전이 {C1}·{C2} 중 하나면 O, 아니면 X"
 *   T3 PAIR         "이전 {C1} → 현재 {C2}면 O, 그 외 X"
 *   T3 META         이전·현재 색 인덱스 합 짝수 O · 순환 (R→G→B→Y→R)
 */

export const COLORS = ['R', 'G', 'B', 'Y'] as const
export type ColorKey = (typeof COLORS)[number]
const COLOR_ORDER: Record<ColorKey, number> = { R: 0, G: 1, B: 2, Y: 3 }

export type RuleTier = 1 | 2 | 3
export type RuleFamily = 'solo' | 'transition' | 'pair' | 'meta'

export interface MasterRule {
  id: string;
  label: string;
  tier: RuleTier;
  family: RuleFamily;
  check: (prev: ColorKey | null, cur: ColorKey) => 'O' | 'X';
}

function combos2<T>(arr: readonly T[]): Array<[T, T]> {
  const out: Array<[T, T]> = []
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) out.push([arr[i], arr[j]])
  }
  return out
}

function enumerateSoloSingle(): MasterRule[] {
  return COLORS.map((c) => ({
    id: `solo-${c}`,
    label: `${c} 색이면 O, 그 외 X`,
    tier: 1 as RuleTier,
    family: 'solo' as RuleFamily,
    check: (_p: ColorKey | null, cur: ColorKey) => (cur === c ? 'O' : 'X') as 'O' | 'X',
  }))
}

function enumerateTransition(): MasterRule[] {
  return [
    {
      id: 'trans-same',
      label: '이전과 같은 색이면 O, 다르면 X',
      tier: 1,
      family: 'transition',
      check: (prev, cur) => (prev === cur ? 'O' : 'X'),
    },
    {
      id: 'trans-diff',
      label: '이전과 다른 색이면 O, 같으면 X',
      tier: 1,
      family: 'transition',
      check: (prev, cur) => (prev !== null && prev !== cur ? 'O' : 'X'),
    },
  ]
}

function enumerateSoloDouble(): MasterRule[] {
  return combos2(COLORS).map(([a, b]) => {
    const s = new Set<ColorKey>([a, b])
    return {
      id: `solo2-${a}${b}`,
      label: `${a}·${b} 중 하나면 O, 그 외 X`,
      tier: 2 as RuleTier,
      family: 'solo' as RuleFamily,
      check: (_p: ColorKey | null, cur: ColorKey) => (s.has(cur) ? 'O' : 'X') as 'O' | 'X',
    }
  })
}

function enumeratePrevSingle(): MasterRule[] {
  return COLORS.map((c) => ({
    id: `prev-${c}`,
    label: `이전이 ${c}면 O, 아니면 X`,
    tier: 2 as RuleTier,
    family: 'transition' as RuleFamily,
    check: (prev: ColorKey | null) => (prev === c ? 'O' : 'X') as 'O' | 'X',
  }))
}

function enumeratePrevDouble(): MasterRule[] {
  return combos2(COLORS).map(([a, b]) => {
    const s = new Set<ColorKey>([a, b])
    return {
      id: `prev2-${a}${b}`,
      label: `이전이 ${a}·${b} 중 하나면 O, 아니면 X`,
      tier: 2 as RuleTier,
      family: 'transition' as RuleFamily,
      check: (prev: ColorKey | null) => (prev !== null && s.has(prev) ? 'O' : 'X') as 'O' | 'X',
    }
  })
}

function enumeratePair(): MasterRule[] {
  const out: MasterRule[] = []
  for (const a of COLORS) {
    for (const b of COLORS) {
      if (a === b) continue    // same-colour case already covered by transition
      out.push({
        id: `pair-${a}-${b}`,
        label: `이전 ${a} → 현재 ${b}면 O, 그 외 X`,
        tier: 3,
        family: 'pair',
        check: (prev, cur) => (prev === a && cur === b ? 'O' : 'X'),
      })
    }
  }
  return out
}

function enumerateMeta(): MasterRule[] {
  return [
    {
      id: 'meta-sum-even',
      label: '이전·현재 색상 인덱스 합이 짝수면 O (R=0·G=1·B=2·Y=3)',
      tier: 3,
      family: 'meta',
      check: (prev, cur) => {
        if (prev === null) return 'X'
        return ((COLOR_ORDER[prev] + COLOR_ORDER[cur]) % 2 === 0) ? 'O' : 'X'
      },
    },
    {
      id: 'meta-cycle',
      label: '이전 다음 순환 색이 현재면 O (R→G→B→Y→R)',
      tier: 3,
      family: 'meta',
      check: (prev, cur) => {
        if (prev === null) return 'X'
        const next = COLORS[(COLOR_ORDER[prev] + 1) % COLORS.length]
        return next === cur ? 'O' : 'X'
      },
    },
    {
      id: 'meta-cycle-back',
      label: '현재의 다음 순환 색이 이전이면 O (역방향)',
      tier: 3,
      family: 'meta',
      check: (prev, cur) => {
        if (prev === null) return 'X'
        const next = COLORS[(COLOR_ORDER[cur] + 1) % COLORS.length]
        return next === prev ? 'O' : 'X'
      },
    },
  ]
}

export const RULE_BANK: readonly MasterRule[] = [
  ...enumerateSoloSingle(),
  ...enumerateTransition(),
  ...enumerateSoloDouble(),
  ...enumeratePrevSingle(),
  ...enumeratePrevDouble(),
  ...enumeratePair(),
  ...enumerateMeta(),
] as const

function seededRandom(seed: number): number {
  let a = seed | 0
  a = (a + 0x6d2b79f5) | 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function tierFromSeed(seed: number): RuleTier {
  const r = seededRandom(seed ^ 0xa1b2c3d4)
  if (r < 0.4) return 1
  if (r < 0.8) return 2
  return 3
}

/**
 * Pick a rule matching a specific tier bucket. Falls back to the full
 * bank if the requested tier ends up empty (defensive).
 */
export function pickRuleIndex(seed: number, tier?: RuleTier): number {
  const target = tier ?? tierFromSeed(seed)
  const eligible = RULE_BANK
    .map((r, i) => ({ i, tier: r.tier }))
    .filter((r) => r.tier === target)
  const pool = eligible.length > 0 ? eligible : RULE_BANK.map((_, i) => ({ i, tier: RULE_BANK[i].tier }))
  const pick = Math.floor(seededRandom(seed) * pool.length)
  return pool[pick].i
}

export function ruleById(id: string): MasterRule | undefined {
  return RULE_BANK.find((r) => r.id === id)
}
