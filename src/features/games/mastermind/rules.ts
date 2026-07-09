import { ALL_SYMBOLS, CODE_LENGTH } from './symbols'
import type { NyangSymbol } from './symbols'

/**
 * Deterministic code generation from a seed. Both peers share the
 * same secret code so guessing is fair — the peer HELLO handshake
 * broadcasts the seed exactly like Mosun does.
 */
export function generateCode(seed: number): NyangSymbol[] {
  let s = seed | 0
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return ((s >>> 0) / 0x100000000)
  }
  const out: NyangSymbol[] = []
  for (let i = 0; i < CODE_LENGTH; i++) {
    out.push(ALL_SYMBOLS[Math.floor(rnd() * ALL_SYMBOLS.length)])
  }
  return out
}

/**
 * Mastermind-style feedback:
 *   exact = right symbol at right position
 *   miss  = right symbol at a wrong position (subtracting exact matches)
 *
 * Handles duplicate symbols in both the code and the guess correctly.
 */
export function evaluateGuess(code: NyangSymbol[], guess: NyangSymbol[]): { exact: number; miss: number } {
  const codeRemain: Record<NyangSymbol, number> = { fish: 0, yarn: 0, mouse: 0, paw: 0, bell: 0, star: 0 }
  const guessRemain: Record<NyangSymbol, number> = { fish: 0, yarn: 0, mouse: 0, paw: 0, bell: 0, star: 0 }
  let exact = 0
  for (let i = 0; i < code.length; i++) {
    if (code[i] === guess[i]) exact++
    else {
      codeRemain[code[i]]++
      guessRemain[guess[i]]++
    }
  }
  let miss = 0
  for (const s of ALL_SYMBOLS) {
    miss += Math.min(codeRemain[s], guessRemain[s])
  }
  return { exact, miss }
}
