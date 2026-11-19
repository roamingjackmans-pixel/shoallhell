// Multiple campaigns: old one-campaign saves upgrade without losing anything, and results go to the right campaign.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { applyResult, camp, heroSetup, makeCharacter, newCampaign, newProfile, upgradeProfile, type Profile } from '../src/game/campaign';
import { createCombat } from '../src/game/rules';

describe('campaigns', () => {
  it('upgrades a version-1 save into its first campaign', () => {
    const knight = makeCharacter('Ser Colin', 'knight');
    const v1 = {
      v: 1,
      name: 'Tester',
      characters: [knight],
      classes: ['knight', 'brute', 'duelist', 'scholar', 'cleric'],
      unlocked: ['1a', '1b'],
      completed: ['1a'],
      stats: { scenariosWon: 1 },
      tasksDone: ['first_minutes'],
      seenPremise: true,
      seenDepths: [1],
      fund: 15,
      difficulty: 'hard',
    } as unknown as Profile;
    const p = upgradeProfile(v1);
    expect(p.v).toBe(2);
    expect(p.campaigns.length).toBe(1);
    const k = camp(p);
    expect(k.characters.map((c) => c.name)).toEqual(['Ser Colin']);
    expect(k.unlocked).toEqual(['1a', '1b']);
    expect(k.completed).toEqual(['1a']);
    expect(k.fund).toBe(15);
    expect(k.difficulty).toBe('hard');
    expect(p.classes).toContain('cleric');
    expect(p.tasksDone).toEqual(['first_minutes']);
    // upgrading again changes nothing
    expect(upgradeProfile(structuredClone(p))).toEqual(p);
  });

  it('keeps progress separate per campaign; classes and tasks are shared', () => {
    const p = newProfile('Tester');
    const a = camp(p);
    const b = newCampaign('Second Union');
    p.campaigns.push(b);
    const hero = makeCharacter('Bea', 'brute');
    b.characters.push(hero);
    p.active = b.id;
    const s = createCombat(SCENARIOS[0]!, [heroSetup(hero, 'me')], 1, 9);
    s.phase = 'won';
    applyResult(p, s, 'me', SCENARIOS[0]!, false);
    expect(b.completed).toEqual(['1a']);
    expect(b.unlocked).toContain('1b');
    expect(a.completed).toEqual([]);
    expect(p.stats.scenariosWon).toBe(1);
    expect(hero.scenarios).toBe(1);
  });
});
