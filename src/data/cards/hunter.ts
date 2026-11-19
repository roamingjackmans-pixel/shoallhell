// Hunter: shoots from the back. Pins things in place with traps and barbs, drags them into the open, lets the dog finish.
import { H, L, P, atk, deck, heal, loot, mv, shield, summon, use, xp } from '../dsl';

export const HUNTER = deck('hunter', [
  // ---- level 1 (hand 11, so three spare to leave at home)
  [1, 18, 'Quick Shot', H([atk(2, { range: 3 })]), H([mv(4)]), 'Two arrows in the air before the first one lands. Neither lands.'],
  [1, 42, 'Snare Line', H([atk(2, { range: 2, cond: ['immobilize'] })]), H([mv(3)])],
  [1, 55, 'Rusty Bear Trap', H([atk(2, { range: 1, cond: ['wound'] })]), H([mv(2), loot(1)]), 'Found it in the mud. Most things in the Shoal are found in the mud.'],
  [1, 33, 'Reel It In', H([atk(2, { range: 3, pull: 2 })]), H([mv(3)])],
  [1, 70, 'Fetch!', L([summon('hound', 2)]), H([mv(3)]), 'He fetches. Mostly arms.'],
  [1, 26, 'Barbed Arrow', H([atk(2, { range: 3, cond: ['wound'] })]), H([mv(2), loot(1)])],
  [1, 61, 'Patient Aim', H([atk(3, { range: 3 })]), H([mv(2), heal(2, { range: 2 })])],
  [1, 48, 'Volley', L([atk(3, { range: 4, targets: 3, xp: 2, use: use('any', { n: 1, text: '+1 Attack' }) })]), H([mv(3)])],
  [1, 12, 'Into the Reeds', H([mv(3), atk(2, { range: 2 })]), H([mv(3, true)])],
  [1, 80, 'Lay the Line', L([atk(2, { range: 3, targets: 2, cond: ['immobilize'], xp: 1 })]), H([mv(2), shield(1)])],
  [1, 38, 'Skinning Knife', H([atk(3)]), H([mv(3)]), 'For skinning. Also for anyone who gets too close.'],
  [1, 89, 'Dipped Arrowheads', H([atk(2, { range: 3 })]), L([xp(1)], P('cond', 1, 4, 'Your next four attacks Wound', 'wound'))],
  [1, 52, 'Heavy Draw', L([atk(5, { range: 4, pierce: 1, xp: 2 })]), H([mv(3)]), 'Pulled back so far it creaked. The bow did too.'],
  [1, 77, 'Lie in the Mud', H([atk(2, { range: 2, cond: ['muddle'] })]), H([mv(2), shield(1)]), 'The mud does not mind. The mud has seen worse.'],
  // ---- level 2
  [2, 22, 'Pinning Shot', H([atk(3, { range: 3, cond: ['immobilize'] })]), H([mv(3), loot(2)])],
  [2, 74, 'Tripwire', H([atk(2, { range: 2, targets: 2, pull: 1, cond: ['wound'] })]), H([mv(2), shield(1)]), 'Ankle height. Always ankle height.'],
  // ---- level 3
  [3, 15, 'Running Shot', H([mv(3), atk(3, { range: 3 })]), H([mv(4, true)])],
  [3, 58, 'Gut Hook', H([atk(3, { range: 4, pull: 3, cond: ['wound'] })]), L([xp(1)], P('atk', 1, 4, '+1 Attack on your next four attacks'))],
  // ---- level 4
  [4, 30, 'Killing Field', L([atk(3, { aoe: 'blast', range: 3, cond: ['immobilize'], xp: 2 })]), H([mv(3), heal(2)])],
  [4, 67, 'He Brought a Friend', H([atk(3, { range: 3, targets: 2 })]), L([summon('hound', 2)]), 'The Shoal has no shortage of dogs. It has a shortage of owners.'],
  // ---- level 5
  [5, 9, 'Deadeye', L([atk(6, { range: 5, pierce: 3, xp: 2, use: use('any', { n: 2, text: '+2 Attack' }) })]), H([mv(4)])],
  [5, 84, 'The Long Hunt', L([xp(2)], P('cond', 1, 0, 'Your attacks Wound for the rest of the scenario', 'wound')), H([mv(3), loot(2)])],
]);
