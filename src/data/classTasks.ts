// Class tasks: two personal goals for every class, tracked over a hero's whole career (their lifetime scenario
// stats). Each task has three stages; every stage reached is a checkmark, and every three checkmarks earn an extra
// perk for the modifier deck, like Gloomhaven's battle-goal checkmarks. Two tasks × three stages = up to two perks.
export interface ClassTask {
  id: string;
  name: string;
  /** what counts, e.g. "Block damage with Shield" */
  text: string;
  /** a key of the hero's scenario stats (HeroStats), added up over every scenario */
  stat: string;
  goals: [number, number, number];
}

export const CHECKS_PER_PERK = 3;

const T = (id: string, name: string, text: string, stat: string, goals: [number, number, number]): ClassTask => ({ id, name, text, stat, goals });

export const CLASS_TASKS: Record<string, [ClassTask, ClassTask]> = {
  knight: [
    T('knight_wall', 'The Wall', 'Block damage with Shield', 'blocked', [10, 30, 60]),
    T('knight_bite', 'Bites Back', 'Deal Retaliate damage', 'retDmg', [8, 20, 40]),
  ],
  brute: [
    T('brute_skulls', 'Crack Skulls', 'Deal damage', 'dmg', [40, 100, 200]),
    T('brute_shove', 'Shove Off', 'Push or pull enemies', 'shoved', [6, 15, 30]),
  ],
  duelist: [
    T('duelist_cuts', 'A Thousand Cuts', 'Land attacks', 'hits', [20, 50, 100]),
    T('duelist_elite', 'Only the Best', 'Defeat elites', 'elitesKilled', [3, 8, 15]),
  ],
  scholar: [
    T('scholar_applied', 'Applied Elements', 'Spend elements on your cards', 'elSpent', [4, 10, 20]),
    T('scholar_distance', 'Distance Learning', 'Defeat enemies with ranged attacks', 'rangedKills', [5, 15, 30]),
  ],
  cleric: [
    T('cleric_hands', 'Laying On of Hands', 'Heal', 'heals', [15, 40, 80]),
    T('cleric_kindling', 'Kindling', 'Infuse elements', 'infusions', [6, 15, 30]),
  ],
  spearman: [
    T('spearman_edge', 'Magic Edge', 'Spend elements on your cards', 'elSpent', [4, 10, 20]),
    T('spearman_shelf', 'Sword the Size of a Shelf', 'Deal damage', 'dmg', [40, 100, 200]),
  ],
  hunter: [
    T('hunter_longshot', 'Long Shot', 'Defeat enemies with ranged attacks', 'rangedKills', [5, 15, 30]),
    T('hunter_snare', 'Snares and Nets', 'Inflict conditions on enemies', 'condsGiven', [5, 12, 25]),
  ],
  occultist: [
    T('occultist_dawn', 'Dawn of the Dead (Again)', 'Defeat undead', 'undead', [4, 10, 20]),
    T('occultist_penance', 'Penance', 'Take damage and keep going', 'dmgTaken', [20, 50, 100]),
  ],
  berserker: [
    T('berserker_price', 'Blood Price', 'Take damage', 'dmgTaken', [25, 60, 120]),
    T('berserker_rampage', 'Rampage', 'Defeat enemies', 'kills', [8, 20, 40]),
  ],
  nobody: [
    T('nobody_pockets', 'Joe’s Pockets', 'Pick up coins', 'coins', [8, 20, 40]),
    T('nobody_kit', 'Make Do', 'Use items', 'items', [4, 10, 20]),
  ],
  diver: [
    T('diver_under', 'Pull Them Under', 'Push or pull enemies', 'shoved', [5, 12, 25]),
    T('diver_wade', 'Wade In', 'Move hexes', 'moved', [40, 100, 200]),
  ],
  notary: [
    T('notary_print', 'The Small Print', 'Inflict conditions on enemies', 'condsGiven', [8, 20, 40]),
    T('notary_overdue', 'Overdue', 'Defeat enemies', 'kills', [6, 15, 30]),
  ],
  glowsmith: [
    T('glowsmith_workshop', 'Workshop', 'Summon helpers', 'summons', [3, 8, 15]),
    T('glowsmith_forge', 'Keep the Forge Lit', 'Infuse elements', 'infusions', [6, 15, 30]),
  ],
  lamplighter: [
    T('lamplighter_light', 'Light to Hide Behind', 'Give Shield', 'shieldGiven', [8, 20, 40]),
    T('lamplighter_reach', 'Long Reach', 'Heal', 'heals', [12, 30, 60]),
  ],
};
