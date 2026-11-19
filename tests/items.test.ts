// Gary's stock: item effects are data, every item does something, and new stock arrives Depth by Depth.
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/data/items';
import { SCENARIOS } from '../src/data/story';
import { camp, makeCharacter, maxHp, newProfile, shopDepth, buyItem } from '../src/game/campaign';
import { act, createCombat, tick, type HeroSetup } from '../src/game/rules';
import type { CombatState, HeroUnit } from '../src/game/types';

function myTurn(items: string[]): { s: CombatState; h: HeroUnit } {
  const setup: HeroSetup = { owner: 'p', charId: 'k', name: 'K', cls: 'knight', level: 1, maxHp: 10, cards: ['knight_charge_the_line', 'knight_tabard_of_faith', 'knight_shield_bash', 'knight_riposte'], items, perks: [] };
  const s = createCombat(SCENARIOS[0]!, [setup], 1, 3);
  const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
  expect(act(s, 'p', { t: 'pick', uid: h.uid, cards: ['knight_charge_the_line', 'knight_tabard_of_faith'] })).toBeNull();
  for (let i = 0; i < 80 && !(s.heroTurn?.uid === h.uid && s.heroTurn.started); i++) tick(s);
  return { s, h };
}

describe('items', () => {
  it('every item has an effect, a price and a Depth', () => {
    expect(Object.keys(ITEMS).length).toBeGreaterThanOrEqual(45);
    for (const it of Object.values(ITEMS)) {
      expect(Object.keys(it.fx).length, it.id).toBeGreaterThan(0);
      expect(it.depth, it.id).toBeGreaterThanOrEqual(1);
      expect(it.depth, it.id).toBeLessThanOrEqual(9);
      expect(it.use === 'passive' ? !it.when : !!it.when, it.id).toBe(true);
    }
    // stock grows on the way down: something new at every Depth
    for (let d = 1; d <= 9; d++) expect(Object.values(ITEMS).some((it) => it.depth === d), `depth ${d}`).toBe(true);
  });

  it('work in a fight from their data', () => {
    const { s, h } = myTurn(['storm_coat', 'boathook', 'smelling_salts', 'toolbox', 'pressure_valve']);
    expect(act(s, 'p', { t: 'item', uid: h.uid, item: 'storm_coat' })).toBeNull();
    expect(h.shield).toBe(1);
    expect(h.retaliate).toBe(3);
    expect(act(s, 'p', { t: 'item', uid: h.uid, item: 'boathook' })).toBeNull();
    expect(h.next).toMatchObject({ atk: 1, push: 2 });
    h.conds = ['poison', 'muddle'];
    expect(act(s, 'p', { t: 'item', uid: h.uid, item: 'smelling_salts' })).toBeNull();
    expect(h.conds).toEqual(['strengthen']);
    expect(act(s, 'p', { t: 'item', uid: h.uid, item: 'pressure_valve' })).toBeNull();
    expect(s.infusedNow).toEqual(expect.arrayContaining(['fire', 'magic']));
    // the toolbox refreshes the others
    expect(act(s, 'p', { t: 'item', uid: h.uid, item: 'toolbox' })).toBeNull();
    expect(h.items.find((i) => i.id === 'storm_coat')!.state).toBe('ready');
    expect(h.items.find((i) => i.id === 'toolbox')!.state).toBe('consumed');
    // move items only while moving
    const t2 = myTurn(['tide_boots']);
    expect(act(t2.s, 'p', { t: 'item', uid: t2.h.uid, item: 'tide_boots' })).toMatch(/moving/);
  });

  it('can be used on a long rest turn', () => {
    const setup: HeroSetup = { owner: 'p', charId: 'k', name: 'K', cls: 'knight', level: 1, maxHp: 10, cards: ['knight_charge_the_line', 'knight_tabard_of_faith', 'knight_shield_bash', 'knight_riposte'], items: ['plate', 'potion_heal', 'boots'], perks: [] };
    const s = createCombat(SCENARIOS[0]!, [setup], 1, 3);
    const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
    h.discard.push(h.hand.pop()!, h.hand.pop()!);
    h.hp = 3;
    expect(act(s, 'p', { t: 'longRest', uid: h.uid })).toBeNull();
    for (let i = 0; i < 80 && !(s.heroTurn?.uid === h.uid && s.heroTurn.started); i++) tick(s);
    expect(s.heroTurn?.uid).toBe(h.uid);
    expect(act(s, 'p', { t: 'item', uid: h.uid, item: 'plate' })).toBeNull();
    expect(h.shield).toBe(2);
    expect(act(s, 'p', { t: 'item', uid: h.uid, item: 'potion_heal' })).toBeNull();
    expect(h.hp).toBe(6);
    expect(act(s, 'p', { t: 'item', uid: h.uid, item: 'boots' })).toMatch(/moving/);
    // finishing the rest refreshes spent items (the consumed potion stays used)
    expect(act(s, 'p', { t: 'restLose', uid: h.uid, card: h.discard[0]! })).toBeNull();
    expect(h.items.find((i) => i.id === 'plate')!.state).toBe('ready');
    expect(h.items.find((i) => i.id === 'potion_heal')!.state).toBe('consumed');
  });

  it('worn items raise max HP; Gary stocks by Depth and prosperity', () => {
    const k = makeCharacter('K', 'knight');
    const base = maxHp(k);
    k.gold = 999;
    buyItem(k, 'jumper'); // body, +3
    buyItem(k, 'hardhat'); // head, +2
    expect(maxHp(k)).toBe(base + 5);
    buyItem(k, 'diving_helmet'); // head is taken: into the bag, so no bonus
    expect(maxHp(k)).toBe(base + 5);

    const kk = camp(newProfile('T'));
    expect(shopDepth(kk)).toBe(1);
    kk.donated = 300;
    expect(shopDepth(kk)).toBe(4);
  });
});
