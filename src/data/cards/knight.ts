// Knight: the wall. Shields for himself and the people behind him, Retaliate for anyone who swings, Holy to finish.
import { H, L, P, atk, bless, deck, heal, infuse, loot, mv, ret, shield, use, xp } from '../dsl';

export const KNIGHT = deck('knight', [
  // ---- level 1 (hand 10, so one spare to leave at home)
  [1, 15, 'Shield Bash', H([atk(3, { push: 1 })]), H([mv(3)]), 'The shield is mostly for hitting. The rest is for hiding.'],
  [1, 72, 'Hold the Stairs', H([shield(2), ret(1)]), H([mv(2), shield(1, { range: 1 })])],
  [1, 30, 'Longsword Sweep', H([atk(2, { aoe: 'cleave' })]), H([mv(3), loot(1)])],
  [1, 61, 'Tabard of Faith', H([atk(2), infuse('holy')]), H([heal(2), shield(1)])],
  [1, 44, 'Heavy Plate', H([atk(3)]), L([xp(1)], P('shield', 1, 0, 'Shield 1 for the rest of the scenario'))],
  [1, 25, 'Charge the Line', H([mv(2), atk(2)]), H([mv(4)])],
  [1, 88, 'Bulwark', H([shield(1, { range: 2, all: true, xp: 1 })]), H([ret(2), mv(1)])],
  [1, 50, 'Smite the Wicked', L([atk(5, { type: 'holy', xp: 2, use: use('holy', { n: 2, text: '+2 Attack' }) })]), H([mv(2), heal(1)])],
  [1, 35, 'Taunting Shout', H([atk(2, { range: 2, cond: ['muddle'] })]), H([mv(2), shield(1)])],
  [1, 66, 'Sworn Protector', H([atk(2), shield(1, { range: 1 })]), L([xp(1)], P('retaliate', 1, 6, 'Retaliate 1 the next six times you are attacked'))],
  [1, 20, 'Riposte', H([ret(2), atk(1)]), H([mv(3)])],
  // ---- level 2
  [2, 40, 'Iron Lungs', H([atk(4, { use: use('holy', { cond: ['stun'], text: 'Stun' }) })]), H([mv(2), shield(2)])],
  [2, 70, 'Rally the Union', H([bless(2, 3, 1)]), H([heal(3, { range: 2 })]), 'A Knight’s speech: short, loud, about stairs.'],
  // ---- level 3
  [3, 85, 'Unbreakable', L([xp(2)], P('shield', 2, 5, 'Shield 2 for the next five attacks against you')), H([mv(4)])],
  [3, 22, 'Crusader’s Leap', H([mv(4, true), atk(3)]), H([mv(2), ret(2, { use: use('holy', { n: 1, text: '+1 Retaliate' }) })])],
  // ---- level 4
  [4, 33, 'Judgment Bell', L([atk(4, { aoe: 'ring', type: 'holy', cond: ['stun'], xp: 2 })]), H([heal(3), infuse('holy')])],
  [4, 77, 'Last Stand', H([shield(3), ret(2)]), H([mv(3), shield(1, { range: 3, all: true })])],
  // ---- level 5
  [5, 12, 'Avenger', H([atk(5, { push: 2, use: use('holy', { n: 2, pierce: 3, text: '+2 Attack, Pierce 3' }) })]), H([mv(5)])],
  [5, 90, 'The Long Watch', L([xp(2)], P('retaliate', 2, 0, 'Retaliate 2 for the rest of the scenario')), H([shield(2, { range: 2, all: true }), heal(2)])],
]);
