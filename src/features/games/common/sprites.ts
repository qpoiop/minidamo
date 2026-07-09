/*
 * Pixel sprite palette + sprite bank shared by 우다다 / 냥탈출.
 *
 * Sprites verbatim from the design file
 * (planning/imports/minidamo Games - 우다다 · 냥탈출.dc.html §PAL/§SPR).
 * Rows are equal-length 12-char strings; each char is a palette key or
 * '.' for transparent.
 */

export type PaletteKey =
  | '.' | 'K' | 'd' | 'm' | 'l' | 'L' | 'H'
  | 'p' | 'e' | 'w' | 'W' | 'r' | 'R' | 'y' | 'z'

export const PALETTE: Record<PaletteKey, string | null> = {
  '.': null,
  K: '#0a260a',
  d: '#0f380f',
  m: '#306230',
  l: '#8bac0f',
  L: '#9bbc0f',
  H: '#c7e06a',
  p: '#e79a86',
  e: '#0f380f',
  w: '#2a5db0',
  W: '#6a97d8',
  r: '#c2331f',
  R: '#ff8a70',
  y: '#e0c34a',
  z: '#8bac0f',
}

export const BUDDY_OV: Partial<Record<PaletteKey, string>> = { L: '#5bb3c2', H: '#8fd6e0' }
export const INV_OV:   Partial<Record<PaletteKey, string>> = { L: '#c7e06a', H: '#f2ffd0' }

export type SpriteName = 'cat' | 'monster' | 'key' | 'door' | 'eye'

export const SPRITES: Record<SpriteName, readonly string[]> = {
  cat: [
    '.K........K.', '.KLK....KLK.', '.KLLK..KLLK.', '.KLLLKKLLLK.',
    'KLLLLLLLLLLK', 'KLLLLLLLLLLK', 'KLeLLLLLLeLK', 'KLLLLLLLLLLK',
    'KLLLLppLLLLK', 'KLLLLLLLLLLK', '.KLLLLLLLLK.', '..KKKKKKKK..',
  ],
  monster: [
    '....KKKK....', '..KKmmmmKK..', '.KmmmmmmmmK.', '.KmmmmmmmmK.',
    'KmmmmmmmmmmK', 'KmRRmmmmRRmK', 'KmRRmmmmRRmK', 'KmmmmmmmmmmK',
    'KmmmmmmmmmmK', 'KmmmmmmmmmmK', 'KmKmmKKmmKmK', '.K.KK..KK.K.',
  ],
  key: [
    '............', '............', '.KKK........', 'KyyyKKKKKKK.',
    'KyKyKyKyKyK.', 'KyyyKKKKKKK.', '.KKK........', '............',
    '............', '............', '............', '............',
  ],
  door: [
    'KKKKKKKKKKKK', 'KHHHHHHHHHHK', 'KHmmmmmmmmHK', 'KHmLLLLLLmHK',
    'KHmLLLLLLmHK', 'KHmLLLLyLmHK', 'KHmLLLLLLmHK', 'KHmLLLLLLmHK',
    'KHmLLLLLLmHK', 'KHmmmmmmmmHK', 'KHHHHHHHHHHK', 'KKKKKKKKKKKK',
  ],
  eye: [
    '............', '............', '..KKKKKK....', '.KLLLLLLK...',
    'KLLKKKKLLK..', 'KLKddddKLK..', 'KLLKKKKLLK..', '.KLLLLLLK...',
    '..KKKKKK....', '............', '............', '............',
  ],
} as const

/** Width in cells (all sprites are 12 wide but pad to be safe). */
export function spriteWidth(sprite: readonly string[]): number {
  let m = 0
  for (const r of sprite) if (r.length > m) m = r.length
  return m
}

/**
 * Draws a sprite centred at (cx, cy) with `px` pixel size (game
 * coordinate units per sprite pixel). `ov` overrides individual
 * palette entries — used for buddy tint / invulnerability flash.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  cx: number,
  cy: number,
  px: number,
  ov?: Partial<Record<PaletteKey, string>>,
): void {
  const sprite = SPRITES[name]
  const w = spriteWidth(sprite)
  const h = sprite.length
  const x0 = cx - (w * px) / 2
  const y0 = cy - (h * px) / 2
  for (let r = 0; r < h; r++) {
    const row = sprite[r]
    for (let c = 0; c < row.length; c++) {
      const ch = row[c] as PaletteKey
      if (ch === '.') continue
      const col = (ov && ov[ch]) || PALETTE[ch]
      if (!col) continue
      ctx.fillStyle = col
      ctx.fillRect(Math.floor(x0 + c * px), Math.floor(y0 + r * px), Math.ceil(px), Math.ceil(px))
    }
  }
}

/* ------------------------------------------------------------------
 * Particle helpers shared with the design file's WIN_FX + burst APIs.
 * ------------------------------------------------------------------ */

export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  g: number;
  life: number; dl: number;
  size: number;
  color: string;
}

export const CONF_COLORS = [
  '#9bbc0f', '#c7e06a', '#8bac0f', '#e0913f', '#5bb3c2',
] as const

export function stepParticles(arr: Particle[], _w: number, h: number): void {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i]
    p.x += p.vx
    p.y += p.vy
    p.vy += p.g
    p.life -= p.dl
    if (p.life <= 0 || p.y > h + 20) arr.splice(i, 1)
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, arr: Particle[]): void {
  for (const p of arr) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life))
    ctx.fillStyle = p.color
    ctx.fillRect(p.x, p.y, p.size, p.size)
  }
  ctx.globalAlpha = 1
}

export function burstParticles(arr: Particle[], x: number, y: number, n: number, up: boolean): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = 1 + Math.random() * 4
    arr.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: up ? -Math.abs(Math.sin(a) * sp) - 1 : Math.sin(a) * sp,
      g: 0.08,
      life: 1,
      dl: 0.008 + Math.random() * 0.01,
      size: 2 + Math.random() * 4,
      color: CONF_COLORS[Math.floor(Math.random() * CONF_COLORS.length)],
    })
  }
}
