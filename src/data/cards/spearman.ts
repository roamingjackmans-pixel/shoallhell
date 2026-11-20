// Battlemage: a sword the size of a shelf with a rune on it. Sword hits infuse Magic, and the next swing spends it for
// reach, pierce, push or a shield. Melee first, a spell when the sword will not fit.
import { H, L, P, atk, deck, heal, infuse, loot, mv, ret, shield, tp, use, xp } from '../dsl';

export const SPEARMAN = deck('spearman', [
  // ---- level 1 (hand 10, so three spare to leave at home)
  [1, 34, 'Shelf Swing', H([atk(3, { aoe: 'cleave' })]), H([mv(3)]), 'Reach for the top shelf. Then keep reaching.'],
  [1, 50, 'Charged Edge', H([atk(3, { type: 'magic' }), infuse('magic')]), H([mv(3)])],
  [1, 27, 'Reaching Thrust', H([mv(2), atk(3, { use: use('magic', { n: 1, range: 2, text: '+1 Attack, Range 2' }) })]), H([mv(4)])],
  [1, 63, 'Rune Ward', H([shield(2, { use: use('magic', { shield: 1, text: '+1 Shield' }) })]), H([heal(2), infuse('magic')])],
  [1, 72, 'Silence in the Library', L([atk(5, { type: 'magic', push: 1, xp: 2, use: use('magic', { n: 1, pierce: 2, text: '+1 Attack, Pierce 2' }) })]), H([mv(3)]), 'Shh.'],
  [1, 41, 'Sparking Sweep', H([atk(2, { aoe: 'line3', type: 'magic' })]), H([mv(3), loot(1)])],
  [1, 19, 'Flat of the Blade', H([atk(2, { push: 2, cond: ['muddle'] })]), H([mv(3)])],
  [1, 86, 'Enchant Weapon', H([atk(3)]), L([infuse('magic'), xp(1)], P('atk', 1, 5, '+1 Attack on your next five attacks'))],
  [1, 57, 'Blinkstrike', H([tp(2), atk(3, { type: 'magic' })]), H([mv(2), shield(1)])],
  [1, 78, 'Arcane Overload', L([atk(4, { aoe: 'cone', type: 'magic', xp: 2 })]), H([mv(2), infuse('magic')])],
  [1, 46, 'Read Aloud', H([atk(2, { range: 3, type: 'magic', use: use('magic', { n: 2, text: '+2 Attack' }) })]), H([mv(2), heal(2)]), 'Page one. Also the only page.'],
  [1, 24, 'Overhead Chop', H([atk(3, { use: use('magic', { n: 1, push: 1, text: '+1 Attack, Push 1' }) })]), H([mv(3)]), 'Mind your head. Too late.'],
  [1, 65, 'Bookend', H([shield(1), ret(2)]), H([mv(2), infuse('magic')]), 'Holds everything up. Holds everything back.'],
  // ---- level 2
  [2, 45, 'Shelf Life', H([atk(4, { aoe: 'cleave', use: use('magic', { n: 1, push: 1, text: '+1 Attack, Push 1' }) })]), H([mv(3)])],
  [2, 68, 'Glowen Battery', H([atk(3, { type: 'magic' }), infuse('magic')]), H([mv(3), heal(2)])],
  // ---- level 3
  [3, 30, 'Riftcleaver', H([tp(3), atk(3, { aoe: 'cleave', type: 'magic' })]), H([mv(4)])],
  [3, 82, 'Runic Plate', L([shield(1), xp(2)], P('shield', 1, 6, 'Shield 1 for the next six attacks against you')), H([mv(2), infuse('magic')])],
  // ---- level 4
  [4, 22, 'Whirling Shelf', L([atk(4, { aoe: 'ring', type: 'magic', push: 1, xp: 2, use: use('magic', { n: 1, cond: ['stun'], text: '+1 Attack, Stun' }) })]), H([mv(4)])],
  [4, 59, 'Overcharge', H([atk(4, { use: use('magic', { n: 1, range: 3, targets: 2, text: '+1 Attack, Range 3, +1 Target' }) })]), H([mv(3), shield(2)])],
  // ---- level 5
  [5, 16, 'Encyclopaedic Blow', L([mv(3), atk(6, { type: 'magic', pierce: 2, push: 2, xp: 2 })]), H([mv(4), infuse('magic')]), 'Volumes one through twelve, all at once.'],
  [5, 74, 'Living Rune', H([atk(4, { aoe: 'line3', type: 'magic' })]), L([infuse('magic'), xp(2)], P('atk', 1, 0, '+1 Attack for the rest of the scenario'))],
]);
