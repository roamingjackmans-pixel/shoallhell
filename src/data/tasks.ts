// Tasks: union business. Account-wide goals that unlock classes (and a few that pay gold) as you play.
export type StatKey =
  | 'kills'
  | 'heals'
  | 'infusions'
  | 'rangedKills'
  | 'elitesKilled'
  | 'undeadKills'
  | 'scenariosWon'
  | 'exhaustions'
  | 'goldEarned'
  | 'lowHpWins'
  | 'deepest'
  | 'damage'
  | 'cardsLost'
  | 'bossesKilled'
  | 'delvesWon';

export interface TaskDef {
  id: string;
  name: string;
  text: string;
  stat: StatKey;
  goal: number;
  /** a class unlocked on completion */
  cls?: string;
  /** gold paid to every hero on completion (claimed in the hall) */
  gold?: number;
}

export const TASKS: TaskDef[] = [
  { id: 'field_medicine', name: 'Field Medicine', text: 'Heal 40 HP in total.', stat: 'heals', goal: 40, cls: 'cleric' },
  { id: 'sharpshooter', name: 'Sharpshooter', text: 'Defeat 25 enemies with ranged attacks.', stat: 'rangedKills', goal: 25, cls: 'hunter' },
  { id: 'bottled_lightning', name: 'Bottled Lightning', text: 'Infuse 20 elements.', stat: 'infusions', goal: 20, cls: 'spearman' },
  { id: 'exorcist', name: 'Exorcist', text: 'Defeat 20 undead.', stat: 'undeadKills', goal: 20, cls: 'occultist' },
  { id: 'by_a_thread', name: 'By a Thread', text: 'Win a scenario with a hero on 3 HP or less.', stat: 'lowHpWins', goal: 1, cls: 'berserker' },
  { id: 'joe_knows', name: 'Joe Knows the Feeling', text: 'Be exhausted 3 times.', stat: 'exhaustions', goal: 3, cls: 'nobody' },
  { id: 'down_the_drain', name: 'Down the Drain', text: 'Reach the Driftwood (clear Depth 3).', stat: 'deepest', goal: 4, cls: 'diver' },
  { id: 'fine_print', name: 'Read the Fine Print', text: 'Defeat 15 elites.', stat: 'elitesKilled', goal: 15, cls: 'notary' },
  { id: 'overtime_pay', name: 'Overtime Pay', text: 'Earn 250 gold in total.', stat: 'goldEarned', goal: 250, cls: 'glowsmith' },
  { id: 'night_shift', name: 'Night Shift', text: 'Win 8 scenarios.', stat: 'scenariosWon', goal: 8, cls: 'lamplighter' },
  { id: 'first_minutes', name: 'First Minutes', text: 'Win your first scenario.', stat: 'scenariosWon', goal: 1, gold: 15 },
  { id: 'big_hitter', name: 'Big Hitter', text: 'Deal 300 damage in total.', stat: 'damage', goal: 300, gold: 30 },
  { id: 'clearance', name: 'Clearance Sale', text: 'Defeat 100 enemies.', stat: 'kills', goal: 100, gold: 40 },
  { id: 'boss_hunter', name: 'Hostile Takeover', text: 'Defeat 4 bosses.', stat: 'bossesKilled', goal: 4, gold: 50 },
  { id: 'scavenger', name: 'Scavenger', text: 'Win 3 Riptide Delves.', stat: 'delvesWon', goal: 3, gold: 30 },
  { id: 'sacrifice', name: 'Burnt Bridges', text: 'Lose 40 cards.', stat: 'cardsLost', goal: 40, gold: 25 },
];
