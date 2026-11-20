// Recover: take back lost cards of your choice (up to the number on the card).
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { act, createCombat, heroPrompt, tick, type HeroSetup } from '../src/game/rules';
import type { HeroUnit } from '../src/game/types';

const CARDS = ['scholar_bookmark', 'scholar_footnote', 'scholar_kindling_chapter', 'scholar_study_break', 'scholar_dry_reading', 'scholar_line_of_inquiry'];

function bookmarkTurn(lost: string[]) {
  const setup: HeroSetup = { owner: 'p', charId: 's', name: 'S', cls: 'scholar', level: 1, maxHp: 8, cards: CARDS, items: [], perks: [] };
  const s = createCombat(SCENARIOS[0]!, [setup], 1, 4);
  const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
  h.hand = h.hand.filter((c) => !lost.includes(c));
  h.lost = [...lost];
  expect(act(s, 'p', { t: 'pick', uid: h.uid, cards: ['scholar_bookmark', 'scholar_footnote'] })).toBeNull();
  for (let i = 0; i < 80 && !(s.heroTurn?.uid === h.uid && s.heroTurn.started); i++) tick(s);
  // Bookmark bottom: Recover 2 (lost)
  expect(act(s, 'p', { t: 'half', uid: h.uid, card: 'scholar_bookmark', half: 'bot', basic: false })).toBeNull();
  return { s, h };
}

describe('recover', () => {
  it('takes back the lost cards you choose, up to its number', () => {
    const { s, h } = bookmarkTurn(['scholar_study_break', 'scholar_dry_reading', 'scholar_line_of_inquiry']);
    expect(heroPrompt(s)?.step?.t).toBe('recover');
    expect(act(s, 'p', { t: 'recover', uid: h.uid, cards: ['scholar_study_break', 'scholar_dry_reading', 'scholar_line_of_inquiry'] })).toMatch(/at most 2/);
    expect(act(s, 'p', { t: 'recover', uid: h.uid, cards: ['scholar_footnote'] })).toMatch(/lost pile/);
    expect(act(s, 'p', { t: 'recover', uid: h.uid, cards: ['scholar_dry_reading', 'scholar_line_of_inquiry'] })).toBeNull();
    expect(h.lost).toEqual(['scholar_study_break']);
    expect(h.hand).toEqual(expect.arrayContaining(['scholar_dry_reading', 'scholar_line_of_inquiry']));
    expect(heroPrompt(s)?.step?.t).not.toBe('recover');
  });

  it('with nothing lost there is nothing to choose', () => {
    const { s } = bookmarkTurn([]);
    expect(heroPrompt(s)?.step?.t).not.toBe('recover');
    expect(s.log.some((l) => /no lost cards to recover/.test(l.t))).toBe(true);
  });
});
