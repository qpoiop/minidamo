/*
 * Random nickname generator.
 * Pool is centralized so future themes / seasons can add prefixes without touching call sites.
 */

export const NICK_PREFIXES = [
  '말랑이',
  '포동이',
  '몽글이',
  '반짝이',
  '쫀득이',
  '삐약이',
] as const

const SUFFIX_MIN = 1000
const SUFFIX_MAX = 9999

function pickPrefix(): string {
  const idx = Math.floor(Math.random() * NICK_PREFIXES.length)
  return NICK_PREFIXES[idx]
}

function pickSuffix(): number {
  return Math.floor(SUFFIX_MIN + Math.random() * (SUFFIX_MAX - SUFFIX_MIN + 1))
}

export function generateNick(): string {
  return `${pickPrefix()}${pickSuffix()}`
}
