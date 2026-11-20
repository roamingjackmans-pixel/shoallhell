// Before the first round heroes choose among six start hexes; ranged attacks at an adjacent target have disadvantage.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { neighbors } from '../src/game/grid';
import { act, createCombat, placing, startOptions, tick, type HeroSetup } from '../src/game/rules';
import type { HeroUnit } from '../src/game/types';

const hero = (charId: string, cls: string, cards: string[]): HeroSetup => ({ owner: 'p', charId, name: charId, cls, level: 1, maxHp: 10, cards, items: [], perks: [] });
const KNIGHT = ['knight_charge_the_line', 'knight_tabard_of_faith', 'knight_shield_bash', 'knight_riposte'];

describe('start hexes', () => {
  it('every mission has six, free ones can be chosen until the first round starts', () => {
    for (const sc of SCENARIOS) {
      const s = createCombat(sc, [hero('a', 'knight', KNIGHT)], 1, 9);
      expect(s.starts, sc.id).toHaveLength(6);
    }
    const s = createCombat(SCENARIOS[0]!, [hero('a', 'knight', KNIGHT), hero('b', 'knight', KNIGHT)], 1, 9);
    const [a, b] = s.units.filter((u): u is HeroUnit => u.kind === 'hero') as [HeroUnit, HeroUnit];
    expect(placing(s)).toBe(true);
    expect(startOptions(s)).toHaveLength(4); // six, two of them taken
    // onto another hero: no; off the start hexes: no
    expect(act(s, 'p', { t: 'place', uid: a.uid, x: b.x, y: b.y })).toMatch(/free start/);
    const off = neighbors(a.x, a.y).find(([x, y]) => !s.starts!.some(([sx, sy]) => sx === x && sy === y))!;
    if (off) expect(act(s, 'p', { t: 'place', uid: a.uid, x: off[0], y: off[1] })).toMatch(/free start/);
    const [tx, ty] = startOptions(s)[0]!;
    expect(act(s, 'p', { t: 'place', uid: a.uid, x: tx, y: ty })).toBeNull();
    expect([a.x, a.y]).toEqual([tx, ty]);
    // still allowed after picking cards, locked once the round begins
    expect(act(s, 'p', { t: 'pick', uid: a.uid, cards: ['knight_charge_the_line', 'knight_tabard_of_faith'] })).toBeNull();
    const [ux, uy] = startOptions(s)[0]!;
    expect(act(s, 'p', { t: 'place', uid: a.uid, x: ux, y: uy })).toBeNull();
    expect(act(s, 'p', { t: 'pick', uid: b.uid, cards: ['knight_charge_the_line', 'knight_tabard_of_faith'] })).toBeNull();
    expect(s.phase).toBe('turns');
    expect(placing(s)).toBe(false);
    expect(act(s, 'p', { t: 'place', uid: a.uid, x: tx, y: ty })).toMatch(/locked/);
  });
});

describe('ranged attacks', () => {
  it('have disadvantage against an adjacent target', () => {
    const cards = ['scholar_footnote', 'scholar_kindling_chapter', 'scholar_dry_reading', 'scholar_study_break'];
    const s = createCombat(SCENARIOS[0]!, [hero('a', 'scholar', cards)], 1, 4);
    const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
    expect(act(s, 'p', { t: 'pick', uid: h.uid, cards: ['scholar_footnote', 'scholar_study_break'] })).toBeNull();
    for (let i = 0; i < 80 && !(s.heroTurn?.uid === h.uid && s.heroTurn.started); i++) tick(s);
    // put a monster right next to the Scholar
    const mon = s.units.find((u) => u.kind === 'monster' && !u.dead)!;
    const spot = neighbors(h.x, h.y).find(([x, y]) => s.map.tiles[y]?.[x] === '.' && !s.units.some((u) => !u.dead && u.x === x && u.y === y))!;
    mon.x = spot[0];
    mon.y = spot[1];
    mon.hp = 99;
    expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'scholar_footnote', half: 'top', basic: false })).toBeNull(); // Attack 2, range 3
    expect(act(s, 'p', { t: 'target', uid: h.uid, target: mon.uid })).toBeNull();
    const line = s.log.map((l) => l.t).find((t) => t.includes('attacks') && t.includes(h.name))!;
    expect(line).toMatch(/disadvantage \(ranged at an adjacent target\)/);
    expect(line.split(' / ').length).toBeGreaterThanOrEqual(2); // two cards drawn
  });
});
