// Scholar: stands at the back with the book. Ranged Magic and Fire, blasts and lines, alternates infusing one element
// and spending the other. Soft body: every lost card is a chapter you do not get back.
import { H, L, P, atk, deck, heal, infuse, loot, mv, recover, shield, tp, use, xp } from '../dsl';

export const SCHOLAR = deck('scholar', [
  // ---- level 1 (hand 10, so three spare to leave at home)
  [1, 23, 'Footnote', H([atk(2, { range: 3, type: 'magic' })]), H([mv(3)]), 'A small, pointed reference.'],
  [1, 42, 'Kindling Chapter', H([atk(2, { range: 3, type: 'fire' }), infuse('fire')]), H([mv(2)])],
  [1, 55, 'Citation Needed', H([atk(1, { range: 3, aoe: 'blast', type: 'magic', use: use('magic', { n: 1, text: '+1 Attack' }) })]), H([mv(3)])],
  [1, 67, 'Overdue Fines', L([atk(3, { range: 3, aoe: 'blast', type: 'fire', xp: 2, use: use('fire', { n: 1, cond: ['wound'], text: '+1 Attack, Wound' }) })]), H([mv(2), infuse('magic')]), 'Late fees are charged by the square.'],
  [1, 34, 'Study Break', H([heal(2), infuse('magic')]), H([mv(3), loot(1)])],
  [1, 15, 'Skip a Chapter', H([atk(2, { range: 2, type: 'magic' })]), H([tp(3)])],
  [1, 48, 'Dry Reading', H([atk(2, { range: 3, cond: ['immobilize'] })]), H([mv(2), shield(1)])],
  [1, 79, 'Thesis Defence', L([atk(4, { range: 4, type: 'magic', xp: 2, use: use('magic', { n: 2, text: '+2 Attack' }) })]), H([mv(3)])],
  [1, 60, 'Line of Inquiry', H([atk(2, { aoe: 'line3', type: 'magic' })]), H([mv(3)])],
  [1, 88, 'Bookmark', H([atk(2, { range: 2 })]), L([recover(2, 1)]), 'Never lose your place. Lose it twice, then find it.'],
  [1, 29, 'Red Pen', H([atk(2, { range: 3, type: 'fire', cond: ['wound'] })]), H([mv(2), infuse('fire')]), 'See me after class. Bring bandages.'],
  [1, 74, 'Do Not Disturb', H([atk(2, { range: 2, type: 'magic', push: 2 })]), H([mv(2), heal(2)])],
  [1, 81, 'Pop Quiz', H([atk(1, { range: 3, targets: 2, type: 'magic' })]), H([mv(3), infuse('magic')]), 'Nobody studied. Everybody fails.'],
  // ---- level 2
  [2, 27, 'Cone of Shame', H([atk(2, { aoe: 'cone', type: 'fire', use: use('fire', { n: 1, text: '+1 Attack' }) })]), H([mv(3)])],
  [2, 71, 'Marginalia', H([atk(3, { range: 3, type: 'magic', cond: ['muddle'] })]), H([mv(2), shield(1), infuse('magic')])],
  // ---- level 3
  [3, 38, 'Peer Review', H([atk(2, { range: 3, targets: 3, type: 'magic' })]), H([mv(3), infuse('fire')])],
  [3, 84, 'Library Fire', L([atk(3, { range: 4, aoe: 'blast', type: 'fire', cond: ['wound'], xp: 2 })]), H([tp(3)]), 'The books were going to burn anyway. Eventually. Probably.'],
  // ---- level 4
  [4, 19, 'Cross Reference', H([atk(2, { range: 3, aoe: 'cross', type: 'magic', use: use('magic', { n: 1, cond: ['immobilize'], text: '+1 Attack, Immobilize' }) })]), H([mv(4)])],
  [4, 92, 'Speed Reading', H([atk(3, { range: 4, type: 'fire' })]), L([infuse('magic'), xp(2)], P('atk', 1, 6, '+1 Attack on your next six attacks'))],
  // ---- level 5
  [5, 31, 'Final Chapter', L([atk(5, { range: 4, aoe: 'blast', type: 'magic', xp: 2, use: use('fire', { n: 1, cond: ['stun'], text: '+1 Attack, Stun' }) })]), H([mv(3), heal(2)])],
  [5, 57, 'Mixed Media', H([atk(3, { range: 3, type: 'fire' }), atk(3, { range: 3, type: 'magic' })]), H([tp(4), infuse('fire')])],
]);
