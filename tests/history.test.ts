// Recent games: the last ten finished fights are kept on the account with every hero's stats.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { applyResult, camp, heroSetup, HISTORY_SIZE, makeCharacter, newProfile, upgradeProfile, type Profile } from '../src/game/campaign';
import { createCombat } from '../src/game/rules';
import type { HeroUnit } from '../src/game/types';

describe('recent games', () => {
  it('keeps the newest ten, with every hero', () => {
    const p = newProfile('T');
    const k = camp(p);
    const c = makeCharacter('K', 'knight');
    k.characters.push(c);
    for (let i = 0; i < HISTORY_SIZE + 3; i++) {
      const s = createCombat(SCENARIOS[0]!, [heroSetup(c, 'me'), { ...heroSetup(makeCharacter('Pal', 'brute'), 'friend') }], 1, i + 1);
      const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
      h.stats.dmg = i;
      s.phase = i % 2 ? 'won' : 'lost';
      s.round = i + 2;
      applyResult(p, s, 'me', SCENARIOS[0]!, false);
    }
    expect(p.history).toHaveLength(HISTORY_SIZE);
    const newest = p.history![0]!;
    expect(newest.rounds).toBe(HISTORY_SIZE + 4);
    expect(newest.heroes.map((x) => [x.name, x.mine])).toEqual([
      ['K', true],
      ['Pal', false],
    ]);
    expect(newest.coop).toBe(true);
    expect(newest.heroes[0]!.stats.dmg).toBe(HISTORY_SIZE + 2);
    // the save stays plain JSON
    expect(JSON.parse(JSON.stringify(p.history))).toEqual(p.history);
  });

  it('old saves start with no history', () => {
    const p = upgradeProfile({ v: 1, name: 'T', characters: [] } as unknown as Profile);
    expect(p.history).toEqual([]);
  });
});
