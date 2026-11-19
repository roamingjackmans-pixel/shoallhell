// Glowsmith: builds the crew, then keeps it running. Turrets and tin helpers up front, shields and strengthen to keep them ticking, a hot hammer for whatever gets through.
import { H, L, P, atk, buff, deck, heal, infuse, loot, mv, ret, shield, summon, use, xp } from '../dsl';

export const GLOWSMITH = deck('glowsmith', [
  // ---- level 1 (hand 10, so three spare to leave at home)
  [1, 26, 'Hot Rivet', H([atk(3, { type: 'fire' })]), H([mv(3)]), 'Rivets go in hot. So do Glowsmiths.'],
  [1, 62, 'Glowen Turret', L([summon('glow_turret', 2)]), H([mv(2), shield(1)]), 'Points at the bad things. Mostly.'],
  [1, 48, 'Tin Apprentice', H([atk(2), infuse('fire')]), L([summon('tin_helper', 2)]), 'Union rate: one bolt a day.'],
  [1, 39, 'Bellows Breath', H([atk(2, { aoe: 'cone', type: 'fire' })]), H([mv(2), infuse('fire')])],
  [1, 74, 'Anvil Guard', H([shield(2), ret(1)]), H([mv(2), shield(1, { range: 3 })])],
  [1, 67, 'Spot Weld', H([heal(3, { range: 3 })]), H([mv(3), loot(1)]), 'Works on knees and turrets alike. Same noise.'],
  [1, 55, 'Overtime', H([buff(['strengthen'], { range: 3 }), shield(1, { range: 3 })]), H([mv(3)]), 'Time and a half. Paid in Glowen. Never paid.'],
  [1, 31, 'Clock Out', L([atk(5, { type: 'fire', xp: 2, use: use('fire', { n: 1, cond: ['wound'], text: '+1 Attack, Wound' }) })]), H([mv(4)]), 'Ignatius clocked out once. The Forge is still on fire.'],
  [1, 20, 'Sparks Fly', H([atk(2, { aoe: 'ring', type: 'fire' })]), H([mv(4)])],
  [1, 86, 'Apron of Many Burns', H([atk(2), shield(1)]), L([xp(1)], P('shield', 1, 6, 'Shield 1 the next six times you are attacked'))],
  [1, 43, 'Hammer and Tongs', H([atk(3, { use: use('fire', { n: 2, text: '+2 Attack' }) })]), H([heal(2, { range: 3 })])],
  [1, 33, 'Cinder Flick', H([atk(2, { range: 3, type: 'fire', use: use('fire', { n: 1, text: '+1 Attack' }) })]), H([mv(3)]), 'Off the end of the tongs. Mind your eyebrows.'],
  [1, 58, 'Oil Can', H([heal(2, { range: 3 }), shield(1, { range: 3 })]), H([mv(2), infuse('fire')]), 'Squeaks less. Burns more.'],
  // ---- level 2
  [2, 37, 'Riveted Plating', H([shield(1, { range: 3, all: true }), heal(1)]), H([mv(3), infuse('fire')]), 'Bolts everyone to something sturdier.'],
  [2, 80, 'Scrap Heap', H([atk(3, { push: 2 })]), H([mv(2), loot(2)])],
  // ---- level 3
  [3, 15, 'Molten Slag', H([atk(2, { range: 3, aoe: 'blast', type: 'fire', use: use('fire', { n: 1, cond: ['wound'], text: '+1 Attack, Wound' }) })]), H([mv(4)])],
  [3, 52, 'Foreman', H([buff(['strengthen'], { range: 3, all: true })]), H([mv(3), heal(2, { range: 3 })]), 'Shouts at the turret. The turret works harder. Nobody knows why.'],
  // ---- level 4
  [4, 69, 'Bellows Buddy', L([summon('bellows_buddy', 2)]), H([mv(2), shield(2)]), 'Retired. Unretired. Very large about it.'],
  [4, 28, 'Trip Hammer', H([atk(4, { push: 1, use: use('fire', { cond: ['stun'], text: 'Stun' }) })]), H([mv(3), infuse('fire')])],
  // ---- level 5
  [5, 11, 'Meltdown', L([atk(4, { aoe: 'ring', type: 'fire', cond: ['wound'], xp: 2, use: use('fire', { n: 2, text: '+2 Attack' }) })]), H([mv(5)])],
  [5, 91, 'Night Shift', H([shield(2, { range: 3, all: true })]), L([xp(2)], P('atk', 1, 0, '+1 Attack for the rest of the scenario')), 'The Forge never closed. It just moved.'],
]);
