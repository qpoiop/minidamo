/*
 * Bitmap sprite sheet shipped in src/assets/. Loaded once at module
 * scope. 협동 미로(Escape) 게임 캐릭터 애니메이션 용.
 *
 * cat_walk_sheet.png (256×128) — 4-column × 2-row grid of 64×64 tiles.
 *   방향프레임 (A / B):
 *     아래(정면): (0, 0), (1, 0)
 *     위(뒷모습): (2, 0), (3, 0)
 *     왼쪽:       (0, 1), (1, 1)
 *     오른쪽:     (2, 1), (3, 1)
 */

import catWalkUrl from '../../../assets/cat_walk_sheet.png'

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
 * Pick the sprite direction that matches an entity's last non-zero
 * step, defaulting to `down` when it has never moved.
 */
export function dirFromDelta(dx: number, dy: number, fallback: CatDir = 'down'): CatDir {
  if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02) return fallback
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}
