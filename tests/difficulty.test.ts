// Two difficulties: Normal (monsters 15% less HP than before) and Hardcore (30% more).
import { describe, expect, it } from 'vitest';
import { monsterDef, monsterStat } from '../src/data/monsters';
import { SCENARIOS } from '../src/data/story';
import { makeCharacter, newCampaign, scenarioLevel, upgradeProfile, type Profile } from '../src/game/campaign';
import { generate, NORMAL_HAZARD_CUT } from '../src/game/procgen';
import { createCombat, type HeroSetup } from '../src/game/rules';
import type { MonsterUnit } from '../src/game/types';

const KNIGHT: HeroSetup = { owner: 'p', charId: 'k', name: 'K', cls: 'knight', level: 1, maxHp: 10, cards: ['knight_charge_the_line', 'knight_tabard_of_faith', 'knight_shield_bash', 'knight_riposte'], items: [], perks: [] };

describe('difficulty', () => {
  it('scales monster health', () => {
    const sc = SCENARIOS.find((x) => x.objective.kind === 'boss')!;
    for (const [d, mult] of [
      ['normal', 0.85],
      ['hardcore', 1.3],
    ] as const) {
      const s = createCombat(sc, [KNIGHT], 2, 5, d);
      expect(s.scenario.difficulty).toBe(d);
      const ms = s.units.filter((u): u is MonsterUnit => u.kind === 'monster');
      expect(ms.length).toBeGreaterThan(0);
      for (const m of ms) {
        const base = monsterStat(monsterDef(m.monster), 2, m.elite, 1).hp;
        expect(m.maxHp, `${d} ${m.monster}`).toBe(Math.max(1, Math.round(base * mult)));
        expect(m.hp).toBe(m.maxHp);
      }
    }
  });

  it('campaigns default to Normal; old saves map Easy/Normal to Normal and Hard to Hardcore', () => {
    expect(newCampaign('x').difficulty).toBe('normal');
    const mk = (d: string): Profile => {
      const k = newCampaign('x');
      (k as { difficulty: string }).difficulty = d;
      k.characters = [makeCharacter('K', 'knight')];
      return { v: 2, name: 'T', classes: [], stats: {}, tasksDone: [], seenPremise: true, campaigns: [k], active: k.id };
    };
    expect(upgradeProfile(mk('easy')).campaigns[0]!.difficulty).toBe('normal');
    expect(upgradeProfile(mk('normal')).campaigns[0]!.difficulty).toBe('normal');
    expect(upgradeProfile(mk('hard')).campaigns[0]!.difficulty).toBe('hardcore');
    expect(upgradeProfile(mk('hardcore')).campaigns[0]!.difficulty).toBe('hardcore');
    // difficulty no longer moves the scenario level
    expect(scenarioLevel([3, 3], 4)).toBe(3);
  });
});

describe('hazards by difficulty', () => {
  it('Normal maps have a quarter fewer hazard hexes than Hardcore ones', () => {
    const count = (rows: string[]): number => rows.reduce((n, r) => n + [...r].filter((c) => c === '~').length, 0);
    let normal = 0;
    let hard = 0;
    for (const sc of SCENARIOS) {
      const a = generate({ scenario: sc, heroes: 2, level: 1, seed: 77, difficulty: 'normal' });
      const b = generate({ scenario: sc, heroes: 2, level: 1, seed: 77, difficulty: 'hardcore' });
      const hn = count(a.map.tiles);
      const hh = count(b.map.tiles);
      expect(hn, sc.id).toBe(hh - Math.round(hh * NORMAL_HAZARD_CUT));
      normal += hn;
      hard += hh;
    }
    expect(normal / hard).toBeGreaterThan(0.7);
    expect(normal / hard).toBeLessThan(0.8);
  });
});
