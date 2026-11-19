// A hero's push: one possible hex happens by itself, several wait for the player's choice, and the card carries on.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { hexDist, key, neighbors } from '../src/game/grid';
import { act, createCombat, pushOptions, tick, type HeroSetup } from '../src/game/rules';
import type { CombatState, HeroUnit, MonsterUnit } from '../src/game/types';

const KNIGHT: HeroSetup = { owner: 'p', charId: 'k', name: 'Ser Test', cls: 'knight', level: 1, maxHp: 10, cards: ['knight_shield_bash', 'knight_charge_the_line'], items: [], perks: [] };

/** An open field with the knight in the middle, one monster next to it, and the knight's turn started. */
function setup(): { s: CombatState; h: HeroUnit; m: MonsterUnit } {
  const s = createCombat(SCENARIOS[0]!, [KNIGHT], 1, 5);
  const W = 21;
  s.map = {
    w: W,
    h: W,
    tiles: Array.from({ length: W }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === W - 1 ? '#' : '.')).join('')),
    room: Array.from({ length: W * W }, () => 0),
    rooms: [{ x: 0, y: 0, w: W, h: W, revealed: true, zone: 1, spawns: [] }],
    zone: 1,
  };
  s.pickups = [];
  const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
  const m = s.units.find((u): u is MonsterUnit => u.kind === 'monster')!;
  s.units = [h, m];
  h.x = 10;
  h.y = 10;
  [m.x, m.y] = neighbors(10, 10)[0]!;
  m.hp = m.maxHp = 99;
  m.stat = { ...m.stat, shield: 0 };
  h.mods = Array.from({ length: 20 }, () => ({ v: 0 })); // no misses
  h.modDiscard = [];
  s.types = [m.monster];
  expect(act(s, 'p', { t: 'pick', uid: h.uid, cards: ['knight_shield_bash', 'knight_charge_the_line'] })).toBeNull();
  for (let i = 0; i < 40 && !(s.heroTurn?.uid === h.uid && s.heroTurn.started); i++) tick(s);
  expect(s.heroTurn?.uid).toBe(h.uid);
  return { s, h, m };
}

describe('pushing', () => {
  it('asks the player when the enemy could go several ways, then carries on with the card', () => {
    const { s, h, m } = setup();
    // Shield Bash top: Attack 3, Push 1
    expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'knight_shield_bash', half: 'top', basic: false })).toBeNull();
    expect(act(s, 'p', { t: 'target', uid: h.uid, target: m.uid })).toBeNull();
    const opts = pushOptions(s);
    expect(opts.length).toBe(3);
    for (const [x, y] of opts) expect(hexDist(x, y, h.x, h.y)).toBe(2);
    // nothing else until the push is decided
    expect(act(s, 'p', { t: 'skip', uid: h.uid })).not.toBeNull();
    expect(act(s, 'p', { t: 'push', uid: h.uid, x: h.x, y: h.y })).not.toBeNull();
    const [x, y] = opts[2]!;
    expect(act(s, 'p', { t: 'push', uid: h.uid, x, y })).toBeNull();
    expect([m.x, m.y]).toEqual([x, y]);
    expect(s.pushQ ?? []).toEqual([]);
    // the half is finished and the turn carries on to the other card
    expect(s.heroTurn?.used.map((u) => u.card)).toEqual(['knight_shield_bash']);
    expect(s.heroTurn?.cur).toBeNull();
  });

  it('pushes by itself when only one hex works', () => {
    const { s, h, m } = setup();
    // block two of the three escape hexes
    const opts0 = neighbors(m.x, m.y).filter(([x, y]) => hexDist(x, y, h.x, h.y) === 2);
    const blocked = new Set(opts0.slice(0, 2).map(([x, y]) => key(x, y)));
    s.map.tiles = s.map.tiles.map((row, y) => [...row].map((c, x) => (blocked.has(key(x, y)) ? 'o' : c)).join(''));
    const only = opts0[2]!;
    expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'knight_shield_bash', half: 'top', basic: false })).toBeNull();
    expect(act(s, 'p', { t: 'target', uid: h.uid, target: m.uid })).toBeNull();
    expect(s.pushQ ?? []).toEqual([]);
    expect([m.x, m.y]).toEqual(only);
  });
});
