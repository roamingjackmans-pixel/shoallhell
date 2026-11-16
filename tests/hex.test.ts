// Hex grid rules: distance, neighbours, movement range, line of sight, area shapes.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { hexDist, hexesWithin, key, los, neighbors, pixelToHex, hexCenter, reach, landing } from '../src/game/grid';
import { aoeTiles, createCombat, type HeroSetup } from '../src/game/rules';
import type { CombatState } from '../src/game/types';

function openField(): CombatState {
  const setup: HeroSetup = { owner: 'p', charId: 'c', name: 'K', cls: 'knight', level: 1, maxHp: 10, cards: ['knight_shield_bash', 'knight_riposte'], items: [], perks: [] };
  const s = createCombat(SCENARIOS[0]!, [setup], 1, 7);
  const W = 21;
  const H = 21;
  s.map = {
    w: W,
    h: H,
    tiles: Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')).join('')),
    room: Array.from({ length: W * H }, () => 0),
    rooms: [{ x: 0, y: 0, w: W, h: H, revealed: true, zone: 1, spawns: [] }],
    zone: 1,
  };
  s.units = s.units.filter((u) => u.kind === 'hero');
  s.units[0]!.x = 10;
  s.units[0]!.y = 10;
  s.pickups = [];
  return s;
}

describe('hex grid', () => {
  it('has six neighbours at distance one, on both row parities', () => {
    for (const [x, y] of [
      [5, 4],
      [5, 5],
    ] as const) {
      const n = neighbors(x, y);
      expect(new Set(n.map(([a, b]) => key(a, b))).size).toBe(6);
      for (const [a, b] of n) expect(hexDist(x, y, a, b)).toBe(1);
    }
    expect(hexesWithin(10, 10, 3).length).toBe(37);
  });

  it('round-trips hex centres through pixels', () => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const [px, py] = hexCenter(x, y);
        expect(pixelToHex(px, py)).toEqual([x, y]);
      }
  });

  it('a Move 3 on open ground reaches every hex within 3', () => {
    const s = openField();
    const h = s.units[0]!;
    const r = reach(s, h, { max: 3, doors: true });
    expect(landing(s, h, r, 3).length).toBe(36);
  });

  it('walls block line of sight, open ground does not', () => {
    const s = openField();
    expect(los(s.map, 10, 10, 14, 10)).toBe(true);
    const row = s.map.tiles[10]!;
    s.map.tiles[10] = row.slice(0, 12) + '#' + row.slice(13);
    expect(los(s.map, 10, 10, 14, 10)).toBe(false);
  });

  it('area shapes have the right sizes', () => {
    const s = openField();
    const h = s.units[0]!;
    const [ax, ay] = neighbors(h.x, h.y)[0]!;
    const shape = (aoe: string, x = ax, y = ay): number => new Set(aoeTiles(s, h, { t: 'attack', n: 2, range: 0, aoe: aoe as never }, x, y).map(([a, b]) => key(a, b))).size;
    expect(shape('cleave')).toBe(2);
    expect(shape('line3')).toBe(3);
    expect(shape('cone')).toBe(4);
    expect(shape('ring')).toBe(6);
    expect(shape('blast', 14, 10)).toBe(7);
    expect(shape('cross', 14, 10)).toBe(5);
    // a line goes straight out from the hero
    const line = aoeTiles(s, h, { t: 'attack', n: 2, range: 0, aoe: 'line3' }, ax, ay);
    line.forEach(([x, y], i) => expect(hexDist(h.x, h.y, x, y)).toBe(i + 1));
  });
});
