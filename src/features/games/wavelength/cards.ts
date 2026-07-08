/**
 * Wavelength (냥파장) card bank — 개념형 + 지표형 두 종류.
 *
 * 개념형 (concept):
 *   양 끝이 반대인 자유 축. 촉냥은 그 지점의 느낌을 자유 단서로 표현.
 *   예: 순하다 ↔ 사납다
 *
 * 지표형 (indicator):
 *   주제 안에서 지표 축이 명시된다. 촉냥은 그 지점의 구체 인스턴스를
 *   단서로 제시. 예: 주제 = 음식, 지표 = 매운 정도, poles = 안맵다 ↔ 맵다.
 */

export type SpectrumCard =
  | {
      id: string;
      kind: 'concept';
      low: string;
      high: string;
    }
  | {
      id: string;
      kind: 'indicator';
      subject: string;    // 주제 (e.g. 음식, 인물, 장소)
      axis: string;       // 지표 (e.g. 매운 정도, 유명도)
      low: string;
      high: string;
    }

export const SPECTRUM_CARDS: SpectrumCard[] = [
  // 개념형 — 감정 · 성격 · 감각 축
  { id: 'wild-tame',       kind: 'concept', low: '순하다',       high: '사납다' },
  { id: 'common-rare',     kind: 'concept', low: '흔하다',       high: '희귀하다' },
  { id: 'cheap-expensive', kind: 'concept', low: '싸다',         high: '비싸다' },
  { id: 'small-big',       kind: 'concept', low: '작다',         high: '크다' },
  { id: 'soft-hard',       kind: 'concept', low: '부드럽다',     high: '단단하다' },
  { id: 'boring-exciting', kind: 'concept', low: '지루하다',     high: '짜릿하다' },
  { id: 'easy-hard',       kind: 'concept', low: '쉽다',         high: '어렵다' },
  { id: 'clean-dirty',     kind: 'concept', low: '깔끔하다',     high: '지저분하다' },
  { id: 'fast-slow',       kind: 'concept', low: '빠르다',       high: '느리다' },
  { id: 'quiet-loud',      kind: 'concept', low: '조용하다',     high: '시끄럽다' },
  { id: 'safe-risky',      kind: 'concept', low: '안전하다',     high: '위험하다' },
  { id: 'simple-fancy',    kind: 'concept', low: '단순하다',     high: '화려하다' },
  // 지표형 — 주제 안에서 지표 축을 놓고, 촉냥은 그 지점의 구체 인스턴스를 제시.
  { id: 'food-spicy',      kind: 'indicator', subject: '음식',   axis: '매운 정도',   low: '안맵다',     high: '맵다' },
  { id: 'food-sweet',      kind: 'indicator', subject: '음식',   axis: '단맛',        low: '안달다',     high: '아주 달다' },
  { id: 'person-known',    kind: 'indicator', subject: '인물',   axis: '유명도',      low: '무명',       high: '전세계 유명' },
  { id: 'place-far',       kind: 'indicator', subject: '장소',   axis: '집에서 거리', low: '집 앞',      high: '지구 반대편' },
  { id: 'anim-danger',     kind: 'indicator', subject: '동물',   axis: '위험도',      low: '전혀 안 위험', high: '매우 위험' },
  { id: 'movie-scary',     kind: 'indicator', subject: '영화',   axis: '무서운 정도', low: '전혀 안 무섭', high: '아주 무섭' },
  { id: 'sport-heavy',     kind: 'indicator', subject: '스포츠', axis: '체력 소모',   low: '가볍다',     high: '숨찬다' },
  { id: 'season-cold',     kind: 'indicator', subject: '계절 감', axis: '체감 온도',   low: '한겨울',     high: '한여름' },
]

/** Sub-band widths for the 3-tier scoring (percent of the 0..100 axis).
 * Preset drives the tolerance:
 *   빡빡 (strict)  → 3 / 7 / 11
 *   보통 (default) → 5 / 10 / 15
 *   널널 (loose)   → 7 / 14 / 20
 * Scores: within band-1 = 4, band-2 = 3, band-3 = 2, else 0.
 */
export type TolerancePreset = 'strict' | 'default' | 'loose'
export interface ToleranceBands {
  b4: number
  b3: number
  b2: number
}
export const TOLERANCE_BANDS: Record<TolerancePreset, ToleranceBands> = {
  strict:  { b4: 3, b3: 7,  b2: 11 },
  default: { b4: 5, b3: 10, b2: 15 },
  loose:   { b4: 7, b3: 14, b2: 20 },
}

export function scoreGuess(target: number, guess: number, bands: ToleranceBands): number {
  const err = Math.abs(target - guess)
  if (err <= bands.b4) return 4
  if (err <= bands.b3) return 3
  if (err <= bands.b2) return 2
  return 0
}

/** Deterministic pick from the seed so both peers see the same card. */
function seededIndex(seed: number, n: number): number {
  let a = (seed | 0) + 0x9e3779b9
  a = Math.imul(a ^ (a >>> 15), a | 1)
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61)
  return (((a ^ (a >>> 14)) >>> 0) % n)
}

export function pickCard(seed: number, round: number): SpectrumCard {
  const salt = (seed ^ (round * 2654435761)) >>> 0
  return SPECTRUM_CARDS[seededIndex(salt, SPECTRUM_CARDS.length)]
}

export function pickTarget(seed: number, round: number): number {
  // Bias to 10..90 so the target never sits right on the endpoints.
  const salt = (seed ^ (round * 1103515245) ^ 0xa3b) >>> 0
  return 10 + seededIndex(salt, 81)
}
