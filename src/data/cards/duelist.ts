// Duelist: first in, twice per swing. Low initiatives, double strikes, Wounds that keep ticking, and a habit of
// vanishing (Invisible) right before the bill arrives. Void powers the finishers.
import { H, L, P, atk, buff, deck, infuse, loot, mv, shield, tp, use, xp } from '../dsl';

export const DUELIST = deck('duelist', [
  // ---- level 1 (hand 12, so three spare to leave at home)
  [1, 8, 'One-Two', H([atk(2), atk(1)]), H([mv(3)]), 'The second one is the one you remember.'],
  [1, 13, 'Flourish', H([atk(2, { cond: ['wound'] })]), H([mv(3)])],
  [1, 21, 'Cheap Shot', H([atk(2, { cond: ['muddle'] })]), H([mv(3), loot(1)])],
  [1, 17, 'Vanishing Act', H([atk(2, { type: 'void' }), infuse('void')]), H([mv(2), buff(['invisible'])])],
  [1, 31, 'Twin Cuts', H([atk(2, { targets: 2 })]), H([mv(3)])],
  [1, 9, 'Backstep', H([atk(2), mv(2)]), H([mv(3), shield(1)])],
  [1, 44, 'Void Lunge', L([mv(3), atk(5, { type: 'void', xp: 2, use: use('void', { n: 1, cond: ['wound'], text: '+1 Attack, Wound' }) })]), H([mv(3)])],
  [1, 26, 'Thousand Cuts', L([atk(2, { cond: ['wound'] }), atk(2), atk(2, { xp: 2 })]), H([mv(2), loot(1)]), 'Well. Three. The rest were implied.'],
  [1, 37, 'Never Been Hit', H([atk(3)]), L([mv(4), buff(['invisible']), xp(1)]), 'Says so. Loudly. From somewhere you cannot see.'],
  [1, 19, 'Parry and Poke', H([shield(1), atk(2)]), H([mv(3)])],
  [1, 52, 'Shadow Step', H([tp(3), atk(2, { type: 'void' })]), H([mv(2), infuse('void')])],
  [1, 6, 'Quickdraw', H([atk(2, { range: 2 })]), H([mv(4)])],
  [1, 28, 'Stab Stab', H([atk(2), atk(1, { use: use('void', { n: 1, cond: ['wound'], text: '+1 Attack, Wound' }) })]), H([mv(3), loot(1)])],
  [1, 24, 'Twist the Knife', H([atk(2, { type: 'void', use: use('void', { n: 2, text: '+2 Attack' }) })]), H([mv(3)]), 'It was already in. This part is just admin.'],
  [1, 41, 'Smoke and Mirrors', H([atk(2, { cond: ['muddle'] }), infuse('void')]), H([tp(2), shield(1)])],
  // ---- level 2
  [2, 11, 'Flurry', H([atk(2), atk(2, { cond: ['wound'] })]), H([mv(4)])],
  [2, 39, 'Edge of Nothing', L([xp(1)], P('cond', 0, 5, 'Your next five attacks Wound', 'wound')), H([mv(3), infuse('void')])],
  // ---- level 3
  [3, 7, 'Gone Before Lunch', H([atk(3), mv(3)]), H([mv(3), buff(['invisible'])])],
  [3, 33, 'Void Waltz', H([tp(3), atk(3, { type: 'void', use: use('void', { n: 1, targets: 2, text: '+1 Attack, +1 Target' }) })]), H([mv(3), loot(2)])],
  // ---- level 4
  [4, 16, 'Death by Ribbons', L([atk(3, { cond: ['wound'] }), atk(3, { xp: 2 })]), H([mv(4), buff(['invisible'])])],
  [4, 48, 'Hollow Grin', H([atk(4, { type: 'void', cond: ['muddle'] })]), H([mv(3), infuse('void')])],
  // ---- level 5
  [5, 5, 'Final Flourish', L([mv(3, true), atk(4), atk(4, { type: 'void', xp: 2, use: use('void', { n: 2, pierce: 2, text: '+2 Attack, Pierce 2' }) })]), H([mv(4), buff(['invisible'])])],
  [5, 23, 'Untouchable', H([atk(3), atk(3)]), L([buff(['invisible']), xp(2)], P('move', 1, 0, '+1 Move for the rest of the scenario'))],
]);
