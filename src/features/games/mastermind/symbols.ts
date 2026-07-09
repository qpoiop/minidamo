/*
 * Nyangho Breaker symbol bank. 6 cat-themed glyphs — spec §냥호 게임 메인.
 * The renderer draws each symbol as an inline SVG so no sprite sheet
 * is required.
 */

export type NyangSymbol = 'fish' | 'yarn' | 'mouse' | 'paw' | 'bell' | 'star'

export const ALL_SYMBOLS: readonly NyangSymbol[] = ['fish', 'yarn', 'mouse', 'paw', 'bell', 'star']

export const CODE_LENGTH = 4    // spec: 기본 4칸

/** SVG glyph paths per symbol. Rendered with stroke="currentColor". */
export const SYMBOL_PATHS: Record<NyangSymbol, string> = {
  fish:  'M4 12s3-4 8-4 8 4 8 4-3 4-8 4-8-4-8-4z M20 12l3-3v6z M8 12h.01',
  yarn:  'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M6 8c3 2 6 5 10 8 M8 6c3 2 6 5 9 8 M4 12c3 2 6 5 8 8',
  mouse: 'M5 15v-2l3-3h8l3 3v2z M8 10a3 3 0 0 1 3-3M16 10a3 3 0 0 0-3-3 M9 13h.01 M15 13h.01',
  paw:   'M6 11a2 2 0 1 1 4 0 2 2 0 0 1-4 0z M14 11a2 2 0 1 1 4 0 2 2 0 0 1-4 0z M9 15a3 3 0 0 0 6 0 M11 8v1 M13 8v1',
  bell:  'M12 4a5 5 0 0 0-5 5v4l-2 3h14l-2-3V9a5 5 0 0 0-5-5z M10 20a2 2 0 0 0 4 0',
  star:  'M12 3l2.5 5 5.5.8-4 4 1 5.5L12 15.8 7 18.3l1-5.5-4-4 5.5-.8z',
}
