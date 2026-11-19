// Zealot: bleeds for the light. Pays HP for bigger holy cuts and sunrays, then prays (or drains) it back.
import { H, L, P, atk, deck, heal, infuse, loot, mv, shield, use, xp } from '../dsl';

export const OCCULTIST = deck('occultist', [
  // ---- level 1 (hand 10, so three spare to leave at home)
  [1, 21, 'Dawn Cut', H([atk(3, { type: 'holy' })]), H([mv(3)]), 'Up at five. Cutting by five past.'],
  [1, 37, 'Blood for Light', H([atk(4, { type: 'holy', selfDmg: 1 })]), H([mv(2), heal(2)])],
  [1, 52, 'Sunray', H([atk(2, { aoe: 'line3', type: 'holy' })]), H([mv(2), infuse('holy')])],
  [1, 64, 'Morning Prayers', H([heal(3), infuse('holy')]), H([mv(3)])],
  [1, 28, 'Penitent Lunge', H([mv(2), atk(3, { type: 'holy', selfDmg: 1 })]), H([mv(4)])],
  [1, 45, 'Tithe', H([atk(2, { type: 'holy', drain: 2 })]), H([mv(2), loot(1)]), 'Ten percent. Of your blood.'],
  [1, 70, 'Scourge', L([atk(5, { type: 'holy', selfDmg: 2, xp: 2, use: use('holy', { n: 2, text: '+2 Attack' }) })]), H([mv(2), shield(1)])],
  [1, 15, 'Wide Sermon', H([atk(2, { aoe: 'cleave', type: 'holy' })]), H([mv(3, true)])],
  [1, 82, 'Hair Shirt', H([atk(2, { type: 'holy' }), shield(1)]), L([xp(1)], P('atk', 1, 5, '+1 Attack on your next five attacks')), 'Itchy. Holy. Mostly itchy.'],
  [1, 58, 'Sunburst', L([atk(3, { aoe: 'blast', range: 3, type: 'holy', xp: 2, use: use('holy', { cond: ['stun'], text: 'Stun' }) })]), H([mv(2), heal(2)])],
  [1, 40, 'Vigil', H([atk(2, { range: 2, type: 'holy' })]), H([heal(3)])],
  [1, 12, 'Open Vein', H([atk(3, { type: 'holy', selfDmg: 1, cond: ['wound'] })]), H([mv(3)]), 'A little off the top. Yours first.'],
  [1, 91, 'Ashes on the Brow', H([heal(2, { use: use('holy', { heal: 2, text: '+2 Heal' }) }), shield(1)]), H([mv(3)]), 'Smudged on by hand. Mostly soot.'],
  // ---- level 2
  [2, 33, 'Martyr’s Edge', H([atk(5, { type: 'holy', selfDmg: 2 })]), H([mv(3)])],
  [2, 76, 'Light Through Wounds', H([atk(2, { range: 3, type: 'holy', drain: 1 })]), H([heal(2), infuse('holy')])],
  // ---- level 3
  [3, 24, 'Noon Strike', H([mv(2), atk(4, { type: 'holy', use: use('holy', { n: 1, cond: ['stun'], text: '+1 Attack, Stun' }) })]), H([mv(4)])],
  [3, 61, 'Blood Communion', L([xp(2)], P('drain', 1, 0, 'Heal 1 whenever you attack, for the rest of the scenario')), H([mv(2), shield(2)])],
  // ---- level 4
  [4, 18, 'Searing Halo', L([atk(4, { aoe: 'ring', type: 'holy', selfDmg: 2, cond: ['wound'], xp: 2 })]), H([mv(3), heal(2)])],
  [4, 68, 'Sunray Lance', H([atk(3, { aoe: 'line3', type: 'holy', pierce: 2 })]), H([mv(3), infuse('holy')])],
  // ---- level 5
  [5, 8, 'Rapture', L([atk(6, { type: 'holy', selfDmg: 3, drain: 3, pierce: 2, xp: 2, use: use('holy', { n: 2, text: '+2 Attack' }) })]), H([mv(5)]), 'It hurts. That is how you know it is working.'],
  [5, 88, 'High Noon', H([atk(3, { aoe: 'blast', range: 3, type: 'holy' })]), L([heal(3, { range: 2, all: true }), infuse('holy'), xp(2)])],
]);
