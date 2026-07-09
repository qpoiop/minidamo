/*
 * 모빈치코드 · 타일 세트 + 정렬 규칙.
 *
 * 타일: 검정 0..11 + 흰색 0..11 + 조커 2. 총 26장.
 * 정렬: 값 오름차순. 동수는 검정<흰색. 조커는 값이 유동(놓인 위치 = 임의).
 *
 * 시드-결정론 셔플로 양쪽이 동일한 배분을 재현.
 */

export type Color = 'black' | 'white' | 'joker'

export interface Tile {
  id: number;      // 0..25 unique
  color: Color;
  value: number;   // 0..11 · joker 는 -1 (미정)
}

export function buildDeck(): Tile[] {
  const deck: Tile[] = []
  let id = 0
  for (let v = 0; v <= 11; v++) deck.push({ id: id++, color: 'black', value: v })
  for (let v = 0; v <= 11; v++) deck.push({ id: id++, color: 'white', value: v })
  deck.push({ id: id++, color: 'joker', value: -1 })
  deck.push({ id: id++, color: 'joker', value: -1 })
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

/** 오름차순 정렬. 조커는 유저가 지정한 순위 (id 로 tie-break). */
export function sortTiles(tiles: Tile[], jokerPositions?: Map<number, number>): Tile[] {
  return tiles.slice().sort((a, b) => {
    const av = a.color === 'joker' ? (jokerPositions?.get(a.id) ?? 999) : a.value
    const bv = b.color === 'joker' ? (jokerPositions?.get(b.id) ?? 999) : b.value
    if (av !== bv) return av - bv
    if (a.color === b.color) return a.id - b.id
    return a.color === 'black' ? -1 : 1
  })
}

export interface DealResult {
  hostHand: Tile[];   // 4장 (host 시점 · 실제 값 보유)
  guestHand: Tile[];  // 4장 (guest 시점 · 실제 값 보유)
  stock: Tile[];      // 나머지 더미 (top 이 배열 끝)
}

export function deal(seed: number): DealResult {
  const deck = shuffle(buildDeck(), seed)
  const hostHand = sortTiles(deck.slice(0, 4))
  const guestHand = sortTiles(deck.slice(4, 8))
  const stock = deck.slice(8)
  return { hostHand, guestHand, stock }
}
