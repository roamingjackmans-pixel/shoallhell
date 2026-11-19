// Gloomhaven: a scenario is won at the end of the round its goal is met in. Whoever killed the last enemy finishes their
// turn, and everyone after them in the initiative order still gets theirs.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { act, checkEnd, createCombat, tick, type HeroSetup } from '../src/game/rules';
import type { CombatState, HeroUnit } from '../src/game/types';

const hero = (charId: string, name: string): HeroSetup => ({
  owner: 'p',
  charId,
  name,
  cls: 'knight',
  level: 1,
  maxHp: 10,
  cards: ['knight_charge_the_line', 'knight_tabard_of_faith', 'knight_shield_bash', 'knight_riposte'],
  items: [],
  perks: [],
});

/** Play the current hero's turn: Tabard of Faith bottom, then the other card's top, skipping anything that asks. */
function playTurn(s: CombatState, h: HeroUnit): void {
  const other = h.picked.find((c) => c !== 'knight_tabard_of_faith')!;
  expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'knight_tabard_of_faith', half: 'bot', basic: false })).toBeNull();
  for (let i = 0; i < 10 && s.heroTurn?.cur; i++) act(s, 'p', { t: 'skip', uid: h.uid });
  expect(act(s, 'p', { t: 'half', uid: h.uid, card: other, half: 'top', basic: false })).toBeNull();
  for (let i = 0; i < 10 && s.heroTurn?.uid === h.uid && s.heroTurn.cur; i++) act(s, 'p', { t: 'skip', uid: h.uid });
}

describe('the last kill', () => {
  it('lets the round play out before the scenario is won', () => {
    const sc = SCENARIOS.find((x) => x.objective.kind === 'clear')!;
    const s = createCombat(sc, [hero('a', 'First'), hero('b', 'Second')], 1, 5);
    const [a, b] = s.units.filter((u): u is HeroUnit => u.kind === 'hero') as [HeroUnit, HeroUnit];
    // First picks the faster lead card, so they act first
    expect(act(s, 'p', { t: 'pick', uid: a.uid, cards: ['knight_tabard_of_faith', 'knight_shield_bash'] })).toBeNull();
    expect(act(s, 'p', { t: 'pick', uid: b.uid, cards: ['knight_tabard_of_faith', 'knight_riposte'] })).toBeNull();
    const turnOf = (): string | undefined => (s.heroTurn?.started ? s.heroTurn.uid : undefined);
    for (let i = 0; i < 80 && s.phase === 'turns' && !turnOf(); i++) tick(s);
    const first = turnOf() === a.uid ? a : b;
    const second = first === a ? b : a;
    expect(turnOf()).toBe(first.uid);

    // every enemy falls during the first hero's turn
    for (const u of s.units) if (u.kind === 'monster') u.dead = true;
    for (const r of s.map.rooms) r.revealed = true;
    checkEnd(s);
    expect(s.phase).toBe('turns');
    expect(s.goalMet).toBeTruthy();
    const round = s.round;

    playTurn(s, first);
    expect(s.phase).toBe('turns');
    for (let i = 0; i < 80 && s.phase === 'turns' && turnOf() !== second.uid; i++) tick(s);
    expect(turnOf()).toBe(second.uid); // the second hero still gets their turn
    playTurn(s, second);
    for (let i = 0; i < 80 && s.phase === 'turns'; i++) tick(s);
    expect(s.phase).toBe('won');
    expect(s.result?.rounds).toBe(round);
    expect(s.log.some((l) => /Second's turn/.test(l.t)) && s.log.some((l) => /First's turn/.test(l.t))).toBe(true);
  });

  it('still loses at once when every hero is exhausted', () => {
    const s = createCombat(SCENARIOS[0]!, [hero('a', 'Solo')], 1, 5);
    for (const u of s.units) if (u.kind === 'hero') u.exhausted = true;
    checkEnd(s);
    expect(s.phase).toBe('lost');
  });
});
