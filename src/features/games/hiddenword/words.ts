/**
 * 냥말 블러핑 word bank.
 * Words are grouped by shared meaning ("유사군") — the spec's core
 * mechanic is that half the board is thematically close so a single
 * clue can't uniquely identify a card. Both identities are drawn from
 * ONE selected 유사군; the rest of the board is filler from other
 * groups so the shared context reads as "there's a theme here, but
 * lots of near-neighbours".
 */

export interface WordGroup {
  id: string;
  theme: string;
  words: string[];
}

export const WORD_GROUPS: WordGroup[] = [
  { id: 'fish',   theme: '물고기',   words: ['참치', '연어', '고등어', '갈치', '조기', '광어'] },
  { id: 'veggie', theme: '채소',     words: ['배추', '시금치', '상추', '오이', '무', '당근'] },
  { id: 'fruit',  theme: '과일',     words: ['사과', '배', '감', '딸기', '포도', '수박'] },
  { id: 'bug',    theme: '곤충',     words: ['나비', '벌', '개미', '잠자리', '무당벌레'] },
  { id: 'bird',   theme: '새',       words: ['참새', '비둘기', '까치', '매', '독수리'] },
  { id: 'tool',   theme: '도구',     words: ['망치', '톱', '드라이버', '렌치', '니퍼'] },
  { id: 'inst',   theme: '악기',     words: ['기타', '피아노', '드럼', '바이올린', '트럼펫'] },
  { id: 'color',  theme: '색',       words: ['빨강', '파랑', '노랑', '초록', '보라'] },
  { id: 'weather',theme: '날씨',     words: ['맑음', '비', '눈', '안개', '바람'] },
  { id: 'body',   theme: '신체',     words: ['눈', '코', '입', '귀', '발'] },
]

/** Deterministic PRNG (mulberry32) — same seed → same board on both peers. */
function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface HiddenBoard {
  /** N×N word grid. Length = side*side. */
  words: string[];
  /** Group ids used to seed the two identities. Kept separate so the
   * UI can surface a hint like "host: 물고기 / guest: 채소" if it
   * ever needs to (currently the theme group is not shown mid-round). */
  hostGroupId: string;
  guestGroupId: string;
  /** Board indexes seeded from either theme group (identity candidates).
   * Both identities are guaranteed to be inside this set. */
  themeIndexes: number[];
  /** Index of host's identity. */
  hostIdx: number;
  /** Index of guest's identity. */
  guestIdx: number;
  side: number;
}

/**
 * Board generation strategy — updated per user feedback:
 *   "둘 다 같은 유사군 내에서 생기면 의미가 없어."
 * Each identity is now drawn from a DIFFERENT 유사군. Both groups
 * seed the board with decoys, plus a random filler layer, so:
 *   · Two identities sit in unrelated themes → a clue like "물고기"
 *     doesn't obviously narrow the opponent's card.
 *   · Board still carries theme-adjacent decoys from BOTH groups so
 *     single clues can't uniquely identify the identity.
 *   · Filler bump from other groups keeps the pool wide.
 */
export function generateBoard(seed: number, side: 4 | 5): HiddenBoard {
  const rng = mulberry32(seed)
  const cellCount = side * side
  // Only consider groups with a reasonable pool so decoys carry weight.
  // Groups with 6+ words let us draw more theme-adjacent tiles per side
  // — user reported the board had too many meaningless filler cards.
  const eligible = WORD_GROUPS.filter((g) => g.words.length >= 6)
  // Pick TWO distinct theme groups — one per identity.
  const shuffledGroups = shuffle(eligible.slice(), rng)
  const hostGroup = shuffledGroups[0]
  const guestGroup = shuffledGroups[1]
  // Board target: ~75 % theme content, split evenly between the two
  // groups. 4×4 → 6 per group (12 theme + 4 filler). 5×5 → 9 per group
  // (18 theme + 7 filler). Previous ~50% mix left too much unrelated
  // vocabulary that gave clue writers nothing to hook onto.
  const perGroupCount = Math.max(6, Math.floor(cellCount * 0.375))
  const hostGroupWords  = shuffle(hostGroup.words.slice(),  rng).slice(0, Math.min(hostGroup.words.length,  perGroupCount))
  const guestGroupWords = shuffle(guestGroup.words.slice(), rng).slice(0, Math.min(guestGroup.words.length, perGroupCount))
  const themePool = [...hostGroupWords, ...guestGroupWords]
  // Filler from the OTHER groups (no repeats with themePool).
  const themeSetLocal = new Set(themePool)
  const otherPool = shuffle(
    WORD_GROUPS
      .filter((g) => g.id !== hostGroup.id && g.id !== guestGroup.id)
      .flatMap((g) => g.words)
      .filter((w) => !themeSetLocal.has(w)),
    rng,
  )
  const fillerCount = cellCount - themePool.length
  const fillers = otherPool.slice(0, fillerCount)
  const all = shuffle([...themePool, ...fillers], rng)
  // Which positions carry theme words (identity candidates).
  const themeIndexes: number[] = []
  all.forEach((w, i) => { if (themeSetLocal.has(w)) themeIndexes.push(i) })
  // Host identity → pick from hostGroupWords positions.
  const hostGroupSet = new Set(hostGroupWords)
  const guestGroupSet = new Set(guestGroupWords)
  const hostCandidates: number[] = []
  const guestCandidates: number[] = []
  all.forEach((w, i) => {
    if (hostGroupSet.has(w))  hostCandidates.push(i)
    if (guestGroupSet.has(w)) guestCandidates.push(i)
  })
  const hostIdx  = shuffle(hostCandidates,  rng)[0]
  const guestIdx = shuffle(guestCandidates, rng)[0]
  return {
    words: all,
    hostGroupId: hostGroup.id,
    guestGroupId: guestGroup.id,
    themeIndexes,
    hostIdx,
    guestIdx,
    side,
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
