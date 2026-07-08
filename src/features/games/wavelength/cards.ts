/**
 * Wavelength (냥파장) spectrum card bank.
 * Both endpoints are Korean adjectives / concepts; the hidden target sits
 * on a 0..100 axis with the LOW pole labelled `low` and HIGH pole `high`.
 */

export interface SpectrumCard {
  id: string;
  topic: string;     // 상단 주제 (e.g. "동물", "일반", "음식") — 촉냥이 무엇에 대해 얘기하는지
  low: string;
  high: string;
}

export const SPECTRUM_CARDS: SpectrumCard[] = [
  { id: 'wild-tame',       topic: '동물 성격',   low: '순하다',       high: '사납다' },
  { id: 'common-rare',     topic: '희귀도',      low: '흔하다',       high: '희귀하다' },
  { id: 'cheap-expensive', topic: '가격',        low: '싸다',         high: '비싸다' },
  { id: 'small-big',       topic: '크기',        low: '작다',         high: '크다' },
  { id: 'soft-hard',       topic: '촉감',        low: '부드럽다',     high: '단단하다' },
  { id: 'boring-exciting', topic: '자극',        low: '지루하다',     high: '짜릿하다' },
  { id: 'easy-hard',       topic: '난이도',      low: '쉽다',         high: '어렵다' },
  { id: 'clean-dirty',     topic: '청결도',      low: '깔끔하다',     high: '지저분하다' },
  { id: 'fast-slow',       topic: '속도',        low: '빠르다',       high: '느리다' },
  { id: 'cool-warm',       topic: '온도감',      low: '차갑다',       high: '따뜻하다' },
  { id: 'sweet-savory',    topic: '맛',          low: '달다',         high: '짜다' },
  { id: 'bright-dark',     topic: '밝기',        low: '밝다',         high: '어둡다' },
  { id: 'quiet-loud',      topic: '음량',        low: '조용하다',     high: '시끄럽다' },
  { id: 'safe-risky',      topic: '안전도',      low: '안전하다',     high: '위험하다' },
  { id: 'young-old',       topic: '연령',        low: '어리다',       high: '나이 들었다' },
  { id: 'simple-fancy',    topic: '디자인',      low: '단순하다',     high: '화려하다' },
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
