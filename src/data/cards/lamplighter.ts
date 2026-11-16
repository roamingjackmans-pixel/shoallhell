// Lamplighter: the lantern at the back. Stays three or four spaces out, throws holy light, heals, shields and strengthens the people in front.
import { H, L, P, atk, bless, buff, deck, heal, infuse, loot, mv, shield, summon, use, xp } from '../dsl';

export const LAMPLIGHTER = deck('lamplighter', [
  // ---- level 1 (hand 11, so one spare to leave at home)
  [1, 22, 'Light the Way', H([atk(2, { range: 4, type: 'holy' })]), H([mv(3), loot(1)]), 'Thirty years of stairs. The Shoal has fewer stairs. She misses them.'],
  [1, 64, 'Mend the Wick', H([heal(3, { range: 3 })]), H([mv(3)])],
  [1, 41, 'Strike a Match', H([atk(2, { range: 3, type: 'holy' }), infuse('holy')]), H([mv(2), heal(1, { range: 3 })])],
  [1, 79, 'Lamp Oil', H([heal(2, { range: 3, use: use('holy', { heal: 2, text: '+2 Heal' }) })]), H([mv(3), shield(1, { range: 3 })])],
  [1, 30, 'Long Reach', H([atk(3, { range: 2, push: 1 })]), H([mv(4)]), 'The pole is for the high lamps. And the high goblins.'],
  [1, 55, 'Keep the Lights On', H([shield(1, { range: 3, all: true })]), H([mv(2), infuse('holy')])],
  [1, 47, 'Moth Jar', L([summon('moths', 2)]), H([mv(3), heal(1)]), 'They come for the light. They stay for the shins.'],
  [1, 17, 'Bright Idea', H([buff(['strengthen'], { range: 4 })]), H([mv(4)])],
  [1, 88, 'Long Service', L([heal(3, { range: 3, all: true, xp: 2 })]), H([mv(3), shield(1)]), 'Got a watch for it. The watch does not light up.'],
  [1, 36, 'Flare', L([atk(3, { range: 3, aoe: 'blast', type: 'holy', cond: ['muddle'], xp: 2 })]), H([mv(2), loot(2)]), 'Everything in the dark is now in the light. Including that.'],
  [1, 70, 'Lantern Swing', H([atk(2, { aoe: 'cleave', type: 'holy' })]), H([heal(2), shield(1)])],
  [1, 59, 'Everburning Lamp', H([atk(2, { range: 4, type: 'holy', cond: ['muddle'] })]), L([xp(1)], P('drain', 1, 0, 'Heal 1 whenever you attack, for the rest of the scenario'))],
  // ---- level 2
  [2, 26, 'Evening Round', H([heal(2, { range: 2, all: true })]), H([mv(4), infuse('holy')])],
  [2, 75, 'Guiding Light', H([atk(3, { range: 3, type: 'holy', use: use('holy', { n: 1, range: 1, text: '+1 Attack, +1 Range' }) })]), H([mv(1), buff(['regenerate'], { range: 3 })])],
  // ---- level 3
  [3, 13, 'Dawn Patrol', H([buff(['strengthen'], { range: 3, all: true })]), H([mv(4)]), 'Up before the lamps go out. Up before the lamps, really.'],
  [3, 50, 'Moth Season', H([atk(3, { range: 3, type: 'holy', cond: ['immobilize'] })]), L([summon('moths', 2)])],
  // ---- level 4
  [4, 34, 'Beacon', L([atk(4, { range: 4, aoe: 'blast', type: 'holy', xp: 2, use: use('holy', { n: 1, cond: ['stun'], text: '+1 Attack, Stun' }) })]), H([mv(3), shield(1, { range: 3, all: true })])],
  [4, 82, 'Vigil', H([heal(3, { range: 4 }), buff(['regenerate'], { range: 4 })]), L([bless(3, 4, 2)]), 'Someone stays up. It is always her.'],
  // ---- level 5
  [5, 8, 'First Light', L([heal(4, { range: 4, all: true }), shield(2, { range: 4, all: true, xp: 2 })]), H([mv(5)]), 'The Shoal has never had a morning. It has one now.'],
  [5, 89, 'Lighthouse', H([atk(3, { range: 4, targets: 2, type: 'holy' })]), L([xp(2)], P('atk', 1, 0, '+1 Attack for the rest of the scenario'))],
]);
