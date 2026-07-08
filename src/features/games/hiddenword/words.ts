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
  /** Group id chosen as the "similar group" for identities. */
  themeGroupId: string;
  /** Board indexes that belong to the similar group. */
  themeIndexes: number[];
  /** Index of host's identity. */
  hostIdx: number;
  /** Index of guest's identity. */
  guestIdx: number;
  side: number;
}

export function generateBoard(seed: number, side: 4 | 5): HiddenBoard {
  const rng = mulberry32(seed)
  const cellCount = side * side
  // Pick the 유사군 group (must have at least 4 words so we can pick
  // 2 identities + 2-3 decoys from same theme).
  const eligible = WORD_GROUPS.filter((g) => g.words.length >= 4)
  const themeGroup = eligible[Math.floor(rng() * eligible.length)]
  // How many cells to draw from the theme group.
  const themeCount = Math.min(themeGroup.words.length, Math.max(4, Math.floor(cellCount / 2)))
  const themeWords = shuffle(themeGroup.words.slice(), rng).slice(0, themeCount)
  // Fill the rest from other groups (mixed, no repeats).
  const otherPool = shuffle(
    WORD_GROUPS.filter((g) => g.id !== themeGroup.id).flatMap((g) => g.words),
    rng,
  )
  const fillerCount = cellCount - themeWords.length
  const fillers = otherPool.slice(0, fillerCount)
  // Combine + shuffle so theme cells are scattered around the board.
  const all = shuffle([...themeWords, ...fillers], rng)
  // Track which board positions ended up as theme cells.
  const themeSet = new Set(themeWords)
  const themeIndexes: number[] = []
  all.forEach((w, i) => { if (themeSet.has(w)) themeIndexes.push(i) })
  // Assign identities — both drawn from the theme cells (spec:
  // 각자의 배정 카드는 유사군 안에서). Distinct indexes.
  const shuffledThemeIdx = shuffle(themeIndexes.slice(), rng)
  const hostIdx = shuffledThemeIdx[0]
  const guestIdx = shuffledThemeIdx[1]
  return {
    words: all,
    themeGroupId: themeGroup.id,
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
