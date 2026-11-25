// A FlashGames run of Shoallhell, without the browser: the day's party, its chain of seeded scenarios (each one a
// Depth deeper), the modifiers' changes to the party, the map and the decks, and the score. Everything comes from the
// day's seed and modifiers, so everyone playing that day gets the same party and the same maps. Nothing here reads or
// writes a save. src/flash/boot.ts puts it on screen; tests/flash.test.ts plays it with a bot.
import { CLASS_CARDS, starterCards } from '../data/cards';
import { CLASS_IDS, CLASSES } from '../data/classes';
import { ITEMS } from '../data/items';
import { BOSSES, monsterDef } from '../data/monsters';
import { DELVE_NAMES, DEPTHS, SCENARIOS, type ScenarioDef } from '../data/story';
import { handFor, type Character } from '../game/campaign';
import { hexDist, key } from '../game/grid';
import type { Generated } from '../game/procgen';
import { createCombat, heroes, log, type HeroSetup } from '../game/rules';
import type { CombatState, Mod, Objective, Spawn } from '../game/types';
import { FLASH_MODS, houseRules } from './mods';

/** A seeded random stream for a salt, like FlashRun.rng(salt). */
export type RngFor = (salt: string) => () => number;

/**
 * The same streams as FlashRun.rng (mulberry32 seeded with the day's seed xor an FNV-1a hash of the salt), for tests
 * and tools that run without the page.
 */
export function rngFor(seed: number): RngFor {
  return (salt: string) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 16777619) >>> 0;
    let a = ((seed >>> 0) ^ h) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
}

export interface FlashCfg {
  /** the day's modifier ids */
  mods: readonly string[];
  /** the day's seeded streams (FlashRun.rng) */
  rng: RngFor;
}

/** The player id the flash party belongs to (there is no account). */
export const FLASH_OWNER = 'flash';
/** Heroes in the party: one player controls both, as in solo play. */
export const PARTY_SIZE = 2;

const has = (cfg: FlashCfg, id: string): boolean => cfg.mods.includes(id);
const pickOf = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;

/** The day's party: two different classes and their level, from FlashRun.rng('party'). */
export function partyPlan(cfg: FlashCfg): { classes: string[]; level: number } {
  const r = cfg.rng('party');
  const pool = [...CLASS_IDS];
  const classes: string[] = [];
  for (let i = 0; i < PARTY_SIZE; i++) classes.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
  const rolled = 2 + Math.floor(r() * 2);
  return { classes, level: has(cfg, 'veterans') ? 5 : rolled };
}

/** Gary's whole stall, one item per slot (two hands unless the class fights two-handed, two potions). */
function clearanceKit(r: () => number, cls: string): string[] {
  const slots = ['head', 'body', 'legs', 'hand', ...(CLASSES[cls]?.twoHanded ? [] : ['hand']), 'small', 'small'];
  const out: string[] = [];
  for (const slot of slots) {
    const pool = Object.values(ITEMS).filter((it) => it.slot === slot && !out.includes(it.id));
    if (pool.length) out.push(pickOf(r, pool).id);
  }
  return out;
}

/** The party as the rules engine takes it. The same every time for the same day. */
export function heroSetups(cfg: FlashCfg): HeroSetup[] {
  const { classes, level } = partyPlan(cfg);
  const r = cfg.rng('cards');
  const ri = cfg.rng('items');
  return classes.map((cls, i) => {
    const def = CLASSES[cls]!;
    const all = CLASS_CARDS[cls] ?? [];
    // a level-up card at each level, as a player would have picked
    const cards = starterCards(cls);
    for (let l = 2; l <= level; l++) {
      const opts = all.filter((c) => c.level === l);
      if (opts.length) cards.push(pickOf(r, opts).id);
    }
    // a perk per level-up
    const idx = def.perks.map((_, j) => j);
    for (let j = idx.length - 1; j > 0; j--) {
      const k = Math.floor(r() * (j + 1));
      [idx[j], idx[k]] = [idx[k]!, idx[j]!];
    }
    const perks = idx.slice(0, level - 1).map((j) => def.perks[j]![1]);
    const ch: Character = { id: `flash${i}`, name: def.name, cls, xp: 0, level, gold: 0, cards, hand: [], items: [], perks: [], pendingCards: [], pendingPerks: 0, scenarios: 0, created: 0 };
    const hand = has(cfg, 'fullhand') ? all.map((c) => c.id) : handFor(ch);
    const items = has(cfg, 'clearance') ? clearanceKit(ri, cls) : [];
    const hp = def.hp[Math.min(5, level) - 1]! + items.reduce((n, id) => n + (ITEMS[id]?.fx.maxHp ?? 0), 0);
    return {
      owner: FLASH_OWNER,
      charId: ch.id,
      name: def.name,
      cls,
      level,
      maxHp: has(cfg, 'glass') ? 2 : hp,
      cards: hand,
      items,
      perks,
      ...(has(cfg, 'blessed') ? { bless: 15 } : {}),
    };
  });
}

export type FlashKind = 'clear' | 'escape' | 'boss';

/** What scenario k of the run is (0 = the first): clear, escape, boss, clear, escape, boss... */
export function scenarioKind(k: number): FlashKind {
  return k % 3 === 2 ? 'boss' : k % 3 === 1 ? 'escape' : 'clear';
}

/** Scenario k of the day: one Depth deeper each time (down to 9), monsters one level up each time (up to 7). */
export function flashScenario(k: number, cfg: FlashCfg): { sc: ScenarioDef; level: number; seed: number } {
  const r = cfg.rng(`scenario:${k}`);
  const seed = 1 + Math.floor(r() * 2147483000);
  const depth = Math.min(9, k + 1);
  const d = DEPTHS[depth - 1]!;
  const kind = scenarioKind(k);
  let objective: Objective = { kind: 'clear' };
  let name = `${pickOf(r, DELVE_NAMES)}: ${d.name}`;
  if (kind === 'escape') objective = { kind: 'escape' };
  if (kind === 'boss') {
    const at = SCENARIOS.find((s) => s.depth === depth && s.objective.kind === 'boss');
    const boss = at?.objective.kind === 'boss' ? at.objective.boss : 'the_caretaker';
    objective = { kind: 'boss', boss };
    name = `${d.name}: ${monsterDef(boss).name}`;
  }
  const rooms = kind === 'boss' ? 1 : kind === 'escape' ? 2 : k === 0 ? 1 : 2;
  const sc: ScenarioDef = { id: `flash-${k}`, name, depth, zone: d.zone, rooms, objective, intro: [], outro: [], unlocks: [], gold: 0, mix: 0.3 };
  return { sc, level: Math.min(7, k), seed };
}

/** The modifiers' changes to a freshly generated map (before its first room is revealed), or null for none. */
export function shapeMap(k: number, cfg: FlashCfg, sc: ScenarioDef): ((g: Generated) => void) | null {
  const boss = has(cfg, 'bossrush');
  const swarm = has(cfg, 'swarm');
  const gold = has(cfg, 'goldrush');
  if (!boss && !swarm && !gold) return null;
  return (g: Generated) => {
    const r = cfg.rng(`shape:${k}`);
    const { map } = g;
    const rooms = map.rooms;
    const taken = new Set<number>();
    for (const rm of rooms) for (const sp of rm.spawns) taken.add(key(sp.x, sp.y));
    for (const [x, y] of g.starts) taken.add(key(x, y));
    for (const p of g.pickups) taken.add(key(p.x, p.y));
    const roomOf = (x: number, y: number): number => map.room[y * map.w + x] ?? -1;
    /** plain free floor of a room, in a fixed order */
    const free = (i: number): [number, number][] => {
      const out: [number, number][] = [];
      for (let y = 0; y < map.h; y++)
        for (let x = 0; x < map.w; x++) if (map.tiles[y]![x] === '.' && roomOf(x, y) === i && !taken.has(key(x, y))) out.push([x, y]);
      return out;
    };
    const isBoss = (sp: Spawn): boolean => !!monsterDef(sp.monster).boss;
    if (boss) {
      // a boss in every room after the first, with half the pack; no boss twice in one scenario
      const used = new Set(rooms.flatMap((rm) => rm.spawns.filter(isBoss).map((sp) => sp.monster)));
      for (let i = 1; i < rooms.length; i++) {
        const rm = rooms[i]!;
        if (rm.spawns.some(isBoss)) continue;
        const left = Object.keys(BOSSES).filter((id) => !used.has(id));
        const id = pickOf(r, left.length ? left : Object.keys(BOSSES));
        used.add(id);
        const first = rm.spawns[0];
        const at = first ? [first.x, first.y] : free(i)[0];
        if (!at) continue;
        const rest = rm.spawns.slice(1).filter((_, j) => j % 2 === 1);
        for (const sp of rm.spawns) if (!rest.includes(sp)) taken.delete(key(sp.x, sp.y));
        taken.add(key(at[0]!, at[1]!));
        rm.spawns = [{ monster: id, x: at[0]!, y: at[1]!, elite: false }, ...rest];
      }
    }
    if (swarm) {
      // every monster but a boss brings a twin, on the nearest free floor
      rooms.forEach((rm, i) => {
        const twins: Spawn[] = [];
        for (const sp of rm.spawns) {
          if (isBoss(sp)) continue;
          const spot = free(i).sort((a, b) => hexDist(a[0], a[1], sp.x, sp.y) - hexDist(b[0], b[1], sp.x, sp.y))[0];
          if (!spot) continue;
          taken.add(key(spot[0], spot[1]));
          twins.push({ ...sp, x: spot[0], y: spot[1] });
        }
        rm.spawns.push(...twins);
      });
    }
    if (gold) {
      // three times the coins, and a chest in every room after the first
      rooms.forEach((_, i) => {
        const spots = free(i);
        for (let j = spots.length - 1; j > 0; j--) {
          const m = Math.floor(r() * (j + 1));
          [spots[j], spots[m]] = [spots[m]!, spots[j]!];
        }
        const coins = g.pickups.filter((p) => p.kind === 'coin' && roomOf(p.x, p.y) === i).length;
        for (let c = 0; c < Math.max(2, coins * 2) && spots.length; c++) {
          const [x, y] = spots.pop()!;
          taken.add(key(x, y));
          g.pickups.push({ x, y, kind: 'coin' });
        }
        if (i > 0 && !g.pickups.some((p) => p.kind === 'chest' && roomOf(p.x, p.y) === i) && spots.length) {
          const [x, y] = spots.pop()!;
          taken.add(key(x, y));
          g.pickups.push({ x, y, kind: 'chest', gold: 5 + sc.depth * 3 + Math.floor(r() * 6) });
        }
      });
    }
  };
}

/** A deck of ten ×2 and ten ×0 (Coin Flip). */
export function coinDeck(): Mod[] {
  const d: Mod[] = [];
  for (let i = 0; i < 10; i++) d.push({ v: 0, mult: 'x2' }, { v: 0, mult: 'null' });
  return d;
}

/** Names of the day's modifiers, in flash.json order. */
export function modNames(mods: readonly string[]): string[] {
  return FLASH_MODS.filter((m) => mods.includes(m.id)).map((m) => m.name);
}

/** Scenario k of the day, ready to play: the fight with every modifier applied. */
export function flashCombat(k: number, cfg: FlashCfg): { sc: ScenarioDef; state: CombatState } {
  const { sc, level, seed } = flashScenario(k, cfg);
  const house = houseRules(cfg.mods);
  const shape = shapeMap(k, cfg, sc);
  const state = createCombat(sc, heroSetups(cfg), level, seed, 'normal', { ...(house ? { house } : {}), ...(shape ? { shape } : {}) });
  if (has(cfg, 'coinflip')) {
    // Bless cards (Blessed Day) stay on top of it
    for (const h of heroes(state)) h.mods = [...coinDeck(), ...h.mods.filter((m) => m.temp)];
    state.monsterMods = coinDeck();
  }
  const names = modNames(cfg.mods);
  if (names.length) log(state, `FlashGames: ${names.join(' · ')}.`, 'info');
  return { sc, state };
}

// ------------------------------------------------------------------ score

export const POINTS = { kill: 100, elite: 200, boss: 1000, door: 150, gold: 10, depth: 1000, round: 50, par: 12, hp: 10, card: 20 } as const;

export interface Live {
  points: number;
  kills: number;
  doors: number;
  gold: number;
}

/** What the scenario in play is worth so far: kills, doors opened and gold picked up. */
export function livePoints(s: CombatState): Live {
  let points = 0;
  let kills = 0;
  for (const u of s.units) {
    if (u.kind !== 'monster' || !u.dead) continue;
    kills++;
    points += monsterDef(u.monster).boss ? POINTS.boss : u.elite ? POINTS.elite : POINTS.kill;
  }
  const doors = Math.max(0, s.map.rooms.filter((r) => r.revealed).length - 1);
  const gold = heroes(s).reduce((n, h) => n + h.gold, 0);
  points += doors * POINTS.door + gold * POINTS.gold;
  return { points, kills, doors, gold };
}

/** The bonus for winning a scenario: its Depth, the rounds it took, and what the standing heroes have left. */
export function winBonus(s: CombatState): number {
  const rounds = s.result?.rounds ?? s.round;
  let n = POINTS.depth * s.scenario.depth + POINTS.round * Math.max(0, POINTS.par - rounds);
  for (const h of heroes(s)) {
    if (h.exhausted && !h.escaped) continue;
    n += POINTS.hp * Math.max(0, h.hp) + POINTS.card * (h.hand.length + h.discard.length);
  }
  return n;
}

/**
 * The run's score: points banked from the scenarios won, plus what the one in play is worth so far. It never goes
 * down (an undone card can take back gold it looted; the score keeps the best it has been).
 */
export class FlashScore {
  banked = 0;
  won = 0;
  best = 0;
  private kills = 0;
  private gold = 0;
  /** the scenario already banked (its live points are in `banked` now) */
  private done: string | null = null;

  private live(s: CombatState): Live {
    return this.done === tag(s) ? { points: 0, kills: 0, doors: 0, gold: 0 } : livePoints(s);
  }

  /** The score now, during scenario k (state s), and the line that explains it. */
  now(k: number, s: CombatState): { score: number; detail: string } {
    const live = this.live(s);
    this.best = Math.max(this.best, this.banked + live.points);
    return { score: this.best, detail: `Scenario ${k + 1} · Depth ${s.scenario.depth} · ${this.won} won · ${this.kills + live.kills} kills · ${this.gold + live.gold} gold` };
  }

  /** The scenario was won: bank it and its bonus (once). Returns the bonus. */
  bankWin(s: CombatState): number {
    if (this.done === tag(s)) return 0;
    const live = livePoints(s);
    const bonus = winBonus(s);
    this.done = tag(s);
    this.banked += live.points + bonus;
    this.won++;
    this.kills += live.kills;
    this.gold += live.gold;
    this.best = Math.max(this.best, this.banked);
    return bonus;
  }
}

function tag(s: CombatState): string {
  return `${s.scenario.id}:${s.scenario.seed}`;
}
