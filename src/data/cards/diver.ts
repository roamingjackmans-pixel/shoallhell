// Shoal Diver: harpoon control. Spear it from range, reel it in, pin it to the seabed, then jump through the water to the next one.
import { H, L, P, atk, deck, heal, infuse, loot, mv, shield, summon, tp, use, xp } from '../dsl';

export const DIVER = deck('diver', [
  // ---- level 1 (hand 10, so three spare to leave at home)
  [1, 24, 'Reel It In', H([atk(2, { range: 3, pull: 2 })]), H([mv(3, true)]), 'Catch of the day. Every day.'],
  [1, 47, 'Pin to the Floor', H([atk(3, { cond: ['immobilize'] })]), H([mv(2), infuse('magic')])],
  [1, 38, 'Pressure Drop', H([atk(2, { range: 2, type: 'magic' }), infuse('magic')]), H([mv(3)])],
  [1, 16, 'Through the Water', H([mv(3, true), atk(2)]), H([mv(4, true)]), 'The Shoal is knee-deep. The Diver goes under anyway.'],
  [1, 63, 'Ballast Boots', H([atk(3, { push: 1 })]), H([mv(2), shield(1)]), 'Lead soles. Kicks like a filing cabinet.'],
  [1, 33, 'Tow Line', H([atk(2, { range: 3, pull: 3, use: use('magic', { cond: ['immobilize'], text: 'Immobilize' }) })]), H([mv(2), loot(1)])],
  [1, 72, 'Leak in a Jar', L([atk(3, { range: 2, aoe: 'blast', type: 'magic', cond: ['immobilize'], xp: 2 })]), H([heal(2), infuse('magic')]), 'Open in case of emergency. Do not open.'],
  [1, 55, 'Fuse Eel', L([summon('eel', 2)]), H([mv(3)]), 'Bites wires. Bites anything, frankly.'],
  [1, 81, 'Bubble Screen', H([shield(2), heal(1)]), H([mv(2, true), shield(1, { range: 2 })])],
  [1, 29, 'Undertow', H([atk(2, { range: 2, targets: 2, pull: 1 })]), H([mv(3)])],
  [1, 90, 'Deep Breath', H([heal(3, { use: use('magic', { heal: 2, text: '+2 Heal' }) })]), L([xp(1)], P('move', 1, 0, '+1 Move for the rest of the scenario'))],
  [1, 20, 'Harpoon Gun', H([atk(2, { range: 4, pierce: 1, use: use('magic', { n: 1, text: '+1 Attack' }) })]), H([mv(3)]), 'Steam-powered. Steam not included.'],
  [1, 76, 'Air Hose', H([heal(2, { range: 2 }), infuse('magic')]), H([mv(2, true), shield(1)]), 'Shares it. Charges by the breath.'],
  // ---- level 2
  [2, 35, 'Tidal Yank', H([atk(3, { range: 3, pull: 3, use: use('magic', { cond: ['immobilize'], text: 'Immobilize' }) })]), H([mv(3, true), loot(1)])],
  [2, 68, 'Riptide', H([atk(2, { aoe: 'ring', cond: ['immobilize'] })]), H([mv(4)])],
  // ---- level 3
  [3, 12, 'Cannonball', H([mv(4, true), atk(4, { push: 1 })]), H([mv(2), shield(2)]), 'Technically a dive. Technically into a man.'],
  [3, 58, 'Eel Wrangler', H([atk(3, { range: 2, pull: 2, cond: ['disarm'] })]), L([summon('eel', 2)])],
  // ---- level 4
  [4, 42, 'The Deep End', L([atk(5, { range: 3, pull: 3, type: 'magic', cond: ['immobilize'], xp: 2 })]), H([mv(4, true)])],
  [4, 84, 'Diving Bell', H([shield(3), heal(2)]), L([xp(2)], P('cond', 0, 5, 'Your next five attacks Immobilize', 'immobilize'))],
  // ---- level 5
  [5, 10, 'Maelstrom', L([atk(4, { range: 3, aoe: 'blast', type: 'magic', pull: 1, cond: ['immobilize'], xp: 2, use: use('magic', { n: 2, text: '+2 Attack' }) })]), H([mv(5, true)])],
  [5, 93, 'Bottom of the World', H([atk(4, { range: 4, pull: 4 })]), L([tp(6), heal(3), xp(2)]), 'Went down in 1874. Comes up wherever he likes.'],
]);
