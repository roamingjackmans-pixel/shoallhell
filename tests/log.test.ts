// The battle log keeps only its newest lines; every line still gets a new running number so the panel can redraw.
import { expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { createCombat, log } from '../src/game/rules';

it('numbers log lines past the cap', () => {
  const s = createCombat(SCENARIOS[0]!, [{ owner: 'p', charId: 'k', name: 'K', cls: 'knight', level: 1, maxHp: 10, cards: [], items: [], perks: [] }], 1, 1);
  for (let i = 0; i < 300; i++) log(s, `line ${i}`);
  expect(s.log.length).toBe(120);
  expect(s.log.at(-1)!.t).toBe('line 299');
  expect(s.log.at(-1)!.n).toBe(s.logSeq);
  expect(s.log.at(-1)!.n!).toBeGreaterThan(300);
});
