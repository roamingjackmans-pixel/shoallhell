// Nobody: Joe, in his bathrobe, with a club. A bit of everything, none of it on purpose. Drinks from the Thermos, gets lucky, brings Gary.
import { H, L, P, atk, bless, deck, heal, loot, mv, recover, shield, summon, use, xp } from '../dsl';

export const NOBODY = deck('nobody', [
  // ---- level 1 (hand 9, so one spare to leave at home)
  [1, 34, 'Bonk', H([atk(3)]), H([mv(3)]), 'Not a technique. Just a noise.'],
  [1, 62, 'Thermos Break', H([heal(3), shield(1)]), H([mv(3)])],
  [1, 88, 'Gary Owes Rent', L([summon('gary', 2)]), H([mv(2), heal(2)]), 'He has never paid. He will never pay. He is, somehow, useful.'],
  [1, 17, 'Slipper Sprint', H([mv(2), atk(2)]), H([mv(4)])],
  [1, 45, 'Lucky Swing', H([atk(2, { use: use('any', { n: 2, text: '+2 Attack' }) })]), H([mv(3), loot(1)])],
  [1, 29, 'Throw the Slipper', H([atk(2, { range: 3, cond: ['muddle'] })]), H([mv(3)])],
  [1, 53, 'Fuse Box Zap', L([atk(4, { range: 2, type: 'magic', cond: ['stun'], xp: 2 })]), H([mv(3)]), 'He came down to fix it. It fixed him.'],
  [1, 71, 'Behind the Sofa', H([atk(2), shield(1)]), H([mv(2), shield(2)])],
  [1, 40, 'Second Wind', H([atk(2, { push: 1 })]), L([recover(2, 1)])],
  [1, 79, 'Lucky Penny', H([bless(2, 0)]), H([mv(3), loot(2)]), 'Found it in the Shoal. It glows. Probably fine.'],
  // ---- level 2
  [2, 24, 'Bonk Harder', H([atk(3, { push: 1, cond: ['muddle'] })]), H([mv(3)])],
  [2, 66, 'Refill the Thermos', H([heal(3, { range: 2 })]), H([mv(2), heal(2)]), 'Not tea. Do not ask why it glows.'],
  // ---- level 3
  [3, 13, 'Strategic Retreat', H([atk(3, { push: 2 })]), H([mv(5, true)]), 'Not running. Relocating. Briskly.'],
  [3, 57, 'Not My Problem', H([atk(3, { cond: ['disarm'] })]), H([mv(3), shield(1)])],
  // ---- level 4
  [4, 37, 'Everything at Once', L([atk(4, { aoe: 'ring', push: 1, xp: 2, use: use('any', { n: 1, cond: ['stun'], text: '+1 Attack, Stun' }) })]), H([mv(3), heal(2)])],
  [4, 82, 'Bottomless Thermos', H([atk(3), heal(2)]), L([xp(2)], P('drain', 1, 0, 'Heal 1 whenever you attack, for the rest of the scenario'))],
  // ---- level 5
  [5, 7, 'Beginner’s Luck', L([atk(6, { pierce: 2, cond: ['stun'], xp: 2 })]), H([mv(4), loot(2)])],
  [5, 93, 'Not Today, Executor', H([shield(2), heal(3)]), L([recover(3, 2)]), 'He has an appointment. Joe has slippers.'],
]);
