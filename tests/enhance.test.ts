// Enhancements (stickers on cards, Gloomhaven prices) and the Boiler (donations for Bless, prosperity for Gary).
import { describe, expect, it } from 'vitest';
import { card, starterCards } from '../src/data/cards';
import { CLASSES } from '../src/data/classes';
import { SCENARIOS } from '../src/data/story';
import { applyResult, donate, enhanceCard, heroSetup, makeCharacter, newProfile, camp, prosperity, shopDepth, upgradeProfile, type Profile } from '../src/game/campaign';
import { enhancedCard, enhBlocked, enhCost } from '../src/game/enhance';
import { act, createCombat, heroCard, tick, type HeroSetup } from '../src/game/rules';
import type { CombatState, HeroUnit } from '../src/game/types';

describe('enhancement stickers', () => {
  it('apply to the right ability line', () => {
    const c = card('knight_shield_bash'); // top: Attack 3 Push 1
    const e = enhancedCard(c, [
      { half: 'top', step: 0, kind: 'plus1' },
      { half: 'top', step: 0, kind: 'poison' },
      { half: 'bot', step: 0, kind: 'fire' },
    ]);
    expect(e.top.steps[0]).toMatchObject({ t: 'attack', n: 4, push: 1, cond: ['poison'], stickers: ['+1 Attack', 'Poison'] });
    // an element sticker infuses right after its line
    expect(e.bot.steps.map((s) => s.t)).toEqual(['move', 'infuse']);
    expect(e.bot.steps[1]).toMatchObject({ el: 'fire', sticker: true });
    // the card data itself is untouched
    expect(card('knight_shield_bash').top.steps[0]).toMatchObject({ n: 3 });
    expect(card('knight_shield_bash').top.steps[0]!.stickers).toBeUndefined();
  });

  it('price like Gloomhaven', () => {
    const bash = card('knight_shield_bash');
    expect(enhCost(bash, 'top', 0, 'plus1', [])).toBe(50);
    expect(enhCost(bash, 'bot', 0, 'plus1', [])).toBe(30); // move
    expect(enhCost(bash, 'top', 0, 'disarm', [])).toBe(150);
    // the second sticker on a line costs 75 more
    expect(enhCost(bash, 'top', 0, 'wound', [{ half: 'top', step: 0, kind: 'plus1' }])).toBe(75 + 75);
    // abilities that hit several targets cost double
    const sweep = card('knight_longsword_sweep');
    expect(enhCost(sweep, 'top', 0, 'plus1', [])).toBe(100);
  });

  it('respect slots and what a line can take', () => {
    const bash = card('knight_shield_bash');
    const two = [
      { half: 'top' as const, step: 0, kind: 'plus1' as const },
      { half: 'top' as const, step: 0, kind: 'wound' as const },
    ];
    expect(enhBlocked(bash, 'top', 0, 'poison', two)).toMatch(/no free/);
    expect(enhBlocked(bash, 'top', 0, 'range', [])).toMatch(/does not fit/); // melee
    expect(enhBlocked(bash, 'bot', 0, 'jump', [])).toBeNull();
    expect(enhBlocked(bash, 'bot', 0, 'poison', [])).toMatch(/does not fit/);
    expect(enhBlocked(card('knight_tabard_of_faith'), 'top', 1, 'plus1', [])).toMatch(/does not fit/); // infuse line
  });

  it('cost the hero’s gold and stay on the character', () => {
    const k = makeCharacter('K', 'knight');
    k.gold = 60;
    expect(enhanceCard(k, 'knight_shield_bash', 'top', 0, 'plus1')).toBeNull();
    expect(k.gold).toBe(10);
    expect(enhanceCard(k, 'knight_shield_bash', 'bot', 0, 'plus1')).toBe('Not enough gold.');
    expect(enhanceCard(k, 'knight_shield_bash', 'top', 0, 'plus1')).toMatch(/already/);
    expect(enhanceCard(k, 'brute_x', 'top', 0, 'plus1')).toMatch(/Not one of/);
    expect(heroSetup(k, 'me').enh).toEqual({ knight_shield_bash: [{ half: 'top', step: 0, kind: 'plus1' }] });
    expect(heroCard(k, 'knight_shield_bash').top.steps[0]).toMatchObject({ n: 4 });
  });

  it('are used in a fight', () => {
    const play = (enh: HeroSetup['enh']): HeroUnit => {
      const setup: HeroSetup = { owner: 'p', charId: 'k', name: 'K', cls: 'knight', level: 1, maxHp: 10, cards: ['knight_charge_the_line', 'knight_tabard_of_faith', 'knight_shield_bash', 'knight_riposte'], items: [], perks: [], enh };
      const s: CombatState = createCombat(SCENARIOS[0]!, [setup], 1, 11);
      const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
      expect(act(s, 'p', { t: 'pick', uid: h.uid, cards: ['knight_charge_the_line', 'knight_tabard_of_faith'] })).toBeNull();
      for (let i = 0; i < 50 && !(s.heroTurn?.uid === h.uid && s.heroTurn.started); i++) tick(s);
      // Tabard of Faith bottom: Heal 2 self, Shield 1 (Shield +1 sticker → 2)
      expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'knight_tabard_of_faith', half: 'bot', basic: false })).toBeNull();
      expect(JSON.parse(JSON.stringify(s))).toEqual(s); // still plain JSON
      return h;
    };
    expect(play(undefined).shield).toBe(1);
    expect(play({ knight_tabard_of_faith: [{ half: 'bot', step: 1, kind: 'plus1' }] }).shield).toBe(2);
  });
});

describe('the Boiler', () => {
  it('blesses the next scenario and raises prosperity', () => {
    const p = newProfile('T');
    const k = camp(p);
    const c = makeCharacter('K', 'knight');
    k.characters.push(c);
    c.gold = 25;
    expect(donate(k, c)).toBeNull();
    expect(c.gold).toBe(15);
    expect(c.blessed).toBe(2);
    expect(donate(k, c)).toMatch(/Already blessed/);
    // the blessing goes into the modifier deck
    const s = createCombat(SCENARIOS[0]!, [heroSetup(c, 'me')], 1, 3);
    const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
    expect(h.mods.filter((m) => m.temp === 'bless')).toHaveLength(2);
    // and is spent by that scenario, won or lost
    s.phase = 'lost';
    applyResult(p, s, 'me', SCENARIOS[0]!, false);
    expect(c.blessed).toBe(0);
    expect(heroSetup(c, 'me').bless).toBe(0);

    expect(prosperity(k)).toBe(1);
    k.donated = 290;
    expect(prosperity(k)).toBe(3);
    expect(shopDepth(k)).toBe(3);
  });

  it('old saves get the new fields', () => {
    const c = makeCharacter('K', 'knight');
    delete (c as { enh?: unknown }).enh;
    delete (c as { blessed?: unknown }).blessed;
    const p = upgradeProfile({ v: 1, name: 'T', characters: [c] } as unknown as Profile);
    const k = p.campaigns[0]!;
    expect(k.donated).toBe(0);
    expect(k.characters[0]!.enh).toEqual({});
    expect(k.characters[0]!.blessed).toBe(0);
  });

  it('every class starts with three spare cards, and old characters get new starter cards', () => {
    for (const cls of Object.keys(CLASSES)) expect(starterCards(cls), cls).toHaveLength(CLASSES[cls]!.hand + 3);
    const c = makeCharacter('K', 'knight');
    const fresh = [...c.cards];
    c.cards = c.cards.slice(0, 5);
    c.hand = c.cards.slice(0, 3);
    const p = upgradeProfile({ v: 1, name: 'T', characters: [c] } as unknown as Profile);
    const k = p.campaigns[0]!.characters[0]!;
    expect([...k.cards].sort()).toEqual([...fresh].sort());
    expect(k.hand).toHaveLength(3); // their chosen hand is kept
  });
});
