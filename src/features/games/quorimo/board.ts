/*
 * 쿼리모 (Quoridor) 보드 · 규칙 엔진.
 *
 * · 격자 크기 N (기본 9). 좌표는 (row, col) · 0..N-1.
 * · 벽은 두 인접 셀 사이 경계 홈에 설치. 가로 벽 = 두 행 사이, 세로 벽 = 두 열 사이.
 *   벽 하나는 2셀 길이 → (r, c, 'H')  가로 벽이 (r,c)~(r,c+1) 과 (r+1,c)~(r+1,c+1) 을 덮음.
 *   (r, c, 'V')  세로 벽이 (r,c)~(r+1,c) 과 (r,c+1)~(r+1,c+1) 을 덮음.
 *   즉 벽 앵커는 (r,c) with 0 ≤ r ≤ N-2, 0 ≤ c ≤ N-2. 총 (N-1)² × 2 후보.
 * · 판정:
 *   - 이동: 인접 4방향, 두 셀 사이 벽 없으면 통과.
 *   - 상대와 마주쳐 뛰어넘기 (jump): 상대 바로 앞 · 그 뒤에 벽/보드끝 없으면 직선 넘기.
 *     뒤가 막히면 상대의 양옆 대각선(단, 대각선 방향에 벽 없어야).
 *   - 벽 유효성: 겹침·교차 금지 + 양쪽 목표선 도달 경로 존재 (BFS).
 * · 승리: 자기 목표 행에 도달.
 */

export type WallOrient = 'H' | 'V'

export interface Wall {
  r: number;
  c: number;
  o: WallOrient;
}

export interface Cat {
  r: number;
  c: number;
}

export type Owner = 'host' | 'guest'

export interface QuorimoState {
  size: number;
  hostPos: Cat;
  guestPos: Cat;
  hostGoalRow: number;
  guestGoalRow: number;
  hostWalls: number;
  guestWalls: number;
  walls: Wall[];
  turn: Owner;
  winner: Owner | null;
}

export function initialState(size = 9, wallsEach = 10): QuorimoState {
  const mid = Math.floor(size / 2)
  return {
    size,
    hostPos: { r: size - 1, c: mid },
    guestPos: { r: 0, c: mid },
    hostGoalRow: 0,
    guestGoalRow: size - 1,
    hostWalls: wallsEach,
    guestWalls: wallsEach,
    walls: [],
    turn: 'host',
    winner: null,
  }
}

/** 두 인접 셀 사이가 벽으로 막혀 있으면 true. */
export function isBlocked(walls: readonly Wall[], a: Cat, b: Cat): boolean {
  const dr = b.r - a.r
  const dc = b.c - a.c
  if (Math.abs(dr) + Math.abs(dc) !== 1) return false
  for (const w of walls) {
    if (w.o === 'H') {
      // 가로 벽: 두 행 사이 (row w.r ↔ row w.r+1) · 컬럼 w.c 와 w.c+1 을 덮음.
      // 세로 이동 (dr = ±1) 만 차단.
      if (dc === 0) {
        const rowBetween = Math.min(a.r, b.r)
        if (rowBetween === w.r && (a.c === w.c || a.c === w.c + 1)) return true
      }
    } else {
      // 세로 벽: 두 열 사이 · 두 행을 덮음.
      if (dr === 0) {
        const colBetween = Math.min(a.c, b.c)
        if (colBetween === w.c && (a.r === w.r || a.r === w.r + 1)) return true
      }
    }
  }
  return false
}

function inBounds(size: number, r: number, c: number): boolean {
  return r >= 0 && r < size && c >= 0 && c < size
}

function samePos(a: Cat, b: Cat): boolean { return a.r === b.r && a.c === b.c }

/** 목적 셀 리스트 (이동 + 점프 + 대각). */
export function legalMoves(s: QuorimoState, me: Owner): Cat[] {
  const my = me === 'host' ? s.hostPos : s.guestPos
  const opp = me === 'host' ? s.guestPos : s.hostPos
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  const out: Cat[] = []
  for (const [dr, dc] of dirs) {
    const next: Cat = { r: my.r + dr, c: my.c + dc }
    if (!inBounds(s.size, next.r, next.c)) continue
    if (isBlocked(s.walls, my, next)) continue
    if (samePos(next, opp)) {
      // 뒤 셀 시도 (직선 점프)
      const jump: Cat = { r: opp.r + dr, c: opp.c + dc }
      const jumpOK = inBounds(s.size, jump.r, jump.c) && !isBlocked(s.walls, opp, jump)
      if (jumpOK) {
        out.push(jump)
      } else {
        // 대각선 (직교 두 방향)
        const perp: [number, number][] = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]]
        for (const [pr, pc] of perp) {
          const diag: Cat = { r: opp.r + pr, c: opp.c + pc }
          if (!inBounds(s.size, diag.r, diag.c)) continue
          if (isBlocked(s.walls, opp, diag)) continue
          out.push(diag)
        }
      }
      continue
    }
    out.push(next)
  }
  return out
}

/** BFS 로 목표 행까지 경로 존재 검증. */
export function hasPathToGoal(size: number, walls: readonly Wall[], start: Cat, goalRow: number): boolean {
  const seen = new Set<string>()
  const key = (c: Cat) => `${c.r},${c.c}`
  const queue: Cat[] = [start]
  seen.add(key(start))
  while (queue.length > 0) {
    const cur = queue.shift() as Cat
    if (cur.r === goalRow) return true
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    for (const [dr, dc] of dirs) {
      const nx: Cat = { r: cur.r + dr, c: cur.c + dc }
      if (!inBounds(size, nx.r, nx.c)) continue
      if (isBlocked(walls, cur, nx)) continue
      const k = key(nx)
      if (seen.has(k)) continue
      seen.add(k)
      queue.push(nx)
    }
  }
  return false
}

export function wallOverlaps(existing: readonly Wall[], w: Wall): boolean {
  for (const e of existing) {
    if (e.o === w.o) {
      if (e.o === 'H') {
        // 같은 행 접합 + 열 겹침 (w.c, w.c+1 vs e.c, e.c+1)
        if (e.r === w.r && Math.abs(e.c - w.c) < 2) return true
      } else {
        if (e.c === w.c && Math.abs(e.r - w.r) < 2) return true
      }
    } else {
      // 교차: 가로벽 (r,c) H 와 세로벽 (r,c) V 가 (r,c)~(r+1,c+1) 중심에서 만남.
      if (e.r === w.r && e.c === w.c) return true
    }
  }
  return false
}

export function validateWallPlacement(s: QuorimoState, w: Wall, owner: Owner): { ok: true } | { ok: false; reason: string } {
  const stock = owner === 'host' ? s.hostWalls : s.guestWalls
  if (stock <= 0) return { ok: false, reason: '남은 벽이 없어요' }
  if (w.r < 0 || w.r > s.size - 2 || w.c < 0 || w.c > s.size - 2) return { ok: false, reason: '벽 좌표가 보드 밖이에요' }
  if (wallOverlaps(s.walls, w)) return { ok: false, reason: '이미 다른 벽과 겹치거나 교차해요' }
  const next = [...s.walls, w]
  if (!hasPathToGoal(s.size, next, s.hostPos, s.hostGoalRow)) return { ok: false, reason: '이 벽은 상대의 길을 완전히 막아요' }
  if (!hasPathToGoal(s.size, next, s.guestPos, s.guestGoalRow)) return { ok: false, reason: '이 벽은 상대의 길을 완전히 막아요' }
  return { ok: true }
}

export function applyMove(s: QuorimoState, target: Cat, owner: Owner): QuorimoState {
  if (s.winner) return s
  const moves = legalMoves(s, owner)
  if (!moves.some((m) => m.r === target.r && m.c === target.c)) return s
  const next: QuorimoState = { ...s }
  if (owner === 'host') next.hostPos = target
  else next.guestPos = target
  const goalRow = owner === 'host' ? s.hostGoalRow : s.guestGoalRow
  if (target.r === goalRow) next.winner = owner
  next.turn = owner === 'host' ? 'guest' : 'host'
  return next
}

export function applyWall(s: QuorimoState, w: Wall, owner: Owner): QuorimoState | null {
  if (s.winner) return null
  const v = validateWallPlacement(s, w, owner)
  if (!v.ok) return null
  const next: QuorimoState = { ...s, walls: [...s.walls, w] }
  if (owner === 'host') next.hostWalls -= 1
  else next.guestWalls -= 1
  next.turn = owner === 'host' ? 'guest' : 'host'
  return next
}
