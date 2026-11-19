// Spending an element is the player's choice: a step that could spend one asks first, and "keep it" leaves it up.
import { describe, expect, it } from 'vitest';
import { CLASS_CARDS } from '../src/data/cards';
import { SCENARIOS } from '../src/data/story';
import { act, createCombat, heroPrompt, tick, type HeroSetup } from '../src/game/rules';
import type { CombatState, HeroUnit } from '../src/game/types';

const ashes = CLASS_CARDS.occultist!.find((c) => c.name === 'Ashes on the Brow')!; // top: Heal 2 self (Holy: +2 Heal), Shield 1
const other = CLASS_CARDS.occultist!.find((c) => c.level === 1 && c.id !== ashes.id)!;

function turn(holy: 0 | 1 | 2): { s: CombatState; h: HeroUnit } {
  const setup: HeroSetup = { owner: 'p', charId: 'o', name: 'Occ', cls: 'occultist', level: 1, maxHp: 10, cards: [ashes.id, other.id], items: [], perks: [] };
  const s = createCombat(SCENARIOS[0]!, [setup], 1, 7);
  const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
  expect(act(s, 'p', { t: 'pick', uid: h.uid, cards: [ashes.id, other.id] })).toBeNull();
  for (let i = 0; i < 80 && !(s.heroTurn?.uid === h.uid && s.heroTurn.started); i++) tick(s);
  h.hp = 4;
  s.elements.holy = holy;
  expect(act(s, 'p', { t: 'half', uid: h.uid, card: ashes.id, half: 'top', basic: false })).toBeNull();
  return { s, h };
}

describe('spending elements', () => {
  it('asks before spending, and keeping it leaves the element up', () => {
    const { s, h } = turn(2);
    const p = heroPrompt(s)!;
    expect(p.kind).toBe('element');
    expect(p.els).toEqual(['holy']);
    expect(h.hp).toBe(4); // nothing happens until the player answers
    expect(act(s, 'p', { t: 'skip', uid: h.uid })).toMatch(/element/);
    expect(act(s, 'p', { t: 'useEl', uid: h.uid, el: 'fire' })).toMatch(/not available/);
    expect(act(s, 'p', { t: 'useEl', uid: h.uid, el: null })).toBeNull();
    expect(s.elements.holy).toBe(2);
    expect(h.hp).toBe(6); // Heal 2, no bonus
    expect(h.shield).toBe(1);
  });

  it('spends it for the bonus when the player says so', () => {
    const { s, h } = turn(1);
    expect(heroPrompt(s)!.kind).toBe('element');
    expect(act(s, 'p', { t: 'useEl', uid: h.uid, el: 'holy' })).toBeNull();
    expect(s.elements.holy).toBe(0);
    expect(h.hp).toBe(8); // Heal 2 +2
    // and the choice can still be taken back with the card
    expect(s.undo).toBeTruthy();
    expect(act(s, 'p', { t: 'undo', uid: h.uid })).toBeNull();
    expect(s.elements.holy).toBe(1);
    expect(s.units.find((u) => u.uid === h.uid)!.hp).toBe(4); // undo restores fresh unit objects
  });

  it('does not ask when the element is not up', () => {
    const { s, h } = turn(0);
    expect(heroPrompt(s)?.kind).not.toBe('element');
    expect(h.hp).toBe(6);
  });
});
