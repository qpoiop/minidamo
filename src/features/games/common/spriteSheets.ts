/*
 * Bitmap sprite sheets shipped in src/assets/. Loaded once at module
 * scope and shared across canvas games (냥탈출 / 우다다).
 *
 * cat_walk_sheet.png (256×128) — 4-column × 2-row grid of 64×64 tiles.
 *   방향프레임 (A / B):
 *     아래(정면): (0, 0), (1, 0)
 *     위(뒷모습): (2, 0), (3, 0)
 *     왼쪽:       (0, 1), (1, 1)
 *     오른쪽:     (2, 1), (3, 1)
 *
 * item_sheet.png (160×32) — 5-column × 1-row grid of 32×32 tiles.
 *   User-defined mapping. Kept as ItemName so consumers stay explicit.
 */

import catWalkUrl from '../../../assets/cat_walk_sheet.png'
import itemSheetUrl from '../../../assets/item_sheet.png'

export type CatDir = 'down' | 'up' | 'left' | 'right'
export type CatFrame = 0 | 1

const CAT_ROW: Record<CatDir, number> = { down: 0, up: 0, left: 1, right: 1 }
const CAT_COL: Record<CatDir, readonly [number, number]> = {
  down:  [0, 1],
  up:    [2, 3],
  left:  [0, 1],
  right: [2, 3],
}
const CAT_TILE = 64

const catImg = new Image()
catImg.src = catWalkUrl
export const catReady = () => catImg.complete && catImg.naturalWidth > 0

export function drawCatFrame(
  ctx: CanvasRenderingContext2D,
  dir: CatDir,
  frame: CatFrame,
  cx: number, cy: number,
  size: number,
): void {
  if (!catReady()) return
  const col = CAT_COL[dir][frame]
  const row = CAT_ROW[dir]
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    catImg,
    col * CAT_TILE, row * CAT_TILE, CAT_TILE, CAT_TILE,
    cx - size / 2, cy - size / 2, size, size,
  )
}

/**
 * Item sheet — 5 tiles. Order left→right: index 0..4. Callers assign
 * their own semantic label per game. Keeping the naming here abstract
 * so both Wudada + Escape can pull from the same bank.
 */
export type ItemIndex = 0 | 1 | 2 | 3 | 4
const ITEM_TILE = 32
const itemImg = new Image()
itemImg.src = itemSheetUrl
export const itemReady = () => itemImg.complete && itemImg.naturalWidth > 0

export function drawItemFrame(
  ctx: CanvasRenderingContext2D,
  idx: ItemIndex,
  cx: number, cy: number,
  size: number,
): void {
  if (!itemReady()) return
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    itemImg,
    idx * ITEM_TILE, 0, ITEM_TILE, ITEM_TILE,
    cx - size / 2, cy - size / 2, size, size,
  )
}

/**
 * Pick the sprite direction that matches an entity's last non-zero
 * step, defaulting to `down` when it has never moved.
 */
export function dirFromDelta(dx: number, dy: number, fallback: CatDir = 'down'): CatDir {
  if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02) return fallback
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}
