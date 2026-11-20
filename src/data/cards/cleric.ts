// Pyre Priest: heals at range, Blesses the party's modifier decks, keeps a Pyre Wisp or two burning, and spends Fire
// to turn a heal or a smite up a notch. Holy for when the sermon needs to land.
import { H, L, P, atk, bless, buff, deck, heal, infuse, loot, mv, shield, summon, use, xp } from '../dsl';

export const CLERIC = deck('cleric', [
  // ---- level 1 (hand 11, so three spare to leave at home)
  [1, 47, 'Last Rites', H([atk(2, { range: 2, type: 'fire' }), infuse('fire')]), H([heal(2, { range: 2 })]), 'Short service. Very warm.'],
  [1, 62, 'Warm Hands', H([heal(3, { range: 1 })]), H([mv(3)])],
  [1, 36, 'Censer Swing', H([atk(2, { type: 'fire' })]), H([mv(3), heal(1)])],
  [1, 81, 'Kindle the Wisp', L([summon('pyre_wisp', 2)]), H([mv(2), infuse('fire')]), 'A little ghost made of candle. Do not ask whose.'],
  [1, 55, 'Long Sermon', H([bless(1, 3)]), H([mv(3)])],
  [1, 28, 'Holy Smoke', H([atk(2, { range: 2, type: 'holy', cond: ['muddle'] })]), H([mv(3)])],
  [1, 73, 'Mass Absolution', L([heal(4, { range: 2, all: true, xp: 2 })]), H([mv(2), shield(1)])],
  [1, 41, 'Cremation Clause', L([atk(5, { range: 2, type: 'fire', xp: 2, use: use('fire', { n: 1, cond: ['wound'], text: '+1 Attack, Wound' }) })]), H([mv(3)]), 'Read the small print. It is on fire.'],
  [1, 66, 'Hot Water Bottle', H([heal(2, { range: 2, use: use('fire', { heal: 2, text: '+2 Heal' }) })]), H([mv(2), loot(1)])],
  [1, 19, 'Brand of Faith', H([atk(2, { type: 'fire', cond: ['wound'] })]), H([mv(4)])],
  [1, 89, 'Night Vigil', H([shield(1, { range: 2, all: true })]), H([heal(2), infuse('holy')])],
  [1, 52, 'Burning Hymn', H([atk(1, { aoe: 'ring', type: 'fire', use: use('fire', { n: 1, text: '+1 Attack' }) })]), H([mv(2), heal(1, { range: 1 })])],
  [1, 23, 'Fire and Brimstone', H([atk(2, { aoe: 'line2', type: 'fire', use: use('fire', { n: 1, text: '+1 Attack' }) })]), H([mv(3)]), 'The brimstone is extra. Everyone pays extra.'],
  [1, 84, 'Sanctuary', H([shield(2, { range: 2 }), infuse('holy')]), H([mv(3), heal(1, { range: 2 })])],
  // ---- level 2
  [2, 32, 'Ash Wednesday', H([atk(3, { range: 2, type: 'fire', use: use('holy', { n: 1, text: '+1 Attack' }) })]), H([mv(3), infuse('fire')])],
  [2, 77, 'Benediction', H([bless(1, 3), heal(2, { range: 3 })]), H([mv(3)])],
  // ---- level 3
  [3, 44, 'Spare Wisp', L([summon('pyre_wisp', 2), infuse('fire')]), H([heal(3, { range: 2 })])],
  [3, 64, 'Warm Blanket', H([heal(2, { range: 2 }), buff(['regenerate'], { range: 2 })]), H([mv(4)])],
  // ---- level 4
  [4, 25, 'Purifying Fire', L([atk(4, { range: 3, aoe: 'blast', type: 'fire', xp: 2, use: use('fire', { n: 1, heal: 3, text: '+1 Attack, Heal 3 self' }) })]), H([mv(3), bless(1)])],
  [4, 70, 'Eternal Flame', H([atk(3, { range: 3, type: 'holy' }), infuse('fire')]), L([xp(2)], P('drain', 1, 0, 'Heal 1 whenever you attack, for the rest of the scenario'))],
  // ---- level 5
  [5, 39, 'Phoenix Rite', L([heal(5, { range: 3, all: true, xp: 2 }), bless(2, 3)]), H([mv(4)]), 'Everyone gets up. Some of them are a bit crispy.'],
  [5, 58, 'Walking Bonfire', H([mv(3), atk(3, { aoe: 'ring', type: 'fire' })]), H([heal(3, { range: 2, use: use('fire', { heal: 2, text: '+2 Heal' }) })])],
]);
