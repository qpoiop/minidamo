/*
 * 모루먼쇼 (Briscola) · 40장 덱 규칙 엔진.
 *
 * 무늬: 4가지. 값: A, 2, 3, 4, 5, 6, 7, J, Q, K.
 * 점수: A=11 · 10=10 · K=4 · Q=3 · J=2 · 나머지=0. (합 120)
 * 값 강도 (트릭 승패 계산 시): A(11) > 10(10) > K(4) > Q(3) > J(2) > 7 > 6 > 5 > 4 > 3 > 2.
 *   (즉 값이 아닌 rank 서열.)
 * 트릭 판정: 둘 다 트럼프면 rank 승. 한쪽만 트럼프면 트럼프 승. 그 외 같은 무늬면 rank 승, 다른 무늬면 선(리드) 승.
 *
 * 손패 3장 · 더미 34장 · 더미 top 밑에 트럼프 지정 카드 (마지막 뽑힘).
 */

export type Suit = 'cheese' | 'black' | 'tricolor' | 'bengal'
export const SUITS: Suit[] = ['cheese', 'black', 'tricolor', 'bengal']

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | 'J' | 'Q' | 'K'
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K']

export interface Card {
  id: number;   // 0..39 unique
  suit: Suit;
  rank: Rank;
}

/**
 * 이탈리아 브리스콜라 표준: 40장 (A,2,3,4,5,6,7,J,Q,K × 4). 점수 카드는
 * A=11 · 3=10 · K=4 · Q=3 · J=2 · 나머지 0. 합 30 × 4 = 120.
 */
export function points(rank: Rank): number {
  switch (rank) {
    case 'A': return 11
    case '3': return 10
    case 'K': return 4
    case 'Q': return 3
    case 'J': return 2
    default: return 0
  }
}

/** 강도 서열 (트릭 승패 계산). 위쪽이 강함. */
const STRENGTH: Rank[] = ['A', '3', 'K', 'Q', 'J', '7', '6', '5', '4', '2']

export function strengthOf(rank: Rank): number {
  return STRENGTH.length - STRENGTH.indexOf(rank)
}

export function buildDeck(): Card[] {
  const deck: Card[] = []
  let id = 0
  for (const s of SUITS) for (const r of RANKS) deck.push({ id: id++, suit: s, rank: r })
  return deck
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed)
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface Deal {
  hostHand: Card[];   // 3
  guestHand: Card[];  // 3
  stock: Card[];      // 34, top = last
  trump: Card;        // stock 맨 밑 카드 (표기용 · 더미 마지막에 뽑힘)
}

export function deal(seed: number): Deal {
  const shuffled = shuffle(buildDeck(), seed)
  const hostHand = shuffled.slice(0, 3)
  const guestHand = shuffled.slice(3, 6)
  const stock = shuffled.slice(6)
  const trump = stock[0] // 스톡 맨 아래 = 배열 첫번째 = 마지막에 뽑힘
  return { hostHand, guestHand, stock, trump }
}

export function trickWinner(lead: Card, follow: Card, trumpSuit: Suit): 'lead' | 'follow' {
  const leadTrump = lead.suit === trumpSuit
  const followTrump = follow.suit === trumpSuit
  if (leadTrump && followTrump) return strengthOf(follow.rank) > strengthOf(lead.rank) ? 'follow' : 'lead'
  if (followTrump && !leadTrump) return 'follow'
  if (leadTrump && !followTrump) return 'lead'
  if (lead.suit === follow.suit) return strengthOf(follow.rank) > strengthOf(lead.rank) ? 'follow' : 'lead'
  return 'lead'
}

export function suitLabel(s: Suit): string {
  return s === 'cheese' ? '치즈냥' : s === 'black' ? '검정냥' : s === 'tricolor' ? '삼색냥' : '벵갈냥'
}
