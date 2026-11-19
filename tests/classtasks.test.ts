// Class tasks: two career goals per class, three stages each; every stage is a checkmark, every three a perk.
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/data/classes';
import { CHECKS_PER_PERK, CLASS_TASKS } from '../src/data/classTasks';
import { SCENARIOS } from '../src/data/story';
import { applyResult, camp, checkmarks, heroSetup, makeCharacter, newProfile, recordClassTasks, upgradeProfile, type Profile } from '../src/game/campaign';
import { createCombat } from '../src/game/rules';
import type { HeroUnit } from '../src/game/types';

/** Every stat the engine records for a hero (see bump() and HeroStats in the engine). */
const STATS = ['dmg', 'kills', 'heals', 'infusions', 'rangedKills', 'elitesKilled', 'lost', 'undead', 'attacks', 'hits', 'misses', 'crits', 'bestHit', 'bossDmg', 'condsGiven', 'shoved', 'retDmg', 'summons', 'dmgTaken', 'blocked', 'attacked', 'dodged', 'hazardDmg', 'healed', 'negated', 'shieldGiven', 'elSpent', 'turns', 'halves', 'basics', 'shortRests', 'longRests', 'items', 'moved', 'coins', 'chests'];

describe('class tasks', () => {
  it('every class has two, counting real stats, with rising goals', () => {
    for (const cls of Object.keys(CLASSES)) {
      const ts = CLASS_TASKS[cls];
      expect(ts, cls).toHaveLength(2);
      for (const t of ts!) {
        expect(STATS, `${t.id} counts ${t.stat}`).toContain(t.stat);
        expect(t.goals[0]).toBeLessThan(t.goals[1]);
        expect(t.goals[1]).toBeLessThan(t.goals[2]);
      }
    }
    const ids = Object.values(CLASS_TASKS).flat().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stages become checkmarks, and three checkmarks a perk', () => {
    const k = makeCharacter('K', 'knight'); // The Wall: blocked 10/30/60 · Bites Back: retDmg 8/20/40
    let r = recordClassTasks(k, { blocked: 12 });
    expect(r.stages).toEqual([{ task: 'knight_wall', stage: 1 }]);
    expect(r.perks).toBe(0);
    expect(k.pendingPerks).toBe(0);
    // a big scenario can reach several stages at once
    r = recordClassTasks(k, { blocked: 20, retDmg: 9 });
    expect(r.stages).toEqual([
      { task: 'knight_wall', stage: 2 },
      { task: 'knight_bite', stage: 1 },
    ]);
    expect(checkmarks(k)).toBe(CHECKS_PER_PERK);
    expect(r.perks).toBe(1);
    expect(k.pendingPerks).toBe(1);
    // career totals add up; nothing is counted twice
    expect(k.life).toMatchObject({ blocked: 32, retDmg: 9 });
    r = recordClassTasks(k, {});
    expect(r).toEqual({ stages: [], perks: 0 });
  });

  it('a finished scenario records them for your own heroes', () => {
    const p = newProfile('T');
    const k = camp(p);
    const c = makeCharacter('K', 'brute'); // Crack Skulls: dmg 40/100/200
    k.characters.push(c);
    const s = createCombat(SCENARIOS[0]!, [heroSetup(c, 'me')], 1, 3);
    const h = s.units.find((u): u is HeroUnit => u.kind === 'hero')!;
    h.stats.dmg = 45;
    h.stats.shoved = 6;
    s.phase = 'won';
    const out = applyResult(p, s, 'me', SCENARIOS[0]!, false);
    expect(out.heroes[0]!.checks).toHaveLength(2);
    expect(c.checks).toBe(2);
    expect(c.life?.dmg).toBe(45);
  });

  it('old heroes start with no career totals', () => {
    const c = makeCharacter('K', 'knight');
    delete (c as { life?: unknown }).life;
    delete (c as { checks?: unknown }).checks;
    const p = upgradeProfile({ v: 1, name: 'T', characters: [c] } as unknown as Profile);
    expect(p.campaigns[0]!.characters[0]!.life).toEqual({});
    expect(p.campaigns[0]!.characters[0]!.checks).toBe(0);
  });
});
