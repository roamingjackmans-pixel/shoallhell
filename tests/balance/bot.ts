// A reasonably sensible bot for balance runs. It is the same player for every class, so differences in win rate
// come from the cards. It:
// - picks the best top/bottom pair from its hand (attack value when enemies are near, moves when they are far,
//   healing when hurt, a penalty for lost halves),
// - moves before attacking when nothing is in reach, keeps ranged heroes at range,
// - attacks what it can kill (else the weakest), aims area attacks at the most enemies,
// - rests when it must, and burns cards only to survive a lethal hit.
import { CLASSES } from '../../src/data/classes';
import { hexDist, unkey } from '../../src/game/grid';
import { act, aoeTiles, attackOptions, cardDef, heroes, monsters, moveOptions, pushOptions, tick } from '../../src/game/rules';
import type { CombatState, Half, HeroUnit, Step } from '../../src/game/types';

const P = 'p';

function nearestFoe(s: CombatState, h: HeroUnit): { d: number; x: number; y: number } | null {
  let best: { d: number; x: number; y: number } | null = null;
  for (const m of monsters(s)) {
    const d = hexDist(h.x, h.y, m.x, m.y);
    if (!best || d < best.d) best = { d, x: m.x, y: m.y };
  }
  return best;
}

/** Rough worth of one ability line right now. */
function stepValue(st: Step, h: HeroUnit, foeDist: number, lostCards: number): number {
  const hurt = h.maxHp - h.hp;
  switch (st.t) {
    case 'attack': {
      const reach = Math.max(1, st.range) + 3;
      const near = foeDist <= reach ? 1 : 0.35;
      const many = st.aoe || st.all ? 1.6 : (st.targets ?? 1) > 1 ? 1.4 : 1;
      return (st.n * many + (st.cond?.length ?? 0) * 0.6 + (st.push ?? 0) * 0.2 + (st.pierce ?? 0) * 0.3 - (st.selfDmg ?? 0) * 0.5) * near;
    }
    case 'move':
      return foeDist > 1 ? Math.min(st.n, foeDist) * 0.55 + (st.jump ? 0.3 : 0) : 0.2;
    case 'heal':
      return Math.min(st.n, hurt) * 0.8 + (st.all ? 0.5 : 0);
    case 'shield':
      return st.n * (foeDist <= 4 ? 1.1 : 0.3);
    case 'retaliate':
      return st.n * (foeDist <= 3 ? 0.8 : 0.2);
    case 'buff':
      return st.cond.length * 0.8;
    case 'loot':
      return 0.4;
    case 'infuse':
      return 0.3;
    case 'summon':
      return 3;
    case 'recover':
      return Math.min(st.n, lostCards) * 1.5;
    case 'bless':
      return st.n * 0.8;
    case 'curse':
      return st.n * 0.6;
    case 'teleport':
      return foeDist > 1 ? Math.min(st.n, foeDist) * 0.5 : 0.2;
    case 'xp':
      return 0;
  }
}

function halfValue(half: Half, h: HeroUnit, foeDist: number): number {
  let v = half.steps.reduce((n, st) => n + stepValue(st, h, foeDist, h.lost.length), 0);
  if (half.persist) v += 2.5;
  // a lost half costs a card for the rest of the fight: worth it only when it is strong
  if (half.lost) v -= 2 + Math.max(0, 6 - h.hand.length) * 0.4;
  return v;
}

/** The best (top card, bottom card) pair; the top card leads. */
function choosePair(s: CombatState, h: HeroUnit): [string, string] {
  const foe = nearestFoe(s, h);
  const fd = foe?.d ?? 8;
  let best: [string, string] = [h.hand[0]!, h.hand[1]!];
  let bestV = -Infinity;
  for (const a of h.hand)
    for (const b of h.hand) {
      if (a === b) continue;
      const v = halfValue(cardDef(a).top, h, fd) + halfValue(cardDef(b).bot, h, fd);
      if (v > bestV) {
        bestV = v;
        best = [a, b];
      }
    }
  return best;
}

/** Choose a move destination: ranged heroes stay at range, melee ones close in; with no foes, head for a door. */
function moveTarget(s: CombatState, h: HeroUnit, opts: number[]): [number, number] {
  const foe = nearestFoe(s, h);
  const ranged = CLASSES[h.cls]?.role.toLowerCase().includes('ranged') ?? false;
  if (!foe) {
    let door: [number, number] | null = null;
    s.map.tiles.forEach((row, y) => [...row].forEach((c, x) => (c === 'D' || c === 'X') && !door && (door = [x, y])));
    const g = door ?? [h.x, h.y];
    const sorted = [...opts].sort((a, b) => {
      const [ax, ay] = unkey(a);
      const [bx, by] = unkey(b);
      return hexDist(ax, ay, g[0], g[1]) - hexDist(bx, by, g[0], g[1]);
    });
    return unkey(sorted[0]!) as [number, number];
  }
  const want = ranged ? 3 : 1;
  const score = (k: number): number => {
    const [x, y] = unkey(k);
    const d = hexDist(x, y, foe.x, foe.y);
    return Math.abs(d - want) * 10 + (ranged && d === 1 ? 20 : 0) + hexDist(x, y, h.x, h.y) * 0.1;
  };
  const sorted = [...opts].sort((a, b) => score(a) - score(b));
  const here = Math.abs(foe.d - want) * 10 + (ranged && foe.d === 1 ? 20 : 0);
  const [x, y] = unkey(sorted[0]!);
  return score(sorted[0]!) < here ? [x, y] : [h.x, h.y];
}

/** One decision. Returns false when nothing could be done. */
export function smartStep(s: CombatState): boolean {
  if (s.pending) {
    const h = heroes(s).find((x) => x.uid === s.pending!.heroUid)!;
    const lethal = s.pending.dmg >= h.hp;
    if (lethal) {
      const c = h.hand.filter((x) => !h.picked.includes(x)).sort((a, b) => cardDef(a).top.steps.length - cardDef(b).top.steps.length)[0];
      if (c && act(s, P, { t: 'negate', uid: h.uid, choice: c }) === null) return true;
      if (h.discard.length >= 2 && act(s, P, { t: 'negate', uid: h.uid, choice: `discard:${h.discard[0]},${h.discard[1]}` }) === null) return true;
    }
    return act(s, P, { t: 'negate', uid: h.uid, choice: 'take' }) === null;
  }
  if (s.phase === 'select') {
    for (const h of heroes(s)) {
      if (h.exhausted || h.ready) continue;
      if (h.hand.length < 2) {
        if (act(s, P, { t: 'longRest', uid: h.uid })) throw new Error('long rest failed');
        continue;
      }
      // long rest when hurt and the discard is worth getting back; short rest when the hand runs low
      if (h.discard.length >= 4 && h.hp <= h.maxHp / 2 && h.hand.length <= 4) {
        if (act(s, P, { t: 'longRest', uid: h.uid }) === null) continue;
      }
      if (h.hand.length < 4 && h.discard.length >= 2 && !h.shortRested) {
        if (act(s, P, { t: 'shortRest', uid: h.uid })) throw new Error('short rest failed');
        if (act(s, P, { t: h.hp > 4 ? 'restReroll' : 'restKeep', uid: h.uid })) throw new Error('short rest finish failed');
        if (h.hand.length < 2) continue;
      }
      const err = act(s, P, { t: 'pick', uid: h.uid, cards: choosePair(s, h) });
      if (err) throw new Error(err);
    }
    return true;
  }
  if (s.phase !== 'turns') return false;
  if (tick(s)) return true;
  if (s.pushQ?.length && s.heroTurn) {
    const o = pushOptions(s)[0]!;
    return act(s, P, { t: 'push', uid: s.heroTurn.uid, x: o[0], y: o[1] }) === null;
  }
  const t = s.heroTurn;
  if (!t) return false;
  const h = heroes(s).find((x) => x.uid === t.uid) as HeroUnit;
  if (h.longRest) {
    // lose the weakest discard
    if (!h.discard.length) return act(s, P, { t: 'restLose', uid: h.uid, card: '' }) === null;
    const worst = [...h.discard].sort((a, b) => halfValue(cardDef(a).top, h, 3) + halfValue(cardDef(a).bot, h, 3) - (halfValue(cardDef(b).top, h, 3) + halfValue(cardDef(b).bot, h, 3)))[0]!;
    return act(s, P, { t: 'restLose', uid: h.uid, card: worst }) === null;
  }
  if (!t.cur) {
    const [top, bot] = h.picked as [string, string];
    const used = t.used[0];
    if (!used) {
      // nothing to hit yet and the bottom moves: move first
      const firstTop = cardDef(top).top.steps[0];
      const botMoves = cardDef(bot).bot.steps.some((x) => x.t === 'move' || x.t === 'teleport');
      const canHit = firstTop?.t === 'attack' ? attackOptions(s, h, firstTop).length > 0 : true;
      const moveFirst = !canHit && botMoves;
      const r = moveFirst
        ? act(s, P, { t: 'half', uid: h.uid, card: bot, half: 'bot', basic: false })
        : act(s, P, { t: 'half', uid: h.uid, card: top, half: 'top', basic: false });
      if (r) throw new Error(r);
      return true;
    }
    const card = used.card === top ? bot : top;
    const half = used.half === 'top' ? 'bot' : 'top';
    const r = act(s, P, { t: 'half', uid: h.uid, card, half, basic: false });
    if (r) throw new Error(r);
    return true;
  }
  if (t.cur.elAsk) return act(s, P, { t: 'useEl', uid: h.uid, el: t.cur.elAsk[0]! }) === null;
  const st = t.cur.steps[t.cur.step]!;
  if (st.t === 'recover') return act(s, P, { t: 'recover', uid: h.uid, cards: h.lost.slice(0, st.n) }) === null;
  if (st.t === 'move' || st.t === 'teleport') {
    const opts = st.t === 'move' ? moveOptions(s, h) : [];
    if (st.t === 'teleport') {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (act(s, P, { t: 'move', uid: h.uid, x: h.x + dx, y: h.y + dy }) === null) return true;
      return act(s, P, { t: 'skip', uid: h.uid }) === null;
    }
    if (!opts.length) return act(s, P, { t: 'skip', uid: h.uid }) === null;
    const [x, y] = moveTarget(s, h, opts);
    if (x === h.x && y === h.y) return act(s, P, { t: 'skip', uid: h.uid }) === null;
    return act(s, P, { t: 'move', uid: h.uid, x, y }) === null || act(s, P, { t: 'skip', uid: h.uid }) === null;
  }
  if (st.t === 'attack') {
    const opts = attackOptions(s, h, st);
    if (!opts.length) return act(s, P, { t: 'skip', uid: h.uid }) === null;
    if (opts[0]!.startsWith('t')) {
      // area: the aim that hits the most enemies
      const scored = opts.map((o) => {
        const [x, y] = unkey(Number(o.slice(1)));
        const hits = aoeTiles(s, h, st, x, y).filter(([ax, ay]) => monsters(s).some((m) => m.x === ax && m.y === ay)).length;
        return { x, y, hits };
      });
      scored.sort((a, b) => b.hits - a.hits);
      return act(s, P, { t: 'target', uid: h.uid, x: scored[0]!.x, y: scored[0]!.y }) === null;
    }
    // something we can kill, else the weakest
    const foes = opts.map((id) => monsters(s).find((m) => m.uid === id)!).filter(Boolean);
    foes.sort((a, b) => (a.hp <= st.n ? -100 : 0) + a.hp - ((b.hp <= st.n ? -100 : 0) + b.hp));
    return act(s, P, { t: 'target', uid: h.uid, target: foes[0]?.uid ?? opts[0]! }) === null;
  }
  // ally-targeted steps: the most hurt ally in reach (solo: yourself)
  if (act(s, P, { t: 'target', uid: h.uid, target: h.uid }) === null) return true;
  return act(s, P, { t: 'skip', uid: h.uid }) === null;
}

export function playOut(s: CombatState, maxBeats = 8000): void {
  let beats = 0;
  while (s.phase !== 'won' && s.phase !== 'lost' && beats++ < maxBeats) {
    if (!smartStep(s)) throw new Error(`stuck in ${s.phase} round ${s.round}: ${JSON.stringify({ turn: s.heroTurn, slot: s.order[s.turnIdx], pending: s.pending, pushQ: s.pushQ })}`);
  }
}
