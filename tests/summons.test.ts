// Summons: Gary heals the most hurt ally nearby, or himself when nobody needs it; the turn order and hover panel
// describe what each summon does.
import { describe, expect, it } from 'vitest';
import { CLASS_CARDS } from '../src/data/cards';
import { SUMMONS } from '../src/data/monsters';
import { SCENARIOS } from '../src/data/story';
import { act, createCombat, summonActions, tick, type HeroSetup } from '../src/game/rules';
import type { CombatState, HeroUnit, SummonUnit } from '../src/game/types';

const garyCard = CLASS_CARDS.nobody!.find((c) => c.name === 'Gary Owes Rent')!.id;

function withGary(): { s: CombatState; h: HeroUnit; g: SummonUnit } {
  const others = CLASS_CARDS.nobody!.filter((c) => c.level === 1 && c.id !== garyCard).slice(0, 5).map((c) => c.id);
  const setup: HeroSetup = { owner: 'p', charId: 'n', name: 'Joe', cls: 'nobody', level: 1, maxHp: 8, cards: [garyCard, ...others], items: [], perks: [] };
  const s = createCombat(SCENARIOS[0]!, [setup], 1, 21);
  const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
  expect(act(s, 'p', { t: 'pick', uid: h.uid, cards: [garyCard, others[0]!] })).toBeNull();
  for (let i = 0; i < 80 && !(s.heroTurn?.uid === h.uid && s.heroTurn.started); i++) tick(s);
  expect(act(s, 'p', { t: 'half', uid: h.uid, card: garyCard, half: 'top', basic: false })).toBeNull();
  const g = s.units.find((u): u is SummonUnit => u.kind === 'summon')!;
  expect(g).toBeTruthy();
  return { s, h, g };
}

/** Run until Gary's next turn has happened. */
function untilGaryActs(s: CombatState, h: HeroUnit): void {
  for (let i = 0; i < 400 && !s.log.some((l) => /patches/.test(l.t)); i++) {
    if (s.phase === 'select' && !h.ready) act(s, 'p', { t: 'pick', uid: h.uid, cards: [h.hand[0]!, h.hand[1]!] });
    else if (s.heroTurn?.uid === h.uid && s.heroTurn.started) act(s, 'p', s.heroTurn.cur ? { t: 'skip', uid: h.uid } : { t: 'half', uid: h.uid, card: h.picked.find((c) => !s.heroTurn!.used.some((u) => u.card === c))!, half: s.heroTurn.used[0]?.half === 'top' ? 'bot' : 'top', basic: true });
    else tick(s);
  }
}

describe('Gary', () => {
  it('patches himself up when no ally nearby needs it', () => {
    const { s, h, g } = withGary();
    h.hp = h.maxHp;
    g.hp = g.maxHp - 3;
    for (const m of s.units) if (m.kind === 'monster') m.dead = true; // nothing to hurt anyone meanwhile
    untilGaryActs(s, h);
    expect(s.log.some((l) => /patches himself up \(\+2\)/.test(l.t))).toBe(true);
    expect(g.hp).toBe(g.maxHp - 1);
  });

  it('still heals a hurt ally first', () => {
    const { s, h, g } = withGary();
    h.hp = h.maxHp - 4;
    g.hp = g.maxHp - 3;
    h.x = g.x; // keep the hero within 2 of Gary
    h.y = g.y + 1;
    for (const m of s.units) if (m.kind === 'monster') m.dead = true;
    untilGaryActs(s, h);
    expect(s.log.some((l) => /patches up Joe/.test(l.t))).toBe(true);
    expect(g.hp).toBe(g.maxHp - 3);
  });

  it('says what it does', () => {
    expect(summonActions(SUMMONS.gary!).short).toBe('Heal 2 · Shield 1');
    expect(summonActions(SUMMONS.gary!).lines[0]).toMatch(/or itself/);
  });
});
