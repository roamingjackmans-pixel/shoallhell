// Berserker: first in, last out. Spends his own HP on huge axe swings, drinks it back by hitting things, sets the rest on fire.
import { H, L, P, atk, deck, heal, infuse, loot, mv, ret, shield, use, xp } from '../dsl';

export const BERSERKER = deck('berserker', [
  // ---- level 1 (hand 10, so three spare to leave at home)
  [1, 11, 'Headlong', H([mv(3), atk(2)]), H([mv(4)]), 'Look before you leap. Or after. Or never.'],
  [1, 23, 'Twin Chop', H([atk(2, { targets: 2 })]), H([mv(3)])],
  [1, 31, 'Bite the Axe', H([atk(4, { selfDmg: 1 })]), H([mv(2), ret(1)])],
  [1, 46, 'Bloodletting', H([atk(2, { drain: 2 })]), H([mv(3), loot(1)])],
  [1, 19, 'Kindle the Rage', H([atk(3), infuse('fire')]), H([mv(3)])],
  [1, 57, 'Whirling Axes', H([atk(2, { aoe: 'ring', selfDmg: 1 })]), H([mv(3)])],
  [1, 27, 'Red Mist', L([atk(5, { selfDmg: 2, drain: 2, xp: 2, use: use('fire', { n: 2, text: '+2 Attack' }) })]), H([mv(3)])],
  [1, 66, 'Taste for It', H([atk(3, { type: 'fire' })]), L([xp(1)], P('drain', 1, 6, 'Heal 1 on each of your next six attacks'))],
  [1, 38, 'Hot Axes', H([atk(3, { type: 'fire', use: use('fire', { cond: ['wound'], text: 'Wound' }) })]), H([mv(2), infuse('fire')])],
  [1, 74, 'Shrug It Off', H([atk(2, { push: 1 })]), H([heal(3), ret(1)]), 'Walk it off. Run it off. Axe it off.'],
  [1, 50, 'Burning Rush', L([mv(3), atk(4, { aoe: 'cleave', type: 'fire', selfDmg: 1, xp: 2 })]), H([mv(3, true)])],
  [1, 35, 'Torch the Lot', H([atk(2, { aoe: 'cone', type: 'fire', use: use('fire', { cond: ['wound'], text: 'Wound' }) })]), H([mv(2), infuse('fire')]), 'Matches are for people with patience.'],
  [1, 78, 'Thick Skull', H([ret(2), shield(1)]), H([mv(2), heal(2)]), 'Nothing in there to hurt.'],
  // ---- level 2
  [2, 14, 'Overswing', H([atk(5, { selfDmg: 2, push: 1 })]), H([mv(4)])],
  [2, 62, 'Lick the Wounds', H([atk(3, { drain: 2 })]), H([heal(2), infuse('fire')])],
  // ---- level 3
  [3, 9, 'Berserk', L([xp(2)], P('atk', 1, 6, '+1 Attack on your next six attacks')), H([mv(3), ret(2)]), 'Was asked to stop. Did not hear. Was not listening.'],
  [3, 43, 'Ember Cleave', H([atk(3, { aoe: 'cleave', type: 'fire', use: use('fire', { n: 1, cond: ['wound'], text: '+1 Attack, Wound' }) })]), H([mv(3)])],
  // ---- level 4
  [4, 29, 'Pyre of Axes', L([atk(4, { aoe: 'ring', type: 'fire', selfDmg: 2, drain: 2, cond: ['wound'], xp: 2 })]), H([mv(3), infuse('fire')])],
  [4, 53, 'Grin and Bleed', H([atk(4, { selfDmg: 1, pierce: 2 })]), H([mv(2), heal(3)])],
  // ---- level 5
  [5, 6, 'Unstoppable', H([mv(4, true), atk(5, { selfDmg: 2, use: use('fire', { n: 2, push: 2, text: '+2 Attack, Push 2' }) })]), H([mv(5)])],
  [5, 81, 'Last One Standing', L([atk(6, { aoe: 'cleave', type: 'fire', selfDmg: 3, drain: 3, xp: 2 })]), H([heal(3), ret(2)]), 'Counts to one. Always wins.'],
]);
