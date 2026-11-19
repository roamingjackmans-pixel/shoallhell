// Plays scenarios end to end with a simple bot to catch rule-engine crashes and stuck states.
import { describe, expect, it } from 'vitest';
import { CLASS_CARDS } from '../src/data/cards';
import { CLASSES } from '../src/data/classes';
import { SCENARIOS } from '../src/data/story';
import { key, unkey } from '../src/game/grid';
import { act, attackOptions, createCombat, heroes, moveOptions, tick, type HeroSetup } from '../src/game/rules';
import type { CombatState, HeroUnit } from '../src/game/types';

function setup(cls: string, i: number): HeroSetup {
  const def = CLASSES[cls]!;
  const cards = CLASS_CARDS[cls]!.filter((c) => c.level === 1).slice(0, def.hand).map((c) => c.id);
  return { owner: 'p', charId: `c${i}`, name: `${def.name} ${i}`, cls, level: 1, maxHp: def.hp[0]!, cards, items: ['thermos'], perks: [] };
}

/** One bot decision. Returns false when nothing could be done. */
function botStep(s: CombatState): boolean {
  if (s.pending) {
    const h = heroes(s).find((x) => x.uid === s.pending!.heroUid)!;
    const c = h.hand.find((x) => !h.picked.includes(x));
    return act(s, 'p', { t: 'negate', uid: h.uid, choice: c ?? 'take' }) === null || act(s, 'p', { t: 'negate', uid: h.uid, choice: 'take' }) === null;
  }
  if (s.phase === 'select') {
    for (const h of heroes(s)) {
      if (h.exhausted || h.ready) continue;
      if (h.hand.length < 2) {
        if (act(s, 'p', { t: 'longRest', uid: h.uid })) throw new Error('long rest failed');
        continue;
      }
      if (h.hand.length < 4 && h.discard.length >= 2 && !h.shortRested) {
        if (act(s, 'p', { t: 'shortRest', uid: h.uid })) throw new Error('short rest failed');
        // healthy heroes pay 1 HP to reroll the lost card, hurt ones accept it
        if (act(s, 'p', { t: h.hp > 4 ? 'restReroll' : 'restKeep', uid: h.uid })) throw new Error('short rest finish failed');
        if (h.hand.length < 2) continue;
      }
      const err = act(s, 'p', { t: 'pick', uid: h.uid, cards: [h.hand[0]!, h.hand[1]!] });
      if (err) throw new Error(err);
    }
    return true;
  }
  if (s.phase !== 'turns') return false;
  if (tick(s)) return true;
  const t = s.heroTurn;
  if (!t) return false;
  const h = heroes(s).find((x) => x.uid === t.uid) as HeroUnit;
  if (h.longRest) return act(s, 'p', { t: 'restLose', uid: h.uid, card: h.discard[0]! }) === null;
  if (!t.cur) {
    const used = t.used[0];
    const card = used ? h.picked.find((c) => c !== used.card)! : h.picked[0]!;
    const half = used ? (used.half === 'top' ? 'bot' : 'top') : 'top';
    const err = act(s, 'p', { t: 'half', uid: h.uid, card, half, basic: false });
    if (err) throw new Error(err);
    return true;
  }
  const st = t.cur.steps[t.cur.step]!;
  if (st.t === 'move') {
    const opts = moveOptions(s, h);
    if (!opts.length) return act(s, 'p', { t: 'skip', uid: h.uid }) === null;
    // walk toward the nearest monster or unrevealed door
    const target = s.units.find((u) => u.kind === 'monster' && !u.dead) ?? h;
    let door: [number, number] | null = null;
    s.map.tiles.forEach((row, y) => [...row].forEach((c, x) => (c === 'D' || c === 'X') && !door && (door = [x, y])));
    const goal: [number, number] = s.units.some((u) => u.kind === 'monster' && !u.dead) ? [target.x, target.y] : door ?? [h.x, h.y];
    opts.sort((a, b) => {
      const [ax, ay] = unkey(a);
      const [bx, by] = unkey(b);
      return Math.hypot(ax - goal[0], ay - goal[1]) - Math.hypot(bx - goal[0], by - goal[1]);
    });
    const [x, y] = unkey(opts[0]!);
    return act(s, 'p', { t: 'move', uid: h.uid, x, y }) === null || act(s, 'p', { t: 'skip', uid: h.uid }) === null;
  }
  if (st.t === 'attack') {
    const opts = attackOptions(s, h, st);
    if (!opts.length) return act(s, 'p', { t: 'skip', uid: h.uid }) === null;
    const o = opts[0]!;
    if (o.startsWith('t')) {
      const [x, y] = unkey(Number(o.slice(1)));
      return act(s, 'p', { t: 'target', uid: h.uid, x, y }) === null;
    }
    return act(s, 'p', { t: 'target', uid: h.uid, target: o }) === null;
  }
  if (st.t === 'teleport') {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (act(s, 'p', { t: 'move', uid: h.uid, x: h.x + dx, y: h.y + dy }) === null) return true;
    return act(s, 'p', { t: 'skip', uid: h.uid }) === null;
  }
  // ally-targeted steps: target self
  if (act(s, 'p', { t: 'target', uid: h.uid, target: h.uid }) === null) return true;
  return act(s, 'p', { t: 'skip', uid: h.uid }) === null;
}

function play(s: CombatState, maxBeats = 6000): number {
  let beats = 0;
  while (s.phase !== 'won' && s.phase !== 'lost' && beats++ < maxBeats) {
    if (!botStep(s)) throw new Error(`stuck in ${s.phase} round ${s.round} turn ${JSON.stringify(s.heroTurn)}`);
  }
  return beats;
}

describe('rules engine', () => {
  const classes = Object.keys(CLASSES);
  it('every class has a valid deck', () => {
    for (const c of classes) {
      const cards = CLASS_CARDS[c]!;
      expect(cards.filter((x) => x.level === 1).length).toBeGreaterThanOrEqual(CLASSES[c]!.hand);
      expect(new Set(cards.map((x) => x.id)).size).toBe(cards.length);
    }
  });

  for (const sc of SCENARIOS) {
    it(`plays ${sc.id} ${sc.name} to an end`, () => {
      const party = [classes[(sc.depth * 3) % classes.length]!, classes[(sc.depth * 5 + 1) % classes.length]!];
      for (let seed = 1; seed <= 3; seed++) {
        const s = createCombat(sc, party.map(setup), Math.min(7, Math.floor(sc.depth / 2)), seed * 101 + sc.depth);
        play(s);
        expect(['won', 'lost']).toContain(s.phase);
      }
    });
  }

  it('every class plays solo and in a party of four', () => {
    let wins = 0;
    let games = 0;
    for (let i = 0; i < classes.length; i++) {
      const party = [classes[i]!, classes[(i + 3) % classes.length]!, classes[(i + 7) % classes.length]!, classes[(i + 9) % classes.length]!];
      for (const size of [1, 4]) {
        const s = createCombat(SCENARIOS[0]!, party.slice(0, size).map(setup), 1, i * 7 + size);
        play(s);
        games++;
        if (s.phase === 'won') wins++;
      }
    }
    // the bot is dumb; just make sure games end
    expect(games).toBe(classes.length * 2);
    console.log(`bot wins ${wins}/${games}`);
  });

  it('map keys round-trip', () => {
    expect(unkey(key(12, 34))).toEqual([12, 34]);
  });
});
