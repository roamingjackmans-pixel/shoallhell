// The flash tests' bot: the balance bot (tests/balance/bot.ts) with a little help finding the door, plus helpers to
// set up and play a FlashGames scenario. Used by tests/flash.test.ts.
import { flashCombat, rngFor, type FlashCfg } from '../../src/flash/run';
import { key, neighbors, roomAt, tile, unkey } from '../../src/game/grid';
import { act, cardDef, heroes, monsters, moveOptions, tick } from '../../src/game/rules';
import type { CombatState, HeroUnit } from '../../src/game/types';
import { smartStep } from './bot';

export const SEED = 20261124;
export const cfgOf = (mods: string[], seed = SEED): FlashCfg => ({ mods, rng: rngFor(seed) });

/** Scenario k of a day, with the heroes given to the test bot's player ('p'). */
export function fight(k: number, mods: string[], seed = SEED): CombatState {
  const { state } = flashCombat(k, cfgOf(mods, seed));
  for (const h of heroes(state)) h.owner = 'p';
  return state;
}

const walkable = (c: string): boolean => c !== '#' && c !== ' ' && c !== 'o' && c !== '';

/** Walking distance (hexes, figures ignored) from a hex to every hex; a closed door is reached but not walked past. */
function walkFrom(s: CombatState, x0: number, y0: number): Map<number, number> {
  const out = new Map<number, number>([[key(x0, y0), 0]]);
  const q: [number, number][] = [[x0, y0]];
  while (q.length) {
    const [x, y] = q.shift()!;
    const d = out.get(key(x, y))!;
    if (d > 0 && tile(s.map, x, y) === 'D') continue;
    for (const [nx, ny] of neighbors(x, y)) {
      const k = key(nx, ny);
      if (out.has(k) || !walkable(tile(s.map, nx, ny))) continue;
      out.set(k, d + 1);
      q.push([nx, ny]);
    }
  }
  return out;
}

/** Where a hero heads with nothing to fight: the nearest closed door of an open room, or the exit once its room is open. */
function wayOut(s: CombatState, h: HeroUnit): [number, number] | null {
  const open = (x: number, y: number): boolean => {
    const r = roomAt(s.map, x, y);
    return r >= 0 && !!s.map.rooms[r]?.revealed;
  };
  const dist = walkFrom(s, h.x, h.y);
  let best: [number, number] | null = null;
  let bd = Infinity;
  s.map.tiles.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const ok = (c === 'D' && neighbors(x, y).some(([nx, ny]) => open(nx, ny))) || (c === 'X' && open(x, y));
      const d = dist.get(key(x, y)) ?? Infinity;
      if (ok && d < bd) {
        bd = d;
        best = [x, y];
      }
    }),
  );
  return best;
}

/**
 * The balance bot, plus a way out of a cleared room. With no monster in sight it picks a pair whose bottom moves,
 * walks first (a bottom used as a basic Move 2 if neither moves) and heads for the nearest door or exit by walking
 * distance, staying put on the exit. (The balance bot walks as the crow flies toward the first door on the map and
 * never changes its pick while its hand does not: harmless when cards run out, endless with Bottomless Hand.)
 */
export function botStep(s: CombatState): boolean {
  // a long fight is a stalemate (the same pick every round, e.g. with Bottomless Hand): rotate the pair each round
  if (s.phase === 'select' && !s.pending && s.round > 25) {
    for (const h of heroes(s)) {
      if (h.exhausted || h.ready || h.hand.length < 2 || h.restDraw) continue;
      const hand = [...h.hand].sort();
      const a = hand[s.round % hand.length]!;
      const b = hand[(s.round * 3 + 1) % hand.length] === a ? hand[(s.round + 1) % hand.length]! : hand[(s.round * 3 + 1) % hand.length]!;
      if (a !== b && act(s, 'p', { t: 'pick', uid: h.uid, cards: [a, b] })) return smartStep(s);
    }
  }
  if (s.pending || monsters(s).length > 0) return smartStep(s);
  const moves = (c: string): number => cardDef(c).bot.steps.reduce((n, st) => n + (st.t === 'move' ? st.n : 0), 0);
  if (s.phase === 'select') {
    for (const h of heroes(s)) {
      if (h.exhausted || h.ready || h.hand.length < 2 || h.restDraw) continue;
      const bot = [...h.hand].sort((a, b) => moves(b) - moves(a))[0]!;
      if (moves(bot) === 0) continue;
      const top = h.hand.find((c) => c !== bot)!;
      if (act(s, 'p', { t: 'pick', uid: h.uid, cards: [top, bot] })) return smartStep(s);
    }
    return smartStep(s);
  }
  if (s.phase !== 'turns') return smartStep(s);
  if (tick(s)) return true;
  const t = s.heroTurn;
  const h = t?.started && !s.pushQ?.length ? heroes(s).find((x) => x.uid === t.uid) : undefined;
  if (!t || !h || h.longRest) return smartStep(s);
  if (!t.cur && !t.used.some((u) => u.half === 'bot')) {
    const free = h.picked.filter((c) => !t.used.some((u) => u.card === c));
    const card = free.find((c) => moves(c) > 0) ?? free[0];
    if (card && act(s, 'p', { t: 'half', uid: h.uid, card, half: 'bot', basic: moves(card) === 0 }) === null) return true;
  }
  const st = t.cur?.steps[t.cur.step];
  if (t.cur && !t.cur.elAsk && st?.t === 'move') {
    const goal = wayOut(s, h);
    const opts = moveOptions(s, h);
    if (!goal || !opts.length || (goal[0] === h.x && goal[1] === h.y)) return act(s, 'p', { t: 'skip', uid: h.uid }) === null;
    const toGoal = walkFrom(s, goal[0], goal[1]);
    const d = (k: number): number => toGoal.get(k) ?? Infinity;
    const best = [...opts].sort((a, b) => d(a) - d(b))[0]!;
    if (d(best) >= d(key(h.x, h.y))) return act(s, 'p', { t: 'skip', uid: h.uid }) === null;
    const [x, y] = unkey(best);
    return act(s, 'p', { t: 'move', uid: h.uid, x, y }) === null || act(s, 'p', { t: 'skip', uid: h.uid }) === null;
  }
  return smartStep(s);
}

/** Play to the end with the bot; `each` sees the state before every bot decision. */
export function playOut(s: CombatState, each?: (s: CombatState) => void, maxBeats = 12000): void {
  let beats = 0;
  while (s.phase !== 'won' && s.phase !== 'lost') {
    if (beats++ > maxBeats)
      throw new Error(
        `no end after ${maxBeats} beats: ${s.scenario.id} ${s.scenario.objective.kind} round ${s.round}, ${monsters(s).length} monsters left, rooms ${s.map.rooms.map((r) => (r.revealed ? 1 : 0)).join('')}, mods ${JSON.stringify(s.house)} heroes ${heroes(s).map((h) => `${h.name}@${h.x},${h.y} hand ${h.hand.length} ex ${h.exhausted}`).join('; ')}\n${s.log.slice(-8).map((l) => l.t).join('\n')}`,
      );
    each?.(s);
    if (!botStep(s)) throw new Error(`stuck in ${s.phase} round ${s.round}: ${JSON.stringify({ turn: s.heroTurn, slot: s.order[s.turnIdx], pending: s.pending })}`);
  }
}
