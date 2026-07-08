/*
 * Canonical palette exposed to JS/Canvas paths. The CSS tokens in
 * src/styles/tokens.css are the single source of truth for the DOM;
 * this module mirrors the same hexes with typed named exports so
 * canvas draws + particle bursts + inline SVG fills stop reaching for
 * bare hex literals.
 *
 * If a token changes in tokens.css, update the matching entry here.
 * The `expectMatch` at the bottom sanity-checks the mirror once in
 * dev.
 */

export const PALETTE = {
  // Arcade greens
  borderStrong: '#0a260a',
  accentPrimary: '#9bbc0f',
  accentSecondary: '#8bac0f',
  fgAccent: '#c7e06a',
  bgInset: '#0f380f',
  bgSurface: '#16210f',
  bgApp: '#0f280f',

  // Auxiliaries
  fgMuted: '#8bac0f',
  fgInverse: '#0f380f',

  // Semantic
  bomb: '#c2331f',
  bombLight: '#ff8a70',
  bombDim: '#e8a89e',
  bombBg: '#2a0f0d',

  info: '#5bb3c2',
  gold: '#e0c34a',

  // Escape maze tile shades (kept because they don't map to a token —
  // pure canvas values for the fog-of-war layered board).
  mazeTileFogHigh: '#33511b',
  mazeTileFogLow:  '#20340f',
  mazeWallHigh:    '#4a7326',
  mazeWallLow:     '#2a441a',
  mazeSeenPath:    '#0f380f',
  mazeUnknownPath: '#0b230b',
  mazeVoid:        '#05100a',

  // Wudada canvas surfaces (spec §우다다 R2)
  wudadaTrackBg:   '#0d300d',   // track base
  wudadaLaneDivider: '#8bac0f', // dashed lane lines
  wudadaShoulder:  '#244b1e',   // outside-lane border
  wudadaSpark:     '#e0913f',   // collision spark tint
} as const

export type PaletteKey = keyof typeof PALETTE
