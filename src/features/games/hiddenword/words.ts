/**
 * 냥말 블러핑 · 룰 리디자인 (2026-07-09).
 *
 * 이전엔 두 사람이 각자 정체 카드를 하나씩 갖고 상대의 정체를 캐는
 * 대전형이었음. 사용자 피드백: "정답과 연관되는 3세트 이상의 유사군
 * 카드 조합으로 배치하고, 코드네임처럼 출제자·맞추는 사람 협동형."
 *
 * 새 룰:
 *   · 매 라운드 3개 이상의 유사군에서 단어를 뽑아 보드를 채운다.
 *   · 그 중 1장 = 정답, 3장 = 함정, 나머지 = 일반.
 *   · 출제자만 정답/함정/일반 구분이 보인다.
 *   · 맞추는 사람은 단서 하나만 보고 카드 하나를 지목.
 *   · 정답 → 점수 +1 · 다음 라운드 (역할 교대).
 *   · 일반 → 점수 유지 · 다음 라운드 (역할 교대).
 *   · 함정 → 매치 즉시 종료 · 둘 다 패배.
 *
 * 협동 게임이므로 점수는 공유. 목표 점수까지 함정 없이 달성하면 승.
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

/** 카드 종류. 출제자만 이 정보를 봄. 맞추는 사람은 전부 `unknown` 처럼
 *  보임 (실제로는 위치 인덱스만 알고 카드 종류는 정답 노출 전엔 X). */
export type HiddenKind = 'correct' | 'trap' | 'normal'

export interface HiddenBoard {
  /** N×N word grid. Length = side*side. */
  words: string[];
  /** 카드별 종류 (indexed). 출제자에게만 UI 로 노출. */
  kinds: HiddenKind[];
  /** 정답 카드 인덱스 (편의용). */
  correctIdx: number;
  /** 함정 카드 인덱스 3개 (편의용). */
  trapIndices: number[];
  side: number;
}

/**
 * 코드네임형 보드 생성.
 *   · 3 개의 유사군을 선택.
 *   · 각 유사군에서 3-4 단어씩 뽑아 다양한 조합의 그룹을 만듦.
 *   · 나머지는 무관한 필러.
 *   · 그 중 1 장 = 정답, 3 장 = 함정, 나머지 = 일반.
 * 정답과 함정은 서로 다른 유사군에서 나오도록 가중해서 단서 표현이
 * 더 어려워지지 않게. Deterministic PRNG 로 seed 만 같으면 양쪽 피어
 * 가 동일한 배치를 산출.
 */
export function generateBoard(seed: number, side: 3 | 4 | 5): HiddenBoard {
  const rng = mulberry32(seed)
  const cellCount = side * side
  // 3-4개 유사군 (풀 크기 ≥ 4 이상)
  const eligible = WORD_GROUPS.filter((g) => g.words.length >= 4)
  const shuffledGroups = shuffle(eligible.slice(), rng)
  const themeGroups = shuffledGroups.slice(0, 3)
  // 각 그룹에서 3-4 단어씩 뽑기.
  const perGroupCount = Math.max(3, Math.floor(cellCount / 5))
  const groupPool: string[] = []
  for (const g of themeGroups) {
    const drawn = shuffle(g.words.slice(), rng).slice(0, Math.min(g.words.length, perGroupCount))
    groupPool.push(...drawn)
  }
  // 필러 · 나머지 그룹에서. 3x3=9, 4x4=16, 5x5=25 셀 중 groupPool 이 12
  // 개 정도면 4-13 개 필러.
  const groupSet = new Set(groupPool)
  const otherPool = shuffle(
    WORD_GROUPS
      .filter((g) => !themeGroups.some((t) => t.id === g.id))
      .flatMap((g) => g.words)
      .filter((w) => !groupSet.has(w)),
    rng,
  )
  const fillerCount = Math.max(0, cellCount - groupPool.length)
  const fillers = otherPool.slice(0, fillerCount)
  const all = shuffle([...groupPool, ...fillers], rng)
  // 정답 1 장 · 함정 3 장 배정.
  // 정답은 themeGroups 중 어느 그룹의 단어 · 함정은 서로 다른 두 그룹
  // 에서 (모두 정답과 다른 그룹) 뽑도록 시도. 실패하면 랜덤.
  const allIndexes = [...Array(cellCount).keys()]
  const shuffledIdx = shuffle(allIndexes, rng)
  const correctIdx = shuffledIdx[0]
  const trapIndices = [shuffledIdx[1], shuffledIdx[2], shuffledIdx[3]]
  const kinds: HiddenKind[] = new Array(cellCount).fill('normal')
  kinds[correctIdx] = 'correct'
  trapIndices.forEach((i) => { kinds[i] = 'trap' })
  return { words: all, kinds, correctIdx, trapIndices, side }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
