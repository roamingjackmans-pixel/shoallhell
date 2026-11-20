// Hex grid helpers: tiles, distance, line of sight, movement ranges and paths.
// Pointy-top hexes in "odd-r" offset coordinates: tiles are stored as rows (x = column, y = row) and every odd row
// is shifted half a hex to the right. Six neighbours, every step costs 1. Pure functions over CombatState / MapData.
import type { CombatState, MapData, Unit } from './types';

export const key = (x: number, y: number): number => y * 1000 + x;
export const unkey = (k: number): [number, number] => [k % 1000, Math.floor(k / 1000)];

// ------------------------------------------------------------------ hex maths

export type Cube = [number, number, number];

/** The six cube directions, clockwise from east. */
export const CUBE_DIRS: Cube[] = [
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 1],
];

export function toCube(x: number, y: number): Cube {
  const q = x - (y - (y & 1)) / 2;
  const r = y;
  return [q, -q - r, r];
}

export function fromCube(c: Cube): [number, number] {
  const q = c[0];
  const r = c[2];
  return [q + (r - (r & 1)) / 2, r];
}

export function cubeAdd(a: Cube, b: Cube, k = 1): Cube {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}

export function neighbors(x: number, y: number): [number, number][] {
  const c = toCube(x, y);
  return CUBE_DIRS.map((d) => fromCube(cubeAdd(c, d)));
}

/** Hex distance (steps). */
export function hexDist(ax: number, ay: number, bx: number, by: number): number {
  const a = toCube(ax, ay);
  const b = toCube(bx, by);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** Which of the six directions (0–5) leads from a to an adjacent b, or the closest one for a farther b. */
export function dirIndex(ax: number, ay: number, bx: number, by: number): number {
  const [px, py] = hexCenter(ax, ay);
  const [qx, qy] = hexCenter(bx, by);
  const ang = Math.atan2(qy - py, qx - px);
  // direction 0 points east-ish (cube +q −s) which in pixels is angle −30°
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 6; i++) {
    const [dx, dy] = fromCube(cubeAdd(toCube(ax, ay), CUBE_DIRS[i]!));
    const [cx, cy] = hexCenter(dx, dy);
    const a2 = Math.atan2(cy - py, cx - px);
    let d = Math.abs(a2 - ang);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Step from (x, y) n times in direction i. */
export function stepDir(x: number, y: number, i: number, n = 1): [number, number] {
  return fromCube(cubeAdd(toCube(x, y), CUBE_DIRS[((i % 6) + 6) % 6]!, n));
}

/** Centre of a hex in unit space (hex radius 1). */
export function hexCenter(x: number, y: number): [number, number] {
  return [Math.sqrt(3) * (x + 0.5 * (y & 1)), 1.5 * y];
}

/** The hex containing a point in unit space. */
export function pixelToHex(px: number, py: number): [number, number] {
  const q = ((Math.sqrt(3) / 3) * px - (1 / 3) * py);
  const r = (2 / 3) * py;
  // cube round
  let rx = Math.round(q);
  let rz = Math.round(r);
  const s = -q - r;
  let ry = Math.round(s);
  const dx = Math.abs(rx - q);
  const dy = Math.abs(ry - s);
  const dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return fromCube([rx, ry, rz]);
}

// ------------------------------------------------------------------ tiles

export function tile(map: MapData, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return ' ';
  return map.tiles[y]![x] ?? ' ';
}

export function setTile(map: MapData, x: number, y: number, c: string): void {
  const row = map.tiles[y]!;
  map.tiles[y] = row.slice(0, x) + c + row.slice(x + 1);
}

export function isWallish(c: string): boolean {
  return c === '#' || c === ' ' || c === 'D';
}

/** Blocks walking (for a walker that may not open doors). */
export function blocksWalk(c: string, canOpenDoors: boolean): boolean {
  if (c === 'D') return !canOpenDoors;
  return c === '#' || c === ' ' || c === 'o';
}

/** Corners of a pointy-top hex (unit size), pulled in a little so they stay inside the hex. */
const CORNERS: [number, number][] = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [Math.cos(a) * 0.9, Math.sin(a) * 0.9];
});

/**
 * Line of sight, Gloomhaven style: walls and closed doors block, obstacles and figures do not. There is sight if any
 * straight line from a point of the attacker's hex (its centre or a corner) to a point of the target's hex (centre or
 * corner) crosses no wall. Centre to centre is tried first (the common, cheap case).
 */
export function los(map: MapData, ax: number, ay: number, bx: number, by: number): boolean {
  if (ax === bx && ay === by) return true;
  const [px, py] = hexCenter(ax, ay);
  const [qx, qy] = hexCenter(bx, by);
  const n = hexDist(ax, ay, bx, by) * 8;
  const clear = (x0: number, y0: number, x1: number, y1: number): boolean => {
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const [hx, hy] = pixelToHex(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if ((hx === ax && hy === ay) || (hx === bx && hy === by)) continue;
      if (isWallish(tile(map, hx, hy))) return false;
    }
    return true;
  };
  if (clear(px, py, qx, qy)) return true;
  const from: [number, number][] = [[px, py], ...CORNERS.map(([dx, dy]): [number, number] => [px + dx, py + dy])];
  const to: [number, number][] = [[qx, qy], ...CORNERS.map(([dx, dy]): [number, number] => [qx + dx, qy + dy])];
  for (const [x0, y0] of from) for (const [x1, y1] of to) if (clear(x0, y0, x1, y1)) return true;
  return false;
}

export function unitAt(s: CombatState, x: number, y: number): Unit | undefined {
  return s.units.find((u) => !u.dead && u.x === x && u.y === y && !(u.kind === 'hero' && u.exhausted));
}

export function isHeroSide(u: Unit): boolean {
  return u.kind === 'hero' || u.kind === 'summon';
}

export function enemiesOf(s: CombatState, u: Unit): Unit[] {
  const side = isHeroSide(u);
  return s.units.filter((o) => !o.dead && isHeroSide(o) !== side && !(o.kind === 'hero' && o.exhausted));
}

export function alliesOf(s: CombatState, u: Unit): Unit[] {
  const side = isHeroSide(u);
  return s.units.filter((o) => !o.dead && isHeroSide(o) === side && !(o.kind === 'hero' && o.exhausted));
}

export interface Reach {
  cost: Map<number, number>;
  prev: Map<number, number>;
}

export interface MoveOpts {
  jump?: boolean;
  /** heroes open doors by walking into them */
  doors?: boolean;
  /** extra cost for hazards/traps (monsters avoid them; heroes use a tiny cost as a tie-breaker) */
  hazardCost?: number;
  /** maximum cost to search */
  max: number;
  /** ignore figures entirely (for distance fields) */
  ghost?: boolean;
}

/**
 * Dijkstra over the hexes for a unit: allies can be passed through, enemies cannot (unless jumping). Difficult
 * terrain costs 2 (unless jumping). Returns costs to every reachable hex (occupied ones included; callers filter).
 */
export function reach(s: CombatState, u: Unit, o: MoveOpts): Reach {
  const map = s.map;
  const cost = new Map<number, number>();
  const prev = new Map<number, number>();
  const start = key(u.x, u.y);
  cost.set(start, 0);
  const open: [number, number][] = [[0, start]];
  const side = isHeroSide(u);
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [c, k] = open.shift()!;
    if (c > (cost.get(k) ?? Infinity)) continue;
    const [x, y] = unkey(k);
    // a closed door opens and stops you
    if (k !== start && tile(map, x, y) === 'D') continue;
    for (const [nx, ny] of neighbors(x, y)) {
      const t = tile(map, nx, ny);
      if (blocksWalk(t, !!o.doors) && !(o.jump && t === 'o')) continue;
      if (!o.ghost && !o.jump) {
        const occ = unitAt(s, nx, ny);
        if (occ && isHeroSide(occ) !== side) continue;
      }
      let step = 1;
      if (!o.jump && t === ',') step = 2;
      if (!o.jump && (t === '~' || t === 'T') && o.hazardCost) step += o.hazardCost;
      const nc = c + step;
      if (Math.floor(nc + 1e-9) > o.max) continue;
      const nk = key(nx, ny);
      if (nc < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, nc);
        prev.set(nk, k);
        open.push([nc, nk]);
      }
    }
  }
  return { cost, prev };
}

export function pathTo(r: Reach, from: [number, number], to: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  let k: number | undefined = key(to[0], to[1]);
  const start = key(from[0], from[1]);
  let guard = 0;
  while (k !== undefined && guard++ < 800) {
    out.push(unkey(k));
    if (k === start) break;
    k = r.prev.get(k);
  }
  return out.reverse();
}

/** Hexes a unit may finish a move on (reachable, empty). */
export function landing(s: CombatState, u: Unit, r: Reach, budget: number): number[] {
  const out: number[] = [];
  for (const [k, c] of r.cost) {
    if (Math.floor(c + 1e-9) > budget) continue;
    const [x, y] = unkey(k);
    if (x === u.x && y === u.y) continue;
    if (unitAt(s, x, y)) continue;
    out.push(k);
  }
  return out;
}

export function inRange(s: CombatState, a: { x: number; y: number }, b: { x: number; y: number }, range: number): boolean {
  const d = hexDist(a.x, a.y, b.x, b.y);
  if (range <= 0) return d === 1;
  return d <= range && los(s.map, a.x, a.y, b.x, b.y);
}

export function freeNeighbours(s: CombatState, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [nx, ny] of neighbors(x, y)) {
    const t = tile(s.map, nx, ny);
    if (t !== '.' && t !== ',' && t !== 'd') continue;
    if (unitAt(s, nx, ny)) continue;
    out.push([nx, ny]);
  }
  return out;
}

export function roomAt(map: MapData, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return -1;
  return map.room[y * map.w + x] ?? -1;
}

/** Every hex within n steps of (x, y). */
export function hexesWithin(x: number, y: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  const c = toCube(x, y);
  for (let dq = -n; dq <= n; dq++)
    for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) out.push(fromCube([c[0] + dq, -c[0] - dq - c[2] - dr, c[2] + dr]));
  return out;
}
