// Procedural scenario maps on a hex grid. Each room is an irregular blob (a union of hex disks), rooms are chained
// by doors through a one-hex wall, and every room is dressed in its Dungeon Joe zone (props, hazards, difficult
// ground, traps) and populated with packs built the Dungeon Joe way (fodder packs with ranged backup, a tank with
// archers, a brute with hangers-on, casters with a support, swarms around a hazard...). Some packs "washed up" from
// other zones, so any enemy can turn up anywhere; the bottom of the Shoal mixes every zone.
// Monsters in a room only appear when its door is opened (RoomInfo.spawns), so an unopened room is inactive.
import { ITEMS } from '../data/items';
import { MONSTERS, ZONE_MONSTERS } from '../data/monsters';
import type { ScenarioDef } from '../data/story';
import { CUBE_DIRS, cubeAdd, fromCube, hexDist, hexesWithin, key, neighbors, toCube, unkey } from './grid';
import { chance, pick, rand, randInt, shuffle } from './rng';
import type { MapData, Pickup, Role, RoomInfo, Spawn } from './types';

const TEMPLATES: Role[][] = [
  ['fodder', 'fodder', 'ranged', 'fodder', 'ranged'],
  ['tank', 'ranged', 'ranged', 'fodder', 'fodder'],
  ['brute', 'fodder', 'fodder', 'ranged', 'support'],
  ['caster', 'support', 'fodder', 'fodder', 'ranged'],
  ['swarm', 'hazard', 'fodder', 'ranged', 'fodder'],
  ['assassin', 'assassin', 'caster', 'fodder', 'tank'],
  ['fodder', 'fodder', 'support', 'tank', 'ranged'],
  ['brute', 'caster', 'fodder', 'assassin', 'fodder'],
  ['tank', 'fodder', 'caster', 'swarm', 'ranged'],
];

export interface Generated {
  map: MapData;
  pickups: Pickup[];
  starts: [number, number][];
}

/** Pick a monster of a role from a zone (or a washed-up one from another zone). */
function pickMonster(st: { rng: number }, zone: number, role: Role, mix: number, maxZone: number): string {
  let z = zone;
  if (chance(st, mix)) z = randInt(st, 1, Math.max(1, Math.min(8, maxZone)));
  const pool = ZONE_MONSTERS[z] ?? ZONE_MONSTERS[1]!;
  const fit = pool.filter((id) => MONSTERS[id]!.role === role);
  return pick(st, fit.length ? fit : pool);
}

export interface GenOpts {
  scenario: ScenarioDef;
  heroes: number;
  level: number;
  seed: number;
}

const CANVAS_W = 90;
const CANVAS_H = 80;

/** A blobby room around a centre: one big disk plus a few smaller lobes. */
function blob(st: { rng: number }, cx: number, cy: number, radius: number): Set<number> {
  const out = new Set<number>();
  const add = (x: number, y: number, r: number): void => {
    for (const [hx, hy] of hexesWithin(x, y, r)) if (hx > 1 && hy > 1 && hx < CANVAS_W - 2 && hy < CANVAS_H - 2) out.add(key(hx, hy));
  };
  add(cx, cy, radius);
  const lobes = randInt(st, 2, 4);
  for (let i = 0; i < lobes; i++) {
    const d = CUBE_DIRS[randInt(st, 0, 5)]!;
    const dist = randInt(st, Math.max(1, radius - 1), radius + 1);
    const [lx, ly] = fromCube(cubeAdd(toCube(cx, cy), d, dist));
    add(lx, ly, randInt(st, 1, Math.max(2, radius - 1)));
  }
  // nibble the outline so it is never a clean hexagon
  const edge = [...out].filter((k) => {
    const [x, y] = unkey(k);
    return neighbors(x, y).some(([nx, ny]) => !out.has(key(nx, ny)));
  });
  for (const k of edge) if (chance(st, 0.18)) out.delete(k);
  return out;
}

/** Keep only the part of a hex set connected to a start hex. */
function component(set: Set<number>, start: number): Set<number> {
  const out = new Set<number>([start]);
  const q = [start];
  while (q.length) {
    const [x, y] = unkey(q.pop()!);
    for (const [nx, ny] of neighbors(x, y)) {
      const k = key(nx, ny);
      if (set.has(k) && !out.has(k)) {
        out.add(k);
        q.push(k);
      }
    }
  }
  return out;
}

interface Layout {
  rooms: Set<number>[];
  doors: [number, number][];
}

function layout(st: { rng: number }, n: number, big: boolean, bossLast: boolean): Layout {
  for (let attempt = 0; attempt < 40; attempt++) {
    const rooms: Set<number>[] = [];
    const doors: [number, number][] = [];
    const owner = new Map<number, number>();
    const radiusFor = (i: number): number => (big ? randInt(st, 5, 6) : bossLast && i === n - 1 ? randInt(st, 4, 5) : randInt(st, 3, 4));
    const first = blob(st, Math.floor(CANVAS_W / 2), Math.floor(CANVAS_H / 2), radiusFor(0));
    rooms.push(first);
    for (const k of first) owner.set(k, 0);
    let ok = true;
    for (let i = 1; i < n && ok; i++) {
      const parent = rooms[i - 1]!;
      // general heading: away from the rooms placed so far
      let mx = 0;
      let my = 0;
      for (const r of rooms)
        for (const k of r) {
          const [x, y] = unkey(k);
          mx += x;
          my += y;
        }
      const total = rooms.reduce((a, r) => a + r.size, 0);
      mx /= total;
      my /= total;
      const edges = shuffle(
        st,
        [...parent].filter((k) => {
          const [x, y] = unkey(k);
          return neighbors(x, y).some(([nx, ny]) => !owner.has(key(nx, ny)));
        }),
      );
      // prefer edges far from the middle of everything so far
      edges.sort((a, b) => {
        const [ax, ay] = unkey(a);
        const [bx, by] = unkey(b);
        return Math.hypot(bx - mx, by - my) - Math.hypot(ax - mx, ay - my) + (rand(st) - 0.5) * 6;
      });
      let placed = false;
      for (const bk of edges.slice(0, 24)) {
        const [bx, by] = unkey(bk);
        for (let di = 0; di < 6 && !placed; di++) {
          const dir = CUBE_DIRS[di]!;
          const [dx, dy] = fromCube(cubeAdd(toCube(bx, by), dir));
          const dk = key(dx, dy);
          if (owner.has(dk)) continue;
          // the door hex may only touch the parent room (and the new room)
          if (neighbors(dx, dy).some(([nx, ny]) => owner.has(key(nx, ny)) && owner.get(key(nx, ny)) !== i - 1)) continue;
          const [ex, ey] = fromCube(cubeAdd(toCube(bx, by), dir, 2));
          const ek = key(ex, ey);
          if (owner.has(ek) || neighbors(ex, ey).some(([nx, ny]) => owner.has(key(nx, ny)))) continue;
          const r = radiusFor(i);
          const [cx, cy] = fromCube(cubeAdd(toCube(bx, by), dir, 2 + r));
          const raw = blob(st, cx, cy, r);
          raw.add(ek);
          // keep a one-hex wall between rooms
          for (const k of [...raw]) {
            const [x, y] = unkey(k);
            if (owner.has(k) || k === dk || neighbors(x, y).some(([nx, ny]) => owner.has(key(nx, ny)))) raw.delete(k);
          }
          if (!raw.has(ek)) continue;
          const room = component(raw, ek);
          if (room.size < (big ? 40 : 22)) continue;
          rooms.push(room);
          for (const k of room) owner.set(k, i);
          doors.push([dx, dy]);
          placed = true;
        }
        if (placed) break;
      }
      if (!placed) ok = false;
    }
    if (ok) return { rooms, doors };
  }
  // fallback: one big room (never reached in tests, but never crash)
  const only = blob(st, Math.floor(CANVAS_W / 2), Math.floor(CANVAS_H / 2), 6);
  return { rooms: [only], doors: [] };
}

export function generate(o: GenOpts): Generated {
  const st = { rng: o.seed | 0 };
  const sc = o.scenario;
  const survive = sc.objective.kind === 'survive';
  const lay = layout(st, Math.max(1, Math.min(6, sc.rooms + (survive ? 0 : 1))), survive, sc.objective.kind === 'boss');
  const n = lay.rooms.length;

  // crop to the rooms plus a two-hex margin (keep row parity even so offsets stay valid)
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of lay.rooms)
    for (const k of r) {
      const [x, y] = unkey(k);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  x0 -= 2;
  y0 -= 2;
  if (y0 % 2) y0 -= 1;
  const W = x1 - x0 + 3;
  const H = y1 - y0 + 3;
  const mapKey = (x: number, y: number): [number, number] => [x - x0, y - y0];
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => ' '));
  const room = new Array<number>(W * H).fill(-1);
  const roomTiles: [number, number][][] = lay.rooms.map(() => []);
  lay.rooms.forEach((r, i) => {
    for (const k of r) {
      const [x, y] = mapKey(...unkey(k));
      grid[y]![x] = '.';
      room[y * W + x] = i;
      roomTiles[i]!.push([x, y]);
    }
  });
  const doors = lay.doors.map(([x, y]) => mapKey(x, y));
  for (const [x, y] of doors) grid[y]![x] = 'D';
  // walls around every room
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (grid[y]![x] !== ' ') continue;
      if (neighbors(x, y).some(([nx, ny]) => grid[ny]?.[nx] === '.' || grid[ny]?.[nx] === 'D')) grid[y]![x] = '#';
    }

  const zoneFor = (i: number): number => (sc.zone === 9 ? (i === n - 1 ? 8 : randInt(st, 1, 8)) : sc.zone);
  const rooms: RoomInfo[] = roomTiles.map((t, i) => {
    const xs = t.map((p) => p[0]);
    const ys = t.map((p) => p[1]);
    const rx = Math.min(...xs) - 1;
    const ry = Math.min(...ys) - 1;
    return { x: rx, y: ry, w: Math.max(...xs) - rx + 2, h: Math.max(...ys) - ry + 2, revealed: i === 0, zone: zoneFor(i), spawns: [] };
  });

  const floorsOf = (i: number): [number, number][] => roomTiles[i]!.filter(([x, y]) => grid[y]![x] === '.');
  const nearDoor = (x: number, y: number, d = 1): boolean => doors.some(([dx, dy]) => hexDist(dx, dy, x, y) <= d);

  // hero starts: a tight group in room 0, as far from its door as possible
  const exit0 = doors[0] ?? roomTiles[0]![0]!;
  const far0 = floorsOf(0).sort((a, b) => hexDist(b[0], b[1], exit0[0], exit0[1]) - hexDist(a[0], a[1], exit0[0], exit0[1]))[0]!;
  const starts = floorsOf(0)
    .sort((a, b) => hexDist(a[0], a[1], far0[0], far0[1]) - hexDist(b[0], b[1], far0[0], far0[1]))
    .slice(0, 4);
  const reserved = new Set(starts.map(([x, y]) => key(x, y)));

  // connectivity over walkable hexes (obstacles block)
  const connected = (): boolean => {
    let first: [number, number] | null = null;
    let total = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = grid[y]![x]!;
        if (c !== '#' && c !== ' ' && c !== 'o') {
          total++;
          first ??= [x, y];
        }
      }
    if (!first) return false;
    const seen = new Set<number>([key(first[0], first[1])]);
    const q = [first];
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [nx, ny] of neighbors(x, y)) {
        const c = grid[ny]?.[nx];
        if (!c || c === '#' || c === ' ' || c === 'o') continue;
        const k = key(nx, ny);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    return seen.size === total;
  };

  // dressing: obstacles (zone props), hazards, difficult ground, traps
  for (let i = 0; i < n; i++) {
    const tiles = shuffle(st, floorsOf(i)).filter(([x, y]) => !nearDoor(x, y, 1) && !reserved.has(key(x, y)));
    const area = tiles.length;
    const want: [string, number][] = [
      ['o', Math.round(area / 10) + randInt(st, 0, 2)],
      ['~', Math.round(area / 24) + randInt(st, 0, 2)],
      [',', Math.round(area / 18) + randInt(st, 0, 2)],
      ['T', chance(st, 0.45) ? randInt(st, 1, 2) : 0],
    ];
    let idx = 0;
    for (const [c, count] of want) {
      let placed = 0;
      while (placed < count && idx < tiles.length) {
        const [x, y] = tiles[idx++]!;
        if (grid[y]![x] !== '.') continue;
        grid[y]![x] = c;
        if (c === 'o' && !connected()) {
          grid[y]![x] = '.';
          continue;
        }
        // hazards and rubble come in patches
        if ((c === '~' || c === ',') && chance(st, 0.6)) {
          for (const [nx, ny] of neighbors(x, y)) {
            if (!chance(st, 0.35)) continue;
            if (grid[ny]?.[nx] === '.' && room[ny * W + nx] === i && !nearDoor(nx, ny, 1) && !reserved.has(key(nx, ny))) grid[ny]![nx] = c;
          }
        }
        placed++;
      }
    }
  }

  // exit for escape scenarios: the last room's hex farthest from its entry door
  if (sc.objective.kind === 'escape') {
    const entry = doors[n - 2] ?? exit0;
    const far = floorsOf(n - 1).sort((a, b) => hexDist(b[0], b[1], entry[0], entry[1]) - hexDist(a[0], a[1], entry[0], entry[1]))[0];
    if (far) grid[far[1]]![far[0]] = 'X';
  }

  // monsters
  const heroes = Math.max(1, Math.min(4, o.heroes));
  const eliteP = Math.min(0.55, 0.1 + 0.06 * o.level + (heroes >= 3 ? 0.08 : 0));
  const maxZone = sc.zone === 9 ? 8 : Math.max(sc.zone, sc.depth);
  const taken = new Set<number>(reserved);
  const spawnTiles = (i: number, entry: [number, number] | null): [number, number][] => {
    let t = floorsOf(i).filter(([x, y]) => !taken.has(key(x, y)));
    if (entry) t = t.filter(([x, y]) => hexDist(x, y, entry[0], entry[1]) >= 3);
    t = shuffle(st, t);
    if (entry) t.sort((a, b) => hexDist(b[0], b[1], entry[0], entry[1]) - hexDist(a[0], a[1], entry[0], entry[1]));
    return t;
  };
  const place = (i: number, ids: string[], entry: [number, number] | null, elites: boolean): void => {
    const tiles = spawnTiles(i, entry);
    for (const id of ids) {
      const def = MONSTERS[id];
      const pieces = def?.pieces ?? 1;
      const elite = elites && !def?.boss && chance(st, eliteP);
      // a pack stands together: pieces after the first take the nearest free hex to it
      let anchor: [number, number] | null = null;
      for (let p = 0; p < pieces; p++) {
        let j: number;
        if (anchor) {
          const a = anchor;
          j = tiles.reduce((best, tt, k) => (hexDist(tt[0], tt[1], a[0], a[1]) < hexDist(tiles[best]![0], tiles[best]![1], a[0], a[1]) ? k : best), 0);
        } else j = Math.floor(rand(st) * Math.max(1, Math.min(tiles.length, Math.ceil(tiles.length / 2))));
        const tt = tiles.splice(j, 1)[0];
        if (!tt) return;
        anchor ??= tt;
        taken.add(key(tt[0], tt[1]));
        rooms[i]!.spawns.push({ monster: id, x: tt[0], y: tt[1], elite: pieces > 1 ? false : elite } as Spawn);
      }
    }
  };
  const encounter = (zone: number, scale: number): string[] => {
    const tpl = pick(st, TEMPLATES);
    let count = heroes <= 1 ? 2 : heroes === 2 ? 3 : heroes === 3 ? 4 : 5;
    count = Math.max(1, Math.round(count * scale));
    const roles: Role[] = [];
    for (let k = 0; k < count; k++) roles.push(tpl[k % tpl.length]!);
    return roles.map((r) => pickMonster(st, zone, r, sc.mix, maxZone));
  };

  const destroy = sc.objective.kind === 'destroy' ? sc.objective : null;
  let destroyLeft = destroy?.count ?? 0;
  for (let i = 0; i < n; i++) {
    const entry = i === 0 ? null : doors[i - 1]!;
    const z = rooms[i]!.zone;
    const last = i === n - 1;
    if (sc.objective.kind === 'boss' && last) {
      place(i, [sc.objective.boss], entry, false);
      place(i, encounter(z, 0.5), entry, true);
      continue;
    }
    if (survive && i > 0) {
      place(i, encounter(z, 0.6), entry, true);
      continue;
    }
    const scale = i === 0 ? (survive ? 0.6 : 0.7) : 1;
    const ids = encounter(z, scale);
    if (destroy && i > 0 && destroyLeft > 0) {
      const share = last ? destroyLeft : Math.max(1, Math.ceil(destroyLeft / (n - i)));
      for (let k = 0; k < share; k++) ids.unshift(destroy.monster);
      destroyLeft -= share;
    }
    place(i, ids, entry, i > 0);
  }
  if (destroyLeft > 0) place(n - 1, Array.from({ length: destroyLeft }, () => destroy!.monster), doors[n - 2] ?? null, false);

  // pickups: coins and chests
  const pickups: Pickup[] = [];
  for (let i = 0; i < n; i++) {
    const free = shuffle(st, floorsOf(i).filter(([x, y]) => !taken.has(key(x, y))));
    const coins = randInt(st, 1, 3);
    for (let c = 0; c < coins && free.length; c++) {
      const [x, y] = free.pop()!;
      pickups.push({ x, y, kind: 'coin' });
    }
    if (i > 0 && free.length && chance(st, 0.5)) {
      const [x, y] = free.pop()!;
      const items = Object.values(ITEMS).filter((it) => it.depth <= sc.depth);
      if (chance(st, 0.3) && items.length) pickups.push({ x, y, kind: 'chest', item: pick(st, items).id });
      else pickups.push({ x, y, kind: 'chest', gold: 5 + sc.depth * 3 + randInt(st, 0, 5) });
    }
  }

  const map: MapData = { w: W, h: H, tiles: grid.map((r) => r.join('')), room, rooms, zone: sc.zone };
  return { map, pickups, starts };
}
