// Taking back a chosen card half: allowed until the hero acts on it, never after an attack has drawn modifier cards.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { neighbors, unkey } from '../src/game/grid';
import { act, createCombat, moveOptions, tick, type HeroSetup } from '../src/game/rules';
import type { CombatState, HeroUnit } from '../src/game/types';

const KNIGHT: HeroSetup = {
  owner: 'p',
  charId: 'k',
  name: 'Ser Test',
  cls: 'knight',
  level: 1,
  maxHp: 10,
  cards: ['knight_charge_the_line', 'knight_tabard_of_faith', 'knight_shield_bash', 'knight_riposte'],
  items: [],
  perks: [],
};

/** A fight where it is the knight's turn with Charge the Line and Tabard of Faith picked. */
function knightsTurn(): { s: CombatState; h: HeroUnit } {
  const s = createCombat(SCENARIOS[0]!, [KNIGHT], 1, 11);
  const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
  expect(act(s, 'p', { t: 'pick', uid: h.uid, cards: ['knight_charge_the_line', 'knight_tabard_of_faith'] })).toBeNull();
  for (let i = 0; i < 50 && !(s.heroTurn?.uid === h.uid && s.heroTurn.started); i++) tick(s);
  expect(s.heroTurn?.uid).toBe(h.uid);
  return { s, h };
}

const board = (s: CombatState): string => JSON.stringify({ ...s, log: [], fx: [], fxId: 0, undo: null });

describe('undo a chosen card half', () => {
  it('puts everything back before the hero acts', () => {
    const { s, h } = knightsTurn();
    const before = board(s);
    // Tabard of Faith bottom: Heal 2 self, Shield 1 — automatic steps, nothing random
    expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'knight_tabard_of_faith', half: 'bot', basic: false })).toBeNull();
    expect(s.undo).toBeTruthy();
    expect(h.shield).toBeGreaterThan(0);
    expect(act(s, 'p', { t: 'undo', uid: h.uid })).toBeNull();
    expect(board(s)).toBe(before);
    expect(s.heroTurn?.used).toEqual([]);
    expect(s.log.at(-1)?.t).toMatch(/takes that card back/);
  });

  it('stays available after a refused action, and is gone once the hero moves', () => {
    const { s, h } = knightsTurn();
    expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'knight_charge_the_line', half: 'bot', basic: false })).toBeNull();
    expect(s.undo).toBeTruthy();
    // a move onto a wall is refused: undo still there
    expect(act(s, 'p', { t: 'move', uid: h.uid, x: 0, y: 0 })).not.toBeNull();
    expect(s.undo).toBeTruthy();
    const hero = s.units.find((u) => u.uid === h.uid) as HeroUnit;
    const [x, y] = unkey(moveOptions(s, hero)[0]!);
    expect(act(s, 'p', { t: 'move', uid: h.uid, x, y })).toBeNull();
    expect(s.undo).toBeFalsy();
    expect(act(s, 'p', { t: 'undo', uid: h.uid })).not.toBeNull();
  });

  it('cannot undo after an attack has drawn modifier cards', () => {
    const { s, h } = knightsTurn();
    const hero = s.units.find((u) => u.uid === h.uid) as HeroUnit;
    // stand a monster next to the knight so the basic Attack 2 has a target
    const mon = s.units.find((u) => u.kind === 'monster' && !u.dead)!;
    const [nx, ny] = neighbors(hero.x, hero.y).find(([x, y]) => '.,'.includes(s.map.tiles[y]![x]!) && !s.units.some((u) => u.x === x && u.y === y && !u.dead))!;
    mon.x = nx;
    mon.y = ny;
    expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'knight_charge_the_line', half: 'top', basic: true })).toBeNull();
    expect(s.undo).toBeTruthy();
    expect(act(s, 'p', { t: 'target', uid: h.uid, target: mon.uid })).toBeNull();
    expect(s.undo).toBeFalsy();
  });

  it('is cleared when the turn passes', () => {
    const { s, h } = knightsTurn();
    expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'knight_charge_the_line', half: 'bot', basic: false })).toBeNull();
    expect(act(s, 'p', { t: 'skip', uid: h.uid })).toBeNull();
    expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'knight_tabard_of_faith', half: 'top', basic: true })).toBeNull();
    if (s.heroTurn?.uid === h.uid) expect(act(s, 'p', { t: 'skip', uid: h.uid })).toBeNull();
    expect(s.heroTurn?.uid === h.uid).toBe(false);
    expect(s.undo).toBeFalsy();
  });
});
