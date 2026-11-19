// Short rests (with the 1 HP reroll) and choosing which cards to lose against a lethal hit.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { act, createCombat, type HeroSetup } from '../src/game/rules';
import type { CombatState, HeroUnit } from '../src/game/types';

const CARDS = ['knight_charge_the_line', 'knight_tabard_of_faith', 'knight_shield_bash', 'knight_riposte', 'knight_hold_the_stairs'];
const KNIGHT: HeroSetup = { owner: 'p', charId: 'k', name: 'Ser Test', cls: 'knight', level: 1, maxHp: 10, cards: CARDS, items: [], perks: [] };

function fight(): { s: CombatState; h: HeroUnit } {
  const s = createCombat(SCENARIOS[0]!, [KNIGHT], 1, 3);
  const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
  return { s, h };
}

describe('short rest', () => {
  it('works with an empty hand, and keeping the drawn card loses it', () => {
    const { s, h } = fight();
    h.discard = [...h.hand];
    h.hand = [];
    expect(act(s, 'p', { t: 'shortRest', uid: h.uid })).toBeNull();
    const drawn = h.restDraw!.card;
    expect(h.discard).toContain(drawn);
    // no picking until the rest is finished
    expect(act(s, 'p', { t: 'longRest', uid: h.uid })).not.toBeNull();
    expect(act(s, 'p', { t: 'restKeep', uid: h.uid })).toBeNull();
    expect(h.lost).toEqual([drawn]);
    expect(h.hand.length).toBe(CARDS.length - 1);
    expect(h.discard).toEqual([]);
    expect(h.restDraw).toBeFalsy();
    expect(act(s, 'p', { t: 'shortRest', uid: h.uid })).not.toBeNull(); // once a round
  });

  it('paying 1 HP keeps the drawn card and loses a different one', () => {
    const { s, h } = fight();
    h.discard = h.hand.splice(0, 4);
    expect(act(s, 'p', { t: 'shortRest', uid: h.uid })).toBeNull();
    const drawn = h.restDraw!.card;
    const hp = h.hp;
    expect(act(s, 'p', { t: 'restReroll', uid: h.uid })).toBeNull();
    expect(h.hp).toBe(hp - 1);
    expect(h.lost.length).toBe(1);
    expect(h.lost[0]).not.toBe(drawn);
    expect(h.hand).toContain(drawn);
    // the reroll is only offered once
    expect(act(s, 'p', { t: 'restReroll', uid: h.uid })).not.toBeNull();
  });

  it('cannot pay with your last hit point', () => {
    const { s, h } = fight();
    h.discard = h.hand.splice(0, 3);
    h.hp = 1;
    expect(act(s, 'p', { t: 'shortRest', uid: h.uid })).toBeNull();
    expect(act(s, 'p', { t: 'restReroll', uid: h.uid })).not.toBeNull();
    expect(act(s, 'p', { t: 'restKeep', uid: h.uid })).toBeNull();
  });
});

describe('blocking a lethal hit', () => {
  it('loses exactly the two discarded cards you choose', () => {
    const { s, h } = fight();
    h.discard = h.hand.splice(0, 3);
    const [a, b, c] = h.discard as [string, string, string];
    const mon = s.units.find((u) => u.kind === 'monster')!;
    s.pending = { kind: 'negate', heroUid: h.uid, dmg: 99, cond: [], push: 0, pull: 0, fromUid: mon.uid, by: 'Test' };
    expect(act(s, 'p', { t: 'negate', uid: h.uid, choice: `discard:${a},${a}` })).not.toBeNull();
    expect(act(s, 'p', { t: 'negate', uid: h.uid, choice: `discard:${a},${c}` })).toBeNull();
    expect(h.lost.sort()).toEqual([a, c].sort());
    expect(h.discard).toEqual([b]);
    expect(h.hp).toBe(h.maxHp);
    expect(s.pending).toBeNull();
  });
});
