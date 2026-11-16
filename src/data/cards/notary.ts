// Notary: paperwork first. Stamps a condition on everything within whip reach, curses the monster deck, lets the intern do the legwork.
import { H, L, P, atk, buff, curse, deck, heal, infuse, loot, mv, shield, summon, use, xp } from '../dsl';

export const NOTARY = deck('notary', [
  // ---- level 1 (hand 11, so one spare to leave at home)
  [1, 21, 'Sign Here', H([atk(2, { range: 2, cond: ['muddle'] })]), H([mv(3)]), 'And here. And initial here. And here.'],
  [1, 34, 'Cease and Desist', H([atk(2, { range: 2, cond: ['disarm'] })]), H([mv(2), shield(1)])],
  [1, 46, 'Red Tape', H([atk(2, { range: 2, cond: ['immobilize'] })]), H([mv(2), infuse('void')])],
  [1, 58, 'Small Print', H([curse(2, 3, 1)]), H([mv(3), loot(1)]), 'Clause 41(b): you lose.'],
  [1, 15, 'Rubber Stamp', H([atk(3, { use: use('void', { cond: ['stun'], text: 'Stun' }) })]), H([mv(3)]), 'DENIED. In red. Twice.'],
  [1, 72, 'Unpaid Intern', L([summon('intern', 2)]), H([mv(2), loot(1)]), 'Paid in exposure. To the Shoal.'],
  [1, 40, 'Poison Pen', H([atk(2, { range: 3, type: 'void', cond: ['poison'] })]), H([mv(2), heal(2)])],
  [1, 64, 'Filed in Triplicate', H([atk(1, { range: 2, targets: 3, cond: ['poison'] })]), H([mv(3)])],
  [1, 85, 'Notice of Eviction', L([atk(4, { range: 2, type: 'void', push: 2, cond: ['stun'], xp: 2 })]), H([mv(2), infuse('void')]), 'Old habits. New tenants.'],
  [1, 27, 'Billable Hours', H([mv(2), atk(2, { range: 2 })]), L([xp(1)], P('cond', 0, 4, 'Your next four attacks Poison', 'poison'))],
  [1, 92, 'Out of Office', H([buff(['invisible'])]), H([mv(3), shield(1)]), 'Back Monday. Which Monday is unclear.'],
  [1, 52, 'Notarise', H([atk(2, { range: 2, type: 'void', use: use('void', { n: 1, targets: 2, text: '+1 Attack, +1 Target' }) })]), H([curse(1, 2), mv(2)])],
  // ---- level 2
  [2, 38, 'Please Hold', H([atk(2, { range: 3, aoe: 'blast', cond: ['muddle'] })]), H([mv(3)]), 'Your call is important to us.'],
  [2, 77, 'Delegate', H([atk(2, { range: 2, targets: 2, cond: ['muddle'] })]), L([summon('intern', 2)]), 'Someone has to do it. It will not be the Notary.'],
  // ---- level 3
  [3, 18, 'Injunction', H([atk(3, { range: 2, cond: ['stun'] })]), H([mv(3), shield(1)])],
  [3, 60, 'Standing Order', H([atk(3, { range: 2, cond: ['disarm'], use: use('void', { n: 1, cond: ['stun'], text: '+1 Attack, Stun' }) })]), L([xp(2)], P('cond', 0, 6, 'Your next six attacks Muddle', 'muddle'))],
  // ---- level 4
  [4, 31, 'Foreclosure', L([atk(5, { range: 2, type: 'void', cond: ['poison', 'disarm'], xp: 2, use: use('void', { n: 2, text: '+2 Attack' }) })]), H([mv(4)]), 'The Landlord taught this one personally. Big mistake.'],
  [4, 88, 'Appeal Denied', H([curse(2, 3), atk(2, { range: 3, cond: ['muddle'] })]), H([heal(3), infuse('void')])],
  // ---- level 5
  [5, 9, 'Hostile Takeover', L([atk(4, { range: 3, aoe: 'blast', type: 'void', cond: ['stun'], xp: 2 })]), H([mv(4), loot(2)])],
  [5, 95, 'Terms and Conditions', H([atk(4, { range: 2, targets: 2, cond: ['poison'] })]), L([curse(3, 4), xp(2)]), 'Nobody reads them. Everybody is bound by them.'],
]);
