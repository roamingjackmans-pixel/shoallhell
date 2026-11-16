// Brute: the hammer. Big single hits, shoves everything into walls and each other, stuns the ones that get back up.
// No element of his own: he spends whatever the rest of the party left lying around.
import { H, L, P, atk, deck, heal, loot, mv, ret, shield, use, xp } from '../dsl';

export const BRUTE = deck('brute', [
  // ---- level 1 (hand 10, so one spare to leave at home)
  [1, 12, 'Trample', H([mv(3), atk(2, { push: 1 })]), H([mv(3)])],
  [1, 29, 'Shove', H([atk(2, { push: 3 })]), H([mv(2), ret(1)])],
  [1, 41, 'Shoulder Charge', H([mv(2), atk(2, { push: 2 })]), H([mv(4)])],
  [1, 35, 'Redecorate', H([atk(2, { aoe: 'line2', push: 1 })]), H([mv(3)]), 'The wall was load-bearing. It is now face-bearing.'],
  [1, 58, 'Hammer Time', H([atk(3, { push: 2 })]), H([mv(3)]), 'Every problem looks like a nail if you squint.'],
  [1, 74, 'Bonk', L([atk(5, { cond: ['stun'], xp: 2 })]), H([mv(2), shield(1)]), 'Medical term.'],
  [1, 63, 'Big Swing', H([atk(2, { aoe: 'cleave', push: 1 })]), H([mv(3), loot(1)])],
  [1, 80, 'Thick Skull', H([shield(1), ret(2)]), H([mv(3)])],
  [1, 52, 'Wind Up', H([atk(3, { use: use('any', { n: 1, push: 2, text: '+1 Attack, Push 2' }) })]), H([mv(2), loot(1)])],
  [1, 87, 'Slightly Larger Hammer', H([atk(3)]), L([xp(1)], P('atk', 1, 5, '+1 Attack on your next five attacks'))],
  [1, 69, 'Spin the Hammer', L([atk(3, { aoe: 'ring', push: 1, xp: 2 })]), H([mv(2), heal(2)])],
  // ---- level 2
  [2, 46, 'Knock Through', H([atk(4, { push: 2, use: use('any', { cond: ['stun'], text: 'Stun' }) })]), H([mv(3)])],
  [2, 83, 'Doorstop', H([shield(2), ret(2)]), H([mv(2), heal(2)]), 'Nobody gets past. Nobody gets in. Nobody gets lunch.'],
  // ---- level 3
  [3, 24, 'Wrecking Ball', L([mv(4), atk(4, { aoe: 'line3', push: 2, xp: 2 })]), H([mv(4)])],
  [3, 55, 'Bouncer', H([atk(3, { targets: 2, push: 2 })]), H([mv(3), loot(1)])],
  // ---- level 4
  [4, 38, 'Earthshaker', L([atk(4, { aoe: 'cone', cond: ['stun'], xp: 2 })]), H([mv(3)])],
  [4, 77, 'Two-Hammer Policy', H([atk(4, { push: 1 })]), L([xp(2)], P('atk', 1, 0, '+1 Attack for the rest of the scenario'))],
  // ---- level 5
  [5, 14, 'Demolition', L([mv(3), atk(6, { push: 3, cond: ['stun'], xp: 2 })]), H([mv(4), loot(2)])],
  [5, 66, 'Unstoppable', H([mv(4, true), atk(4, { aoe: 'cleave', push: 2 })]), H([shield(2), ret(2)])],
]);
