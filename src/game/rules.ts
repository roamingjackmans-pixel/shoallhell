// The rules engine. One CombatState, mutated by player intents (act) and by the automatic parts (tick: monster and
// summon turns, turn starts). The co-op host runs this; guests only send intents and render the state they receive.
//
// Round: every hero picks two cards (or declares a long rest) -> monster ability cards are revealed -> everyone acts
// in initiative order -> end of round (shields/retaliate clear, elements wane, decks reshuffle).
// Hero turn: the top half of one picked card and the bottom half of the other (or basic Attack 2 / Move 2).
import { card as cardDef } from '../data/cards';
import { ITEMS, wears } from '../data/items';
import { monsterDef, monsterStat, SUMMONS, summonFor, ZONE_MONSTERS } from '../data/monsters';
import type { ScenarioDef } from '../data/story';
import { affinityMult } from '../draw/elements';
import { enhancedCard, type EnhMap } from './enhance';
import { generate } from './procgen';
import { alliesOf, dirIndex, enemiesOf, freeNeighbours, hexCenter, hexDist, hexesWithin, inRange, isHeroSide, key, landing, los, neighbors, pathTo, reach, roomAt, setTile, stepDir, tile, unitAt, unkey } from './grid';
import { apply as applyMods, baseDeck, drawMods, heroDeck, modLabel, type DeckHolder } from './mods';
import { chance, pick, rand, shuffle } from './rng';
import type {
  ActiveCard,
  CombatState,
  Cond,
  Consume,
  DamageType,
  Elem,
  Fx,
  HeroUnit,
  Card,
  Mod,
  MonsterAbility,
  MonsterUnit,
  Pending,
  Step,
  SummonUnit,
  TurnSlot,
  Unit,
} from './types';
import { DIFFICULTY_HP, ELEMS, NEGATIVE, type Difficulty } from './types';

export interface HeroSetup {
  owner: string;
  charId: string;
  name: string;
  cls: string;
  level: number;
  maxHp: number;
  /** the cards brought into the scenario (hand size) */
  cards: string[];
  items: string[];
  perks: string[];
  /** enhancement stickers on their cards (card id → stickers) */
  enh?: EnhMap;
  /** Bless cards from a donation at the Boiler, shuffled into their modifier deck */
  bless?: number;
}

export type Intent =
  | { t: 'pick'; uid: string; cards: string[] }
  | { t: 'longRest'; uid: string }
  /** before the first round: move to another free start hex */
  | { t: 'place'; uid: string; x: number; y: number }
  /** a Recover step: these lost cards (up to its number) go back to the hand */
  | { t: 'recover'; uid: string; cards: string[] }
  | { t: 'shortRest'; uid: string }
  | { t: 'restKeep'; uid: string }
  | { t: 'restReroll'; uid: string }
  | { t: 'unready'; uid: string }
  | { t: 'half'; uid: string; card: string; half: 'top' | 'bot'; basic: boolean }
  | { t: 'move'; uid: string; x: number; y: number }
  | { t: 'target'; uid: string; target?: string; x?: number; y?: number }
  | { t: 'skip'; uid: string }
  /** cards: for items that return discards, the ones chosen to come back */
  | { t: 'item'; uid: string; item: string; cards?: string[] }
  | { t: 'negate'; uid: string; choice: string }
  | { t: 'restLose'; uid: string; card: string }
  | { t: 'undo'; uid: string }
  | { t: 'push'; uid: string; x: number; y: number }
  /** answer to a card step that could spend an element: which one to spend, or null to keep them */
  | { t: 'useEl'; uid: string; el: Elem | null };

const EXPIRING: Cond[] = ['stun', 'immobilize', 'disarm', 'muddle', 'strengthen', 'invisible'];
export const COIN_VALUE = [2, 2, 3, 3, 4, 4, 5, 6];

// ------------------------------------------------------------------ small helpers

export function heroes(s: CombatState): HeroUnit[] {
  return s.units.filter((u): u is HeroUnit => u.kind === 'hero');
}
export function monsters(s: CombatState): MonsterUnit[] {
  return s.units.filter((u): u is MonsterUnit => u.kind === 'monster' && !u.dead);
}
export function unit(s: CombatState, uid: string): Unit | undefined {
  return s.units.find((u) => u.uid === uid);
}
function hero(s: CombatState, uid: string): HeroUnit | undefined {
  const u = unit(s, uid);
  return u && u.kind === 'hero' ? u : undefined;
}

export function log(s: CombatState, t: string, kind?: 'hero' | 'monster' | 'info' | 'dmg' | 'heal' | 'good' | 'bad'): void {
  s.logSeq = (s.logSeq ?? 0) + 1;
  s.log.push(kind ? { t, kind, n: s.logSeq } : { t, n: s.logSeq });
  if (s.log.length > 120) s.log.splice(0, s.log.length - 120);
}

function fx(s: CombatState, f: Omit<Fx, 'id'>): void {
  s.fx.push({ id: ++s.fxId, ...f });
  if (s.fx.length > 80) s.fx.splice(0, s.fx.length - 80);
}

function nameOf(u: Unit): string {
  if (u.kind === 'hero') return u.name;
  if (u.kind === 'summon') return SUMMONS[u.summon]?.name ?? 'Summon';
  const d = monsterDef(u.monster);
  return `${u.elite ? 'Elite ' : ''}${d.name}${d.boss ? '' : ' ' + u.num}`;
}
export { nameOf };

function elemOfUnit(u: Unit): DamageType {
  if (u.kind === 'monster') return monsterDef(u.monster).elem;
  return 'physical';
}

function isActing(s: CombatState, u: Unit): boolean {
  const slot = s.order[s.turnIdx];
  if (!slot || s.phase !== 'turns') return false;
  if (slot.kind === 'monster') return u.kind === 'monster' && u.monster === slot.who;
  return slot.who === u.uid;
}

function initOf(s: CombatState, u: Unit): number {
  if (u.kind === 'hero') return u.init;
  if (u.kind === 'summon') return (hero(s, u.heroUid)?.init ?? 50) - 0.5;
  const d = s.drawn[u.monster];
  return d === undefined ? 99 : monsterDef(u.monster).abilities[d]!.init;
}

// ------------------------------------------------------------------ setup

export function createCombat(sc: ScenarioDef, setups: HeroSetup[], level: number, seed: number, difficulty: Difficulty = 'normal'): CombatState {
  const g = generate({ scenario: sc, heroes: setups.length, level, seed, difficulty });
  const s: CombatState = {
    v: 1,
    scenario: { id: sc.id, name: sc.name, objective: sc.objective, level, seed, depth: sc.depth, difficulty },
    map: g.map,
    units: [],
    pickups: g.pickups,
    round: 1,
    phase: 'select',
    order: [],
    turnIdx: 0,
    heroTurn: null,
    drawn: {},
    decks: {},
    elements: { fire: 0, magic: 0, void: 0, holy: 0 },
    infusedNow: [],
    monsterMods: baseDeck(),
    monsterModDiscard: [],
    rng: (seed * 7919 + 13) | 0,
    log: [],
    fx: [],
    fxId: 0,
    pending: null,
    pendQ: [],
    types: [],
    destroyed: 0,
    monsterCursor: 0,
    starts: g.starts.map(([x, y]) => [x, y] as [number, number]),
  };
  setups.forEach((h, i) => {
    const [x, y] = g.starts[i] ?? g.starts[0]!;
    const maxHp = h.maxHp;
    const u: HeroUnit = {
      uid: `h${i}`,
      kind: 'hero',
      owner: h.owner,
      charId: h.charId,
      name: h.name,
      cls: h.cls,
      level: h.level,
      x,
      y,
      hp: maxHp,
      maxHp,
      conds: [],
      fresh: [],
      shield: 0,
      retaliate: 0,
      retRange: 1,
      facing: 0,
      hand: [...h.cards],
      discard: [],
      lost: [],
      active: [],
      picked: [],
      longRest: false,
      init: 99,
      exhausted: false,
      xp: 0,
      gold: 0,
      mods: [...heroDeck(h.perks), ...Array.from({ length: h.bless ?? 0 }, (): Mod => ({ v: 0, temp: 'bless' }))],
      enh: h.enh && Object.keys(h.enh).length ? h.enh : undefined,
      modDiscard: [],
      items: h.items.map((id) => ({ id, state: 'ready' as const })),
      next: {},
      shortRested: false,
      ready: false,
      stats: { dmg: 0, kills: 0, heals: 0, infusions: 0, rangedKills: 0, elitesKilled: 0, lost: 0 },
    };
    s.units.push(u);
  });
  revealRoom(s, 0);
  log(s, `${sc.name}. ${objectiveText(s)}`, 'info');
  for (const u of s.units) if (u.kind === 'hero' && u.mods.some((m) => m.temp === 'bless')) log(s, `${u.name} carries the Boiler’s blessing (${u.mods.filter((m) => m.temp === 'bless').length} Bless).`, 'hero');
  log(s, 'Pick two cards: the first one you pick sets your initiative.', 'info');
  return s;
}

export function objectiveText(s: CombatState): string {
  if (s.goalMet && s.phase === 'turns') return 'Goal met! Everyone finishes their turn, then the scenario is won.';
  const o = s.scenario.objective;
  switch (o.kind) {
    case 'clear':
      return 'Goal: defeat every enemy in every room.';
    case 'boss':
      return `Goal: defeat ${monsterDef(o.boss).name}.`;
    case 'escape':
      return 'Goal: every hero reaches the exit (X) in the last room.';
    case 'survive':
      return `Goal: survive ${o.rounds} rounds. Reinforcements arrive every round.`;
    case 'destroy':
      return `Goal: destroy ${o.count} ${monsterDef(o.monster).name}${o.count > 1 ? 's' : ''} (${s.destroyed}/${o.count}).`;
  }
}

function addType(s: CombatState, id: string): void {
  if (!s.types.includes(id)) s.types.push(id);
  if (!s.decks[id]) s.decks[id] = shuffle(s, monsterDef(id).abilities.map((_, i) => i));
}

let monNum: Record<string, number> = {};
function nextNum(s: CombatState, id: string): number {
  const used = new Set(s.units.filter((u) => u.kind === 'monster' && u.monster === id && !u.dead).map((u) => (u as MonsterUnit).num));
  for (let n = 1; n < 40; n++) if (!used.has(n)) return n;
  monNum[id] = (monNum[id] ?? 40) + 1;
  return monNum[id]!;
}

function spawnMonster(s: CombatState, id: string, x: number, y: number, elite: boolean, summoned = false): MonsterUnit {
  const def = monsterDef(id);
  const base = monsterStat(def, s.scenario.level, elite, heroes(s).length);
  // difficulty: Normal and Hardcore scale monster health
  const mult = s.scenario.difficulty ? DIFFICULTY_HP[s.scenario.difficulty] : 1;
  const stat = { ...base, hp: Math.max(1, Math.round(base.hp * mult)) };
  const m: MonsterUnit = {
    uid: `m${++s.fxId}`,
    kind: 'monster',
    monster: id,
    elite,
    num: nextNum(s, id),
    stat,
    x,
    y,
    hp: stat.hp,
    maxHp: stat.hp,
    conds: [],
    fresh: [],
    shield: 0,
    retaliate: 0,
    retRange: 1,
    facing: Math.PI / 2,
    ...(summoned ? { summoned: true } : {}),
  };
  s.units.push(m);
  addType(s, id);
  // a type revealed mid-round acts this round if its card's initiative has not passed yet
  if (s.phase === 'turns' && !s.order.some((o) => o.kind === 'monster' && o.who === id)) {
    drawAbility(s, id);
    const init = monsterDef(id).abilities[s.drawn[id]!]!.init;
    const cur = s.order[s.turnIdx];
    if (!summoned && cur && init > cur.init) {
      s.order.push({ who: id, kind: 'monster', init, done: false });
      const rest = s.order.slice(s.turnIdx + 1).sort((a, b) => a.init - b.init);
      s.order.splice(s.turnIdx + 1, rest.length, ...rest);
    }
  }
  return m;
}

function revealRoom(s: CombatState, i: number): void {
  const r = s.map.rooms[i];
  if (!r || (r.revealed && i !== 0) || (i === 0 && s.units.some((u) => u.kind === 'monster'))) return;
  r.revealed = true;
  for (const sp of r.spawns) {
    if (unitAt(s, sp.x, sp.y)) continue;
    spawnMonster(s, sp.monster, sp.x, sp.y, sp.elite);
  }
  if (i > 0) {
    const names = [...new Set(r.spawns.map((sp) => monsterDef(sp.monster).name))];
    log(s, `The door opens: ${names.join(', ') || 'nothing'}.`, 'info');
    fx(s, { kind: 'text', x: r.x + r.w / 2, y: r.y + r.h / 2, text: 'Room revealed', color: '#ffe98a' });
  }
}

function openDoor(s: CombatState, x: number, y: number): void {
  if (tile(s.map, x, y) !== 'D') return;
  setTile(s.map, x, y, 'd');
  for (const [nx, ny] of neighbors(x, y)) {
    const r = roomAt(s.map, nx, ny);
    if (r >= 0 && !s.map.rooms[r]!.revealed) revealRoom(s, r);
  }
}

// ------------------------------------------------------------------ conditions, damage, healing

function hasCond(u: Unit, c: Cond): boolean {
  return u.conds.includes(c);
}

export function giveCond(s: CombatState, u: Unit, c: Cond): void {
  if (u.dead) return;
  if (u.kind === 'monster' && monsterDef(u.monster).immune?.includes(c)) return;
  if (!u.conds.includes(c)) u.conds.push(c);
  if (isActing(s, u) && !u.fresh.includes(c)) u.fresh.push(c);
  fx(s, { kind: 'cond', uid: u.uid, text: c, color: NEGATIVE.includes(c) ? '#ff9a6a' : '#9ce59c' });
}

function killUnit(s: CombatState, u: Unit, by?: Unit): void {
  if (u.kind === 'hero') {
    u.exhausted = true;
    u.hp = 0;
    log(s, `${u.name} is exhausted.`, 'bad');
    fx(s, { kind: 'death', uid: u.uid });
    return;
  }
  u.dead = true;
  u.hp = 0;
  fx(s, { kind: 'death', uid: u.uid });
  if (u.kind === 'monster') {
    const def = monsterDef(u.monster);
    log(s, `${nameOf(u)} is defeated.`, 'good');
    if (!def.boss && !u.summoned) s.pickups.push({ x: u.x, y: u.y, kind: 'coin' });
    const o = s.scenario.objective;
    if (o.kind === 'destroy' && o.monster === u.monster) s.destroyed++;
    const killer = by?.kind === 'hero' ? by : by?.kind === 'summon' ? hero(s, by.heroUid) : undefined;
    if (killer) {
      killer.stats.kills++;
      killer.xp += 1;
      if (u.elite) killer.stats.elitesKilled++;
      if (def.undead) (killer.stats as Record<string, number>).undead = ((killer.stats as Record<string, number>).undead ?? 0) + 1;
      if (def.boss) (killer.stats as Record<string, number>).boss = 1;
    }
  } else log(s, `${nameOf(u)} is destroyed.`, 'bad');
}

/** Add to a hero's scenario stats. */
function bump(h: HeroUnit | undefined, k: string, n = 1): void {
  if (!h || !n) return;
  h.stats[k] = (h.stats[k] ?? 0) + n;
}

function bumpMax(h: HeroUnit | undefined, k: string, n: number): void {
  if (h && n > (h.stats[k] ?? 0)) h.stats[k] = n;
}

/** The hero behind a unit: itself, or a summon's owner. */
function heroOf(s: CombatState, u: Unit | undefined): HeroUnit | undefined {
  return u?.kind === 'hero' ? u : u?.kind === 'summon' ? hero(s, u.heroUid) : undefined;
}

function damage(s: CombatState, u: Unit, n: number, by?: Unit): void {
  if (n <= 0 || u.dead) return;
  if (u.kind === 'hero') {
    bump(u, 'dmgTaken', n);
    if (!by) bump(u, 'hazardDmg', n);
  }
  if (u.kind === 'monster' && monsterDef(u.monster).boss) bump(heroOf(s, by), 'bossDmg', n);
  u.hp -= n;
  fx(s, { kind: 'dmg', uid: u.uid, text: `-${n}`, color: '#ff5a4a' });
  if (by && by.kind === 'hero') by.stats.dmg += n;
  if (by && by.kind === 'summon') {
    const h = hero(s, by.heroUid);
    if (h) h.stats.dmg += n;
  }
  if (u.hp <= 0) killUnit(s, u, by);
}

function healUnit(s: CombatState, u: Unit, n: number, by?: HeroUnit): number {
  if (u.dead) return 0;
  const poisoned = hasCond(u, 'poison');
  u.conds = u.conds.filter((c) => c !== 'poison' && c !== 'wound');
  if (poisoned) {
    fx(s, { kind: 'heal', uid: u.uid, text: 'cured', color: '#9ce59c' });
    return 0;
  }
  const amt = Math.max(0, Math.min(n, u.maxHp - u.hp));
  u.hp += amt;
  if (u.kind === 'hero') bump(u, 'healed', amt);
  fx(s, { kind: 'heal', uid: u.uid, text: `+${amt}`, color: '#7dff8a' });
  if (by) by.stats.heals += amt;
  return amt;
}

function infuseEl(s: CombatState, el: Elem, by?: HeroUnit): void {
  if (!s.infusedNow.includes(el)) s.infusedNow.push(el);
  if (by) by.stats.infusions++;
  fx(s, { kind: 'infuse', el, ...(by ? { uid: by.uid } : {}) });
}

/** The elements a step's element cost could be paid with right now (strongest first). */
export function spendable(s: CombatState, el: Elem | 'any'): Elem[] {
  const up = (el === 'any' ? [...ELEMS] : [el]).filter((e) => s.elements[e] > 0);
  return up.sort((a, b) => s.elements[b] - s.elements[a]);
}

/** Spend an element if it is up (strong or waning); 'any' takes the strongest. */
function consume(s: CombatState, el: Elem | 'any'): Elem | null {
  if (el === 'any') {
    const best = [...ELEMS].sort((a, b) => s.elements[b] - s.elements[a])[0]!;
    if (s.elements[best] > 0) {
      s.elements[best] = 0;
      return best;
    }
    return null;
  }
  if (s.elements[el] > 0) {
    s.elements[el] = 0;
    return el;
  }
  return null;
}

/** Lasting effects of a kind on a hero. */
function persists(u: Unit, kind: ActiveCard['persist']['kind']): ActiveCard[] {
  return u.kind === 'hero' ? u.active.filter((a) => a.persist.kind === kind) : [];
}

function usePersist(s: CombatState, h: HeroUnit, a: ActiveCard): void {
  if (a.persist.uses === 0) return;
  a.left--;
  if (a.left <= 0) {
    h.active = h.active.filter((x) => x !== a);
    const c = cardDef(a.card);
    const lost = c[a.half].lost;
    if (lost) {
      h.lost.push(a.card);
      h.stats.lost++;
    } else h.discard.push(a.card);
    log(s, `${h.name}: ${c.name} runs out.`, 'info');
  }
}

function deckOf(s: CombatState, attacker: Unit): DeckHolder {
  if (attacker.kind === 'hero') return attacker;
  if (attacker.kind === 'summon') return hero(s, attacker.heroUid) ?? { mods: s.monsterMods, modDiscard: s.monsterModDiscard };
  return {
    get mods() {
      return s.monsterMods;
    },
    get modDiscard() {
      return s.monsterModDiscard;
    },
  } as DeckHolder;
}

interface AttackOpts {
  base: number;
  ranged: boolean;
  pierce?: number;
  cond?: Cond[];
  push?: number;
  pull?: number;
  type?: DamageType;
  red?: boolean;
  drain?: number;
  adv?: number;
}

/** Resolve one attack against one target. Returns the damage dealt (or queues a negate question). */
function attack(s: CombatState, a: Unit, t: Unit, o: AttackOpts): number {
  // modifier cards are about to be drawn: no taking the card back after this
  s.undo = null;
  let adv = o.adv ?? 0;
  if (hasCond(a, 'strengthen')) adv++;
  if (hasCond(a, 'muddle')) adv--;
  if (o.ranged && hexDist(a.x, a.y, t.x, t.y) === 1) adv--;
  let base = o.base;
  const cond = [...(o.cond ?? [])];
  let pierce = o.pierce ?? 0;
  let push = o.push ?? 0;
  const pull = o.pull ?? 0;
  // lasting bonuses
  for (const p of persists(a, 'atk')) {
    base += p.persist.n;
    usePersist(s, a as HeroUnit, p);
  }
  for (const p of persists(a, 'cond')) {
    if (p.persist.cond) cond.push(p.persist.cond);
    usePersist(s, a as HeroUnit, p);
  }
  if (a.kind === 'hero' && a.next.atk) {
    base += a.next.atk;
    delete a.next.atk;
  }
  if (a.kind === 'hero' && a.next.cond) {
    cond.push(...a.next.cond);
    delete a.next.cond;
  }
  if (a.kind === 'hero' && a.next.adv) {
    adv++;
    delete a.next.adv;
  }
  if (a.kind === 'hero' && a.next.pierce) {
    pierce += a.next.pierce;
    delete a.next.pierce;
  }
  if (a.kind === 'hero' && a.next.push) {
    push += a.next.push;
    delete a.next.push;
  }
  const deck = deckOf(s, a);
  const drawn = drawMods(s, deck, Math.sign(adv), base);
  let used = drawn.used;
  // Bucket Helm: monster x2 counts as +0
  if (a.kind === 'monster' && t.kind === 'hero' && wears(t.items, 'noCrit')) used = used.map((m) => (m.mult === 'x2' ? { v: 0 } : m));
  let val = applyMods(base, used);
  const missed = used.some((m) => m.mult === 'null' || m.temp === 'curse');
  if (a.kind === 'hero') {
    bump(a, 'attacks');
    bump(a, missed ? 'misses' : 'hits');
    bump(a, 'crits', used.filter((m) => m.mult === 'x2' || m.temp === 'bless').length);
  }
  if (t.kind === 'hero') {
    bump(t, 'attacked');
    if (missed) bump(t, 'dodged');
  }
  for (const m of used) {
    if (m.cond) cond.push(m.cond);
    if (m.infuse) infuseEl(s, m.infuse, a.kind === 'hero' ? a : undefined);
    if (m.push) push += m.push;
    if (m.pierce) pierce += m.pierce;
    if (m.shield) a.shield += m.shield;
    if (m.heal) healUnit(s, a, m.heal);
  }
  const tilt = Math.sign(adv);
  const why = o.ranged && hexDist(a.x, a.y, t.x, t.y) === 1 ? ' (ranged at an adjacent target)' : '';
  const label = (tilt < 0 ? `disadvantage${why}: ` : tilt > 0 ? 'advantage: ' : '') + drawn.shown.map(modLabel).join(' / ');
  if (missed) {
    log(s, `${nameOf(a)} attacks ${nameOf(t)} for ${base} (${label}) → ${base} ×0 = 0 damage.`, a.kind === 'monster' ? 'monster' : 'hero');
    fx(s, { kind: 'miss', uid: t.uid, text: `${base} ×0 = 0`, color: '#c0c0c0' });
    fx(s, { kind: o.ranged ? 'shot' : 'swing', uid: a.uid, to: t.uid });
    return 0;
  }
  // weakness chart: +1 when strong, −1 when weak (from Dungeon Joe's ×1.5 / ×0.6)
  const type = o.type ?? 'physical';
  const aff = affinityMult(type, elemOfUnit(t));
  if (aff > 1) val += 1;
  else if (aff < 1) val = Math.max(0, val - 1);
  if (hasCond(t, 'poison')) val += 1;
  // shields
  let sh = t.shield + (t.kind !== 'hero' ? t.stat.shield ?? 0 : 0);
  const pShields = persists(t, 'shield');
  for (const p of pShields) sh += p.persist.n;
  if (o.red) sh = 0;
  sh = Math.max(0, sh - pierce);
  const dmg = Math.max(0, val - sh);
  if (t.kind === 'hero') bump(t, 'blocked', Math.min(val, sh));
  if (a.kind === 'hero') bumpMax(a, 'bestHit', dmg);
  for (const p of pShields) usePersist(s, t as HeroUnit, p);
  fx(s, { kind: o.ranged ? 'shot' : 'swing', uid: a.uid, to: t.uid, ...(type !== 'physical' ? { el: type } : {}) });
  log(
    s,
    `${nameOf(a)} attacks ${nameOf(t)} for ${base} (${label}${aff > 1 ? ', weak +1' : aff < 1 ? ', resists −1' : ''}${sh ? `, shield −${sh}` : ''}${o.red ? ', RED: ignores shield' : ''}) → ${dmg}.`,
    a.kind === 'monster' ? 'monster' : 'hero',
  );
  // a big hit (lethal, or half the hero's max HP or more) on a hero who can still lose cards becomes a question:
  // lose one card from the hand or two from the discard pile to take no damage
  if (t.kind === 'hero' && dmg > 0 && (dmg >= t.hp || dmg * 2 >= t.maxHp) && (t.hand.length >= 1 || t.discard.length >= 2)) {
    const p: Pending = { kind: 'negate', heroUid: t.uid, dmg, cond, push, pull, fromUid: a.uid, by: nameOf(a) };
    s.pendQ.push(p);
    if (!s.pending) s.pending = s.pendQ.shift()!;
    retaliateOn(s, a, t);
    return dmg;
  }
  damage(s, t, dmg, a);
  afterHit(s, a, t, cond, push, pull);
  if (o.drain) healUnit(s, a, o.drain, a.kind === 'hero' ? a : undefined);
  for (const p of persists(a, 'drain')) {
    healUnit(s, a, p.persist.n, a as HeroUnit);
    usePersist(s, a as HeroUnit, p);
  }
  if (t.dead && a.kind === 'hero' && o.ranged) a.stats.rangedKills++;
  retaliateOn(s, a, t);
  return dmg;
}

function afterHit(s: CombatState, a: Unit, t: Unit, cond: Cond[], push: number, pull: number): void {
  if (t.dead || (t.kind === 'hero' && t.exhausted)) return;
  const by = t.kind === 'monster' ? heroOf(s, a) : undefined;
  for (const c of cond) {
    if (by && t.kind === 'monster' && NEGATIVE.includes(c) && !t.conds.includes(c) && !monsterDef(t.monster).immune?.includes(c)) bump(by, 'condsGiven');
    giveCond(s, t, c);
  }
  if (by && (push || pull)) bump(by, 'shoved');
  // a hero's push is the player's to aim (settlePushes); monsters and summons push automatically
  if (push && a.kind === 'hero') (s.pushQ ??= []).push({ uid: t.uid, sx: a.x, sy: a.y, left: push });
  else if (push) shove(s, t, a, push, 1);
  if (pull) shove(s, t, a, pull, -1);
}

/** Where a queued push can move its target next: empty open hexes one step farther from the pusher. */
export function pushOptions(s: CombatState): [number, number][] {
  const p = s.pushQ?.[0];
  const t = p ? unit(s, p.uid) : undefined;
  if (!p || !t || t.dead || p.left <= 0) return [];
  const d0 = hexDist(t.x, t.y, p.sx, p.sy);
  return neighbors(t.x, t.y).filter(([nx, ny]) => {
    const c = tile(s.map, nx, ny);
    if (c !== '.' && c !== ',' && c !== '~' && c !== 'T' && c !== 'd' && c !== 'X') return false;
    return !unitAt(s, nx, ny) && hexDist(nx, ny, p.sx, p.sy) > d0;
  });
}

function pushStep(s: CombatState, x: number, y: number): void {
  const p = s.pushQ![0]!;
  const t = unit(s, p.uid)!;
  const from: [number, number] = [t.x, t.y];
  t.x = x;
  t.y = y;
  p.left--;
  fx(s, { kind: 'move', uid: t.uid, path: [from, [x, y]] });
  enterTile(s, t, false);
}

/**
 * Carry out queued pushes until one needs the player: each step with a single possible hex happens by itself.
 * Returns true when every push is done.
 */
function settlePushes(s: CombatState): boolean {
  while (s.pushQ?.length) {
    const p = s.pushQ[0]!;
    const t = unit(s, p.uid);
    const opts = pushOptions(s);
    if (!t || t.dead || p.left <= 0 || !opts.length) {
      s.pushQ.shift();
      continue;
    }
    if (opts.length > 1) return false;
    pushStep(s, opts[0]![0], opts[0]![1]);
  }
  s.pushQ = [];
  checkEnd(s);
  return true;
}

function retaliateOn(s: CombatState, a: Unit, t: Unit): void {
  if (t.dead || a.dead || (t.kind === 'hero' && t.exhausted)) return;
  let r = t.retaliate + (t.kind !== 'hero' ? t.stat.retaliate ?? 0 : 0);
  const pr = persists(t, 'retaliate');
  for (const p of pr) r += p.persist.n;
  const range = Math.max(1, t.retRange);
  if (r > 0 && hexDist(a.x, a.y, t.x, t.y) <= range) {
    log(s, `${nameOf(t)} retaliates for ${r}.`, t.kind === 'monster' ? 'monster' : 'hero');
    for (const p of pr) usePersist(s, t as HeroUnit, p);
    if (t.kind === 'hero') bump(t, 'retDmg', r);
    damage(s, a, r, t);
  }
}

/** Push (dir 1) or pull (dir −1) a unit up to n spaces away from / toward a source. */
function shove(s: CombatState, t: Unit, src: Unit, n: number, dir: 1 | -1): void {
  for (let i = 0; i < n; i++) {
    // push: a neighbour one step farther from the source; pull: one step nearer. Ties go to the hex most in line
    // with the source (largest/smallest straight-line distance).
    const d0 = hexDist(t.x, t.y, src.x, src.y);
    const [sx, sy] = hexCenter(src.x, src.y);
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (const [nx, ny] of neighbors(t.x, t.y)) {
      const c = tile(s.map, nx, ny);
      if (c !== '.' && c !== ',' && c !== '~' && c !== 'T' && c !== 'd' && c !== 'X') continue;
      if (unitAt(s, nx, ny)) continue;
      const hd = hexDist(nx, ny, src.x, src.y);
      if (dir === 1 ? hd <= d0 : hd >= d0 || (nx === src.x && ny === src.y)) continue;
      const [px, py] = hexCenter(nx, ny);
      const e = Math.hypot(px - sx, py - sy) * dir;
      if (e > bestScore) {
        bestScore = e;
        best = [nx, ny];
      }
    }
    if (!best) return;
    t.x = best[0];
    t.y = best[1];
    enterTile(s, t, false);
    if (t.dead) return;
  }
}

/** Hazards, traps, doors and the exit when a unit steps onto its current tile. */
function enterTile(s: CombatState, u: Unit, jump: boolean): void {
  const c = tile(s.map, u.x, u.y);
  const flying = u.kind === 'monster' && monsterDef(u.monster).flying;
  const wellies = u.kind === 'hero' && wears(u.items, 'hazardProof');
  if (c === '~' && !jump && !flying && !wellies) {
    log(s, `${nameOf(u)} wades through the hazard.`, 'dmg');
    damage(s, u, 1);
  } else if (c === 'T' && !jump && !flying) {
    setTile(s.map, u.x, u.y, '.');
    if (!wellies) {
      log(s, `${nameOf(u)} springs a trap!`, 'dmg');
      damage(s, u, 2 + Math.floor(s.scenario.level / 3));
      if (!u.dead) giveCond(s, u, 'immobilize');
    } else log(s, `${nameOf(u)}'s wellies crush a trap.`, 'info');
  } else if (c === 'D' && u.kind === 'hero') openDoor(s, u.x, u.y);
}

// ------------------------------------------------------------------ round flow

function drawAbility(s: CombatState, id: string): void {
  let d = s.decks[id];
  if (!d || d.length === 0) d = s.decks[id] = shuffle(s, monsterDef(id).abilities.map((_, i) => i));
  s.drawn[id] = d.shift()!;
}

function canPlay(h: HeroUnit): boolean {
  return h.hand.length >= 2;
}

function mustRest(h: HeroUnit): boolean {
  return h.hand.length < 2 && h.discard.length >= 2;
}

function checkExhaustion(s: CombatState): void {
  for (const h of heroes(s)) {
    if (h.exhausted) continue;
    if (h.hand.length < 2 && h.discard.length < 2) {
      h.exhausted = true;
      (h.stats as Record<string, number>).exhausted = 1;
      log(s, `${h.name} has run out of cards and is exhausted.`, 'bad');
      fx(s, { kind: 'death', uid: h.uid });
    }
  }
}

function startRound(s: CombatState): void {
  s.order = [];
  s.drawn = {};
  const living = new Set(monsters(s).map((m) => m.monster));
  for (const id of s.types) if (living.has(id)) drawAbility(s, id);
  for (const h of heroes(s)) {
    if (h.exhausted) continue;
    if (h.longRest) h.init = 99;
    else h.init = cardDef(h.picked[0]!).init + cardDef(h.picked[1]!).init / 100;
    s.order.push({ who: h.uid, kind: 'hero', init: h.init, done: false });
  }
  for (const id of Object.keys(s.drawn)) s.order.push({ who: id, kind: 'monster', init: monsterDef(id).abilities[s.drawn[id]!]!.init + 0.5, done: false });
  for (const u of s.units) if (u.kind === 'summon' && !u.dead && !u.summoned) s.order.push({ who: u.uid, kind: 'summon', init: initOf(s, u), done: false });
  s.order.sort((a, b) => a.init - b.init);
  s.phase = 'turns';
  s.turnIdx = 0;
  s.monsterCursor = 0;
  s.heroTurn = null;
  log(s, `Round ${s.round}.`, 'info');
}

function endRound(s: CombatState): void {
  // the goal was met during this round: now that everyone has had their turn, the scenario is won
  if (s.goalMet) {
    win(s, s.goalMet);
    return;
  }
  for (const u of s.units) {
    u.shield = 0;
    u.retaliate = 0;
    u.retRange = 1;
    if (u.kind !== 'hero') delete u.summoned;
  }
  for (const el of ELEMS) if (s.elements[el] > 0) s.elements[el] = (s.elements[el] - 1) as 0 | 1;
  const reshuffle = (h: DeckHolder): void => {
    if (h.modDiscard.some((m: Mod) => m.mult)) {
      h.mods.push(...h.modDiscard);
      h.modDiscard.length = 0;
    }
  };
  reshuffle({ mods: s.monsterMods, modDiscard: s.monsterModDiscard });
  for (const h of heroes(s)) {
    reshuffle(h);
    h.picked = [];
    h.longRest = false;
    h.shortRested = false;
    h.ready = false;
  }
  const o = s.scenario.objective;
  if (o.kind === 'survive') {
    if (s.round >= o.rounds) {
      win(s, `The union held out for ${o.rounds} rounds.`);
      return;
    }
    reinforce(s);
  }
  s.round++;
  s.phase = 'select';
  s.order = [];
  s.heroTurn = null;
  checkExhaustion(s);
  checkEnd(s);
}

function reinforce(s: CombatState): void {
  const n = 1 + Math.floor(heroes(s).filter((h) => !h.exhausted).length / 2);
  const hs = heroes(s).filter((h) => !h.exhausted);
  const free: [number, number][] = [];
  s.map.rooms.forEach((r, i) => {
    if (!r.revealed) return;
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (tile(s.map, x, y) === '.' && !unitAt(s, x, y) && roomAt(s.map, x, y) === i) free.push([x, y]);
  });
  free.sort((a, b) => Math.min(...hs.map((h) => hexDist(h.x, h.y, b[0], b[1]))) - Math.min(...hs.map((h) => hexDist(h.x, h.y, a[0], a[1]))));
  const zone = s.map.zone === 9 ? 1 + Math.floor(rand(s) * 8) : s.map.zone;
  const pool = (ZONE_MONSTERS[zone] ?? ZONE_MONSTERS[1]!).filter((id) => monsterDef(id).base.move > 0);
  for (let i = 0; i < n && free.length; i++) {
    const [x, y] = free.splice(Math.floor(rand(s) * Math.min(4, free.length)), 1)[0]!;
    spawnMonster(s, pick(s, pool), x, y, chance(s, 0.12 + s.scenario.level * 0.04), true);
  }
  log(s, 'The tide brings reinforcements.', 'bad');
}

function win(s: CombatState, text: string): void {
  if (s.phase === 'won' || s.phase === 'lost') return;
  s.phase = 'won';
  s.result = { won: true, rounds: s.round, text };
  log(s, text, 'good');
}

function lose(s: CombatState, text: string): void {
  if (s.phase === 'won' || s.phase === 'lost') return;
  s.phase = 'lost';
  s.result = { won: false, rounds: s.round, text };
  log(s, text, 'bad');
}

export function checkEnd(s: CombatState): void {
  if (s.phase === 'won' || s.phase === 'lost') return;
  const hs = heroes(s);
  const alive = hs.filter((h) => !h.exhausted);
  const escaped = hs.filter((h) => h.escaped);
  const o = s.scenario.objective;
  if (o.kind === 'escape' && escaped.length > 0 && alive.length === 0) return win(s, 'The union got through.');
  if (alive.length === 0) return s.goalMet ? win(s, s.goalMet) : lose(s, 'Every hero is exhausted.');
  if (s.goalMet) return;
  const mons = monsters(s);
  let met: string | null = null;
  if (o.kind === 'clear' && mons.length === 0 && s.map.rooms.every((r) => r.revealed)) met = 'Every room is clear.';
  else if (o.kind === 'boss' && s.units.some((u) => u.kind === 'monster' && u.monster === o.boss && u.dead)) met = `${monsterDef(o.boss).name} is defeated!`;
  else if (o.kind === 'destroy' && s.destroyed >= o.count) met = 'Every target is destroyed.';
  if (!met) return;
  // Gloomhaven: the scenario ends at the end of the round the goal is met in, so everyone still finishes their turn
  if (s.phase !== 'turns') return win(s, met);
  s.goalMet = met;
  log(s, `${met} Goal met: the round plays out, then the scenario ends.`, 'good');
}

/** Move to the next slot in the initiative order (or end the round). */
function nextSlot(s: CombatState): void {
  s.undo = null;
  s.pushQ = [];
  s.pushThen = null;
  const slot = s.order[s.turnIdx];
  if (slot) slot.done = true;
  s.turnIdx++;
  s.monsterCursor = 0;
  s.heroTurn = null;
  checkEnd(s);
  if (s.phase !== 'turns') return;
  if (s.turnIdx >= s.order.length) endRound(s);
}

function endUnitTurn(s: CombatState, u: Unit): void {
  u.conds = u.conds.filter((c) => !EXPIRING.includes(c) || u.fresh.includes(c));
  u.fresh = [];
}

function turnStart(s: CombatState, u: Unit): void {
  if (hasCond(u, 'wound')) {
    log(s, `${nameOf(u)} bleeds (wound).`, 'dmg');
    damage(s, u, 1);
  }
  if (!u.dead && !(u.kind === 'hero' && u.exhausted) && hasCond(u, 'regenerate')) {
    if (u.hp < u.maxHp || hasCond(u, 'wound') || hasCond(u, 'poison')) healUnit(s, u, 1);
  }
}

// ------------------------------------------------------------------ automatic play (monsters, summons, turn starts)

/** Advance one automatic beat. Returns true if something happened (the host calls it again after a short delay). */
export function tick(s: CombatState): boolean {
  if (s.phase !== 'turns' || s.pending) return false;
  const slot = s.order[s.turnIdx];
  if (!slot) {
    endRound(s);
    return true;
  }
  if (slot.kind === 'hero') {
    const h = hero(s, slot.who);
    if (!h || h.exhausted) {
      nextSlot(s);
      return true;
    }
    if (!s.heroTurn || s.heroTurn.uid !== h.uid) {
      s.heroTurn = { uid: h.uid, used: [], cur: null, started: false };
    }
    if (!s.heroTurn.started) {
      s.heroTurn.started = true;
      turnStart(s, h);
      if (h.exhausted) {
        nextSlot(s);
        return true;
      }
      if (hasCond(h, 'stun') && !h.longRest) {
        log(s, `${h.name} is stunned and loses the turn.`, 'bad');
        for (const c of h.picked) moveCard(h, c, 'discard');
        h.hand = h.hand.filter((c) => !h.picked.includes(c));
        endUnitTurn(s, h);
        nextSlot(s);
        return true;
      }
      bump(h, 'turns');
      if (h.longRest) log(s, `${h.name} takes a long rest: choose a card from the discard pile to lose.`, 'hero');
      else log(s, `${h.name}'s turn.`, 'hero');
      return true;
    }
    return false;
  }
  if (slot.kind === 'summon') {
    const u = unit(s, slot.who);
    if (u && !u.dead && u.kind === 'summon') summonTurn(s, u);
    nextSlot(s);
    return true;
  }
  // monster type: one monster per tick, elites first then by number
  const list = monsters(s)
    .filter((m) => m.monster === slot.who && !m.summoned)
    .sort((a, b) => Number(b.elite) - Number(a.elite) || a.num - b.num);
  const m = list[s.monsterCursor];
  if (!m) {
    nextSlot(s);
    return true;
  }
  s.monsterCursor++;
  monsterTurn(s, m);
  checkEnd(s);
  return true;
}

function moveCard(h: HeroUnit, c: string, to: 'discard' | 'lost'): void {
  h.hand = h.hand.filter((x) => x !== c);
  h[to].push(c);
  if (to === 'lost') h.stats.lost++;
}

interface Focus {
  target: Unit;
  dest: [number, number] | null;
  cost: number;
}

/** Gloomhaven-style focus: the enemy this unit can reach an attack position on with the least movement. */
function findFocus(s: CombatState, u: Unit, range: number, moveN: number, jump: boolean): Focus | null {
  const foes = enemiesOf(s, u).filter((f) => !hasCond(f, 'invisible'));
  if (!foes.length) return null;
  const r = reach(s, u, { max: 60, hazardCost: 3, jump });
  let best: Focus | null = null;
  let bestKey = Infinity;
  for (const f of foes) {
    let cost = Infinity;
    let dest: [number, number] | null = null;
    // the unit's own tile
    if (inRange(s, u, f, range)) {
      cost = 0;
      dest = [u.x, u.y];
    } else {
      for (const [k, c] of r.cost) {
        if (c >= cost) continue;
        const [x, y] = unkey(k);
        const occ = unitAt(s, x, y);
        if (occ && occ !== u) continue;
        const t = tile(s.map, x, y);
        if (t === 'D') continue;
        if (!inRange(s, { x, y }, f, range)) continue;
        cost = c;
        dest = [x, y];
      }
    }
    const k2 = (cost === Infinity ? 1e6 : cost * 1000) + hexDist(u.x, u.y, f.x, f.y) * 10 + initOf(s, f) / 100;
    if (k2 < bestKey) {
      bestKey = k2;
      best = { target: f, dest, cost };
    }
  }
  if (best && best.cost === Infinity) {
    // nobody reachable: walk toward the nearest foe through allies' gaps
    const r2 = reach(s, u, { max: 60, hazardCost: 3, ghost: true });
    let d = Infinity;
    for (const [k, c] of r2.cost) {
      const [x, y] = unkey(k);
      const dd = hexDist(x, y, best.target.x, best.target.y) * 100 + c;
      if (dd < d && !unitAt(s, x, y)) {
        d = dd;
        best.dest = [x, y];
      }
    }
  }
  void moveN;
  return best;
}

/** Walk a unit toward a destination along its path, as far as the budget allows. */
function walk(s: CombatState, u: Unit, dest: [number, number], budget: number, jump: boolean): void {
  if (budget <= 0 || (dest[0] === u.x && dest[1] === u.y)) return;
  const r = reach(s, u, { max: 80, hazardCost: 3, jump });
  if (!r.cost.has(key(dest[0], dest[1]))) return;
  const path = pathTo(r, [u.x, u.y], dest);
  let land: [number, number] | null = null;
  const cost0 = (k: number): number => r.cost.get(k) ?? Infinity;
  // the real (un-penalised) move cost along the path
  let spent = 0;
  const steps: [number, number][] = [];
  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i]!;
    const t = tile(s.map, x, y);
    spent += !jump && t === ',' ? 2 : 1;
    if (spent > budget) break;
    void cost0;
    steps.push([x, y]);
    if (!unitAt(s, x, y)) land = [x, y];
  }
  if (!land) return;
  const idx = steps.findIndex(([x, y]) => x === land![0] && y === land![1]);
  const walked = steps.slice(0, idx + 1);
  const from: [number, number] = [u.x, u.y];
  for (const [x, y] of walked) {
    u.facing = Math.atan2(y - u.y, x - u.x);
    u.x = x;
    u.y = y;
    // passing through hazards hurts only where the unit actually stops or steps (not flying/jumping)
    const t = tile(s.map, x, y);
    if ((t === '~' || t === 'T') && !jump) {
      enterTile(s, u, jump);
      if (u.dead) break;
    }
  }
  fx(s, { kind: 'move', uid: u.uid, path: [from, ...walked] });
}

function monsterTurn(s: CombatState, m: MonsterUnit): void {
  const def = monsterDef(m.monster);
  const ab = def.abilities[s.drawn[m.monster] ?? 0]!;
  turnStart(s, m);
  if (m.dead) return;
  if (hasCond(m, 'stun')) {
    log(s, `${nameOf(m)} is stunned.`, 'monster');
    endUnitTurn(s, m);
    return;
  }
  log(s, `${nameOf(m)}: ${ab.name}.`, 'monster');
  if (ab.shield) m.shield += ab.shield;
  if (ab.retaliate) m.retaliate += ab.retaliate;
  if (ab.summon) {
    const id = summonFor(def, ab);
    const count = def.boss ? Math.max(1, Math.ceil(heroes(s).filter((h) => !h.exhausted).length / 2)) : 1;
    let made = 0;
    for (let i = 0; i < count; i++) {
      const spots = freeNeighbours(s, m.x, m.y);
      if (!spots.length) break;
      const [x, y] = spots[Math.floor(rand(s) * spots.length)]!;
      spawnMonster(s, id, x, y, false, true);
      made++;
    }
    if (made) fx(s, { kind: 'text', uid: m.uid, text: ab.text ?? 'Summon!', color: '#ff9a6a' });
  }
  if (ab.heal) {
    const allies = alliesOf(s, m).filter((a) => a.kind === 'monster' && hexDist(a.x, a.y, m.x, m.y) <= ab.heal!.range && (a.hp < a.maxHp || hasCond(a, 'poison') || hasCond(a, 'wound')));
    allies.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    const t = allies[0];
    if (t) {
      const n = healUnit(s, t, ab.heal.n);
      log(s, `${nameOf(m)} heals ${nameOf(t)} for ${n}.`, 'monster');
    }
  }
  if (ab.infuse) infuseEl(s, ab.infuse);
  if (ab.move !== null || ab.atk !== null) monsterMoveAttack(s, m, ab);
  endUnitTurn(s, m);
}

function monsterMoveAttack(s: CombatState, m: MonsterUnit, ab: MonsterAbility): void {
  const stat = m.stat;
  const range = ab.range ?? stat.range;
  const moveN = ab.move === null ? 0 : Math.max(0, stat.move + ab.move);
  const canMove = moveN > 0 && !hasCond(m, 'immobilize');
  const attackRange = ab.blue ? Math.max(1, range) : range;
  const focus = findFocus(s, m, attackRange, moveN, !!ab.jump || !!monsterDef(m.monster).flying);
  if (!focus) return;
  if (ab.jump && !hasCond(m, 'immobilize')) {
    const spots = freeNeighbours(s, focus.target.x, focus.target.y);
    if (spots.length && !inRange(s, m, focus.target, attackRange)) {
      spots.sort((a, b) => hexDist(a[0], a[1], m.x, m.y) - hexDist(b[0], b[1], m.x, m.y));
      const from: [number, number] = [m.x, m.y];
      [m.x, m.y] = spots[0]!;
      fx(s, { kind: 'move', uid: m.uid, path: [from, [m.x, m.y]] });
    }
  } else if (canMove && focus.dest) {
    // ranged units prefer a spot that is not next to a hero
    let dest = focus.dest;
    if (range > 0 && focus.cost <= moveN) {
      const r = reach(s, m, { max: moveN, hazardCost: 3 });
      let bestScore = Infinity;
      for (const k of [key(m.x, m.y), ...landing(s, m, r, moveN)]) {
        const [x, y] = unkey(k);
        if (!inRange(s, { x, y }, focus.target, range)) continue;
        const adj = enemiesOf(s, m).some((e) => hexDist(e.x, e.y, x, y) === 1) ? 100 : 0;
        const sc = adj + (r.cost.get(k) ?? 0);
        if (sc < bestScore) {
          bestScore = sc;
          dest = [x, y];
        }
      }
    }
    walk(s, m, dest, moveN, !!monsterDef(m.monster).flying);
    if (m.dead) return;
  }
  if (ab.atk === null || hasCond(m, 'disarm')) return;
  const base = Math.max(0, stat.atk + ab.atk);
  const cond = [...(stat.cond ?? []), ...(ab.cond ?? [])];
  const opts: AttackOpts = {
    base,
    ranged: range > 0,
    cond,
    ...(ab.push ? { push: ab.push } : {}),
    ...(ab.pull ? { pull: ab.pull } : {}),
    ...(ab.type ? { type: ab.type } : {}),
    ...(ab.red ? { red: true } : {}),
  };
  let targets: Unit[];
  if (ab.blue) {
    targets = enemiesOf(s, m).filter((e) => !hasCond(e, 'invisible') && hexDist(e.x, e.y, m.x, m.y) <= attackRange && los(s.map, m.x, m.y, e.x, e.y));
    if (targets.length) fx(s, { kind: 'text', uid: m.uid, text: ab.name, color: '#8fd3ff' });
  } else {
    const inR = enemiesOf(s, m)
      .filter((e) => !hasCond(e, 'invisible') && inRange(s, m, e, range))
      .sort((a, b) => (a === focus.target ? -1 : b === focus.target ? 1 : hexDist(a.x, a.y, m.x, m.y) - hexDist(b.x, b.y, m.x, m.y)));
    targets = inR.slice(0, ab.targets ?? 1);
    if (ab.red && targets.length) fx(s, { kind: 'text', uid: m.uid, text: ab.name, color: '#ff4a3a' });
  }
  for (const t of targets) {
    if (m.dead) break;
    m.facing = Math.atan2(t.y - m.y, t.x - m.x);
    attack(s, m, t, opts);
  }
}

function summonTurn(s: CombatState, u: SummonUnit): void {
  if (u.summoned) return;
  turnStart(s, u);
  if (u.dead) return;
  if (hasCond(u, 'stun')) {
    endUnitTurn(s, u);
    return;
  }
  const def = SUMMONS[u.summon];
  if (def?.healer) {
    const allies = alliesOf(s, u).filter((a) => a.kind !== 'summon' && hexDist(a.x, a.y, u.x, u.y) <= 2 && (a.hp < a.maxHp || hasCond(a, 'poison') || hasCond(a, 'wound')));
    allies.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (allies[0]) {
      const n = healUnit(s, allies[0], def.healer, hero(s, u.heroUid));
      log(s, `${nameOf(u)} patches up ${nameOf(allies[0])} (+${n}).`, 'hero');
    }
  }
  if (u.stat.atk > 0) {
    const ab: MonsterAbility = { name: 'Attack', init: 0, move: 0, atk: 0 };
    const focus = findFocus(s, u, u.stat.range, u.stat.move, false);
    if (focus?.dest && u.stat.move > 0 && !hasCond(u, 'immobilize')) walk(s, u, focus.dest, u.stat.move, false);
    if (focus && !u.dead && !hasCond(u, 'disarm') && inRange(s, u, focus.target, u.stat.range)) {
      u.facing = Math.atan2(focus.target.y - u.y, focus.target.x - u.x);
      attack(s, u, focus.target, { base: u.stat.atk, ranged: u.stat.range > 0, cond: [...(u.stat.cond ?? [])] });
    }
    void ab;
  }
  endUnitTurn(s, u);
}

// ------------------------------------------------------------------ hero turns

/** Whether a step needs the player to choose something. */
export function stepNeedsInput(s: CombatState, h: HeroUnit, st: Step): boolean {
  switch (st.t) {
    case 'move':
      return !hasCond(h, 'immobilize') && (s.heroTurn?.cur?.movesLeft ?? st.n) > 0 && moveOptions(s, h).length > 0;
    case 'attack':
      if (hasCond(h, 'disarm')) return false;
      if (st.all || st.aoe === 'ring') return false;
      return attackOptions(s, h, st).length > 0;
    case 'heal':
    case 'shield':
    case 'buff':
      if (st.all || !st.range) return false;
      return true;
    case 'bless':
      return (st.range ?? 0) > 0;
    case 'curse':
      return enemiesOf(s, h).some((e) => inRange(s, h, e, st.range));
    case 'teleport':
      return true;
    case 'recover':
      return h.lost.length > 0;
    default:
      return false;
  }
}

/** Tiles the acting hero may move to (keys) with the moves left. */
export function moveOptions(s: CombatState, h: HeroUnit): number[] {
  const cur = s.heroTurn?.cur;
  if (!cur) return [];
  const st = cur.steps[cur.step];
  if (!st || st.t !== 'move') return [];
  const r = reach(s, h, { max: cur.movesLeft ?? st.n, doors: true, hazardCost: 0.01, ...(cur.jump || st.jump ? { jump: true } : {}) });
  return landing(s, h, r, cur.movesLeft ?? st.n);
}

/** Valid targets for an attack step: unit uids, or tile keys for aimed area shapes. */
export function attackOptions(s: CombatState, h: HeroUnit, st: Extract<Step, { t: 'attack' }>): string[] {
  const cur = s.heroTurn?.cur;
  const hit = new Set(cur?.targetsHit ?? []);
  const range = effRange(s, st);
  if (st.aoe && st.aoe !== 'ring') {
    // aimed shapes: list tiles that would hit at least one enemy
    const out: string[] = [];
    const cands: [number, number][] = [];
    if (st.aoe === 'blast' || st.aoe === 'cross') {
      const R = Math.max(1, range);
      for (const [x, y] of hexesWithin(h.x, h.y, R)) if (los(s.map, h.x, h.y, x, y)) cands.push([x, y]);
    } else cands.push(...neighbors(h.x, h.y));
    for (const [x, y] of cands) if (aoeTiles(s, h, st, x, y).some(([ax, ay]) => enemyAt(s, h, ax, ay))) out.push(`t${key(x, y)}`);
    return out;
  }
  return enemiesOf(s, h)
    .filter((e) => !hit.has(e.uid) && !hasCond(e, 'invisible') && inRange(s, h, e, range))
    .map((e) => e.uid);
}

function enemyAt(s: CombatState, h: HeroUnit, x: number, y: number): Unit | undefined {
  const u = unitAt(s, x, y);
  return u && !isHeroSide(u) && !hasCond(u, 'invisible') ? u : undefined;
  void h;
}

function effRange(s: CombatState, st: Extract<Step, { t: 'attack' }>): number {
  const extra = s.heroTurn?.cur && (s.heroTurn.cur as { bonus?: Consume }).bonus?.range;
  return st.range + (extra ?? 0);
}

/**
 * The hexes an area attack covers when aimed at (x, y). Melee shapes are aimed at a neighbouring hex (their
 * direction); blast and cross are centred on a hex in range.
 *   cleave: the aimed hex and the next one clockwise around you · line2/line3: a straight line outward ·
 *   cone: the aimed hex and the three beyond it fanning out · ring: all six neighbours ·
 *   blast: the aimed hex and its six neighbours · cross: the aimed hex and the four hexes along two lines.
 */
export function aoeTiles(s: CombatState, h: { x: number; y: number }, st: Extract<Step, { t: 'attack' }>, x: number, y: number): [number, number][] {
  const d = dirIndex(h.x, h.y, x, y);
  const P = stepDir(h.x, h.y, d);
  switch (st.aoe) {
    case 'cleave':
      return [P, stepDir(h.x, h.y, d + 1)];
    case 'line2':
      return [P, stepDir(h.x, h.y, d, 2)];
    case 'line3':
      return [P, stepDir(h.x, h.y, d, 2), stepDir(h.x, h.y, d, 3)];
    case 'cone':
      return [P, stepDir(P[0], P[1], d), stepDir(P[0], P[1], d + 1), stepDir(P[0], P[1], d - 1)];
    case 'ring':
      return neighbors(h.x, h.y);
    case 'blast':
      return [[x, y], ...neighbors(x, y)];
    case 'cross':
      return [[x, y], stepDir(x, y, 0), stepDir(x, y, 3), stepDir(x, y, 1), stepDir(x, y, 4)];
    default:
      return [[x, y]];
  }
  void s;
}

function curStep(s: CombatState): Step | undefined {
  const cur = s.heroTurn?.cur;
  return cur ? cur.steps[cur.step] : undefined;
}

/** Start the current step: spend elements, set move budgets. */
function prepStep(s: CombatState, h: HeroUnit): void {
  const cur = s.heroTurn!.cur!;
  const st = cur.steps[cur.step];
  if (!st || cur.stepReady) return;
  const u = (st as { use?: Consume }).use;
  // the step could spend an element: the player decides (once per step)
  if (u && cur.elChoice === undefined) {
    const els = spendable(s, u.el);
    if (els.length) {
      cur.elAsk = els;
      return;
    }
  }
  const choice = cur.elChoice;
  delete cur.elAsk;
  delete cur.elChoice;
  cur.stepReady = true;
  cur.targetsHit = [];
  cur.anyHit = false;
  (cur as { bonus?: Consume }).bonus = undefined;
  if (u && choice) {
    const el = consume(s, choice);
    if (el) {
      (cur as { bonus?: Consume }).bonus = u;
      bump(h, 'elSpent');
      log(s, `${h.name} spends ${el}: ${u.text ?? 'bonus'}.`, 'hero');
      fx(s, { kind: 'infuse', el, uid: h.uid, text: 'spent' });
    }
  }
  if (st.t === 'move') {
    let n = st.n;
    for (const p of persists(h, 'move')) {
      n += p.persist.n;
      usePersist(s, h, p);
    }
    if (h.next.move) {
      n += h.next.move;
      delete h.next.move;
    }
    cur.movesLeft = n;
    cur.jump = !!st.jump || !!h.next.jump;
    delete h.next.jump;
  }
}

/** Run automatic steps until one needs input or the half is done. */
function runSteps(s: CombatState, h: HeroUnit): void {
  let guard = 0;
  while (s.heroTurn?.cur && guard++ < 30) {
    if (s.phase !== 'turns') return;
    const cur = s.heroTurn.cur;
    const st = cur.steps[cur.step];
    if (!st) {
      finishHalf(s, h);
      return;
    }
    prepStep(s, h);
    if (cur.elAsk) return;
    if (h.exhausted) return;
    if (stepNeedsInput(s, h, st)) return;
    autoStep(s, h, st);
    // an automatic attack pushed something with more than one way to go: wait for the player
    if (!settlePushes(s)) {
      s.pushThen = 'advance';
      return;
    }
    if (s.heroTurn?.cur === cur) advanceStep(s, h);
  }
}

function advanceStep(s: CombatState, h: HeroUnit): void {
  const cur = s.heroTurn!.cur!;
  const st = cur.steps[cur.step];
  const bonus = (cur as { bonus?: Consume }).bonus;
  if (st && 'xp' in st && st.xp && (st.t !== 'attack' || cur.anyHit)) h.xp += st.xp;
  if (bonus?.xp) h.xp += bonus.xp;
  cur.step++;
  cur.stepReady = false;
  delete cur.movesLeft;
}

function bonusOf(s: CombatState): Consume | undefined {
  return (s.heroTurn?.cur as { bonus?: Consume } | undefined)?.bonus;
}

function autoStep(s: CombatState, h: HeroUnit, st: Step): void {
  const b = bonusOf(s);
  switch (st.t) {
    case 'attack': {
      if (hasCond(h, 'disarm')) {
        log(s, `${h.name} is disarmed.`, 'bad');
        return;
      }
      let targets: Unit[] = [];
      if (st.aoe === 'ring') targets = enemiesOf(s, h).filter((e) => !hasCond(e, 'invisible') && hexDist(e.x, e.y, h.x, h.y) === 1);
      else if (st.all) targets = enemiesOf(s, h).filter((e) => !hasCond(e, 'invisible') && inRange(s, h, e, Math.max(1, effRange(s, st))));
      for (const t of targets) heroAttack(s, h, st, t);
      if (st.selfDmg && targets.length) damage(s, h, st.selfDmg);
      return;
    }
    case 'move':
      return;
    case 'heal': {
      const n = st.n + (b?.heal ?? b?.n ?? 0);
      const list = st.all ? alliesOf(s, h).filter((a) => hexDist(a.x, a.y, h.x, h.y) <= st.range) : [h];
      for (const a of list) {
        const got = healUnit(s, a, n, h);
        for (const c of st.cond ?? []) giveCond(s, a, c);
        log(s, `${h.name} heals ${nameOf(a)} (+${got}).`, 'heal');
      }
      return;
    }
    case 'shield': {
      const n = st.n + (b?.shield ?? b?.n ?? 0);
      const list = st.all ? alliesOf(s, h).filter((a) => hexDist(a.x, a.y, h.x, h.y) <= (st.range ?? 0)) : [h];
      bump(h, 'shieldGiven', n * list.length);
      for (const a of list) {
        a.shield += n;
        fx(s, { kind: 'shield', uid: a.uid, text: `Shield ${n}`, color: '#9ad0ff' });
      }
      log(s, `${h.name}: Shield ${n}${st.all ? ' for allies in range' : ''}.`, 'hero');
      return;
    }
    case 'retaliate': {
      const n = st.n + (b?.n ?? 0);
      h.retaliate += n;
      h.retRange = Math.max(h.retRange, st.range ?? 1);
      fx(s, { kind: 'shield', uid: h.uid, text: `Retaliate ${n}`, color: '#ffb84a' });
      log(s, `${h.name}: Retaliate ${n}.`, 'hero');
      return;
    }
    case 'buff': {
      const list = st.all ? alliesOf(s, h).filter((a) => hexDist(a.x, a.y, h.x, h.y) <= (st.range ?? 0)) : [h];
      for (const a of list) for (const c of [...st.cond, ...(b?.cond ?? [])]) giveCond(s, a, c);
      return;
    }
    case 'loot': {
      const n = st.n + (b?.n ?? 0);
      const got = s.pickups.filter((p) => !p.opened && hexDist(p.x, p.y, h.x, h.y) <= n && los(s.map, h.x, h.y, p.x, p.y));
      for (const p of got) takePickup(s, h, p);
      if (!got.length) log(s, `${h.name} finds nothing to loot.`, 'info');
      return;
    }
    case 'infuse':
      infuseEl(s, st.el, h);
      log(s, `${h.name} infuses ${st.el}.`, 'hero');
      return;
    case 'summon': {
      const def = SUMMONS[st.id];
      if (!def) return;
      const spots = freeNeighbours(s, h.x, h.y);
      if (!spots.length) {
        log(s, 'No room for a summon.', 'info');
        return;
      }
      // closest free tile to an enemy
      const foes = enemiesOf(s, h);
      spots.sort((a, b) => Math.min(99, ...foes.map((f) => hexDist(f.x, f.y, a[0], a[1]))) - Math.min(99, ...foes.map((f) => hexDist(f.x, f.y, b[0], b[1]))));
      const [x, y] = spots[0]!;
      const hp = def.hp + Math.floor(h.level / 2);
      const su: SummonUnit = {
        uid: `s${++s.fxId}`,
        kind: 'summon',
        summon: def.id,
        owner: h.owner,
        heroUid: h.uid,
        stat: { hp, move: def.move, atk: def.atk + (h.level >= 4 ? 1 : 0), range: def.range, ...(def.cond ? { cond: def.cond } : {}), ...(def.shield ? { shield: def.shield } : {}) },
        x,
        y,
        hp,
        maxHp: hp,
        conds: [],
        fresh: [],
        shield: 0,
        retaliate: 0,
        retRange: 1,
        facing: Math.PI / 2,
        summoned: true,
      };
      s.units.push(su);
      bump(h, 'summons');
      log(s, `${h.name} summons ${def.name}.`, 'hero');
      fx(s, { kind: 'text', uid: su.uid, text: def.name, color: '#9ce59c' });
      return;
    }
    case 'recover':
      // with lost cards the player chooses (the 'recover' intent); with none there is nothing to get back
      log(s, `${h.name} has no lost cards to recover.`, 'info');
      return;
    case 'bless': {
      if (st.range === 0) addBless(s, h, h, st.n);
      return;
    }
    case 'xp':
      return;
    default:
      return;
  }
}

function addBless(s: CombatState, from: HeroUnit, to: Unit, n: number): void {
  const deck = deckOf(s, to);
  for (let i = 0; i < n; i++) deck.mods.push({ v: 0, temp: 'bless' });
  log(s, `${from.name} blesses ${nameOf(to)} (${n}).`, 'hero');
  fx(s, { kind: 'cond', uid: to.uid, text: `Bless ×${n}`, color: '#ffe98a' });
}

function takePickup(s: CombatState, h: HeroUnit, p: (typeof s.pickups)[number]): void {
  if (p.opened) return;
  p.opened = true;
  bump(h, p.kind === 'coin' ? 'coins' : 'chests');
  if (p.kind === 'coin') {
    const g = COIN_VALUE[Math.min(7, s.scenario.level)]!;
    h.gold += g;
    fx(s, { kind: 'loot', uid: h.uid, text: `+${g} gold`, color: '#ffd24a' });
    log(s, `${h.name} picks up ${g} gold.`, 'good');
  } else if (p.item && ITEMS[p.item]) {
    if (!h.items.some((i) => i.id === p.item)) h.items.push({ id: p.item, state: 'ready' });
    (h as HeroUnit & { found?: string[] }).found = [...((h as HeroUnit & { found?: string[] }).found ?? []), p.item];
    fx(s, { kind: 'loot', uid: h.uid, text: ITEMS[p.item]!.name, color: '#ffd24a' });
    log(s, `${h.name} opens a chest: ${ITEMS[p.item]!.name}!`, 'good');
  } else {
    const g = p.gold ?? 10;
    h.gold += g;
    fx(s, { kind: 'loot', uid: h.uid, text: `+${g} gold`, color: '#ffd24a' });
    log(s, `${h.name} opens a chest: ${g} gold.`, 'good');
  }
  s.pickups = s.pickups.filter((x) => !x.opened);
}

function heroAttack(s: CombatState, h: HeroUnit, st: Extract<Step, { t: 'attack' }>, t: Unit): void {
  const cur = s.heroTurn!.cur!;
  const b = bonusOf(s);
  h.facing = Math.atan2(t.y - h.y, t.x - h.x);
  attack(s, h, t, {
    base: st.n + (b?.n ?? 0),
    ranged: st.range > 0,
    pierce: (st.pierce ?? 0) + (b?.pierce ?? 0),
    cond: [...(st.cond ?? []), ...(b?.cond ?? [])],
    push: (st.push ?? 0) + (b?.push ?? 0),
    pull: st.pull ?? 0,
    ...(st.type ? { type: st.type } : {}),
    drain: (st.drain ?? 0) + (b?.heal ?? 0),
  });
  cur.targetsHit.push(t.uid);
  cur.anyHit = true;
  checkEnd(s);
}

function finishHalf(s: CombatState, h: HeroUnit): void {
  const t = s.heroTurn!;
  const cur = t.cur!;
  t.used.push({ card: cur.card, half: cur.half, basic: cur.basic });
  t.cur = null;
  if (!cur.basic) {
    const half = cardDef(cur.card)[cur.half];
    if (half.persist) {
      h.active.push({ card: cur.card, half: cur.half, persist: half.persist, left: half.persist.uses });
      log(s, `${h.name}: ${half.persist.text}.`, 'hero');
    }
    if (half.xp) h.xp += half.xp;
  }
  if (t.used.length >= 2) endHeroTurn(s, h);
}

function endHeroTurn(s: CombatState, h: HeroUnit): void {
  const t = s.heroTurn!;
  for (const c of h.picked) {
    const plays = t.used.filter((u) => u.card === c);
    const lostHalf = plays.some((u) => !u.basic && cardDef(c)[u.half].lost);
    const active = h.active.some((a) => a.card === c);
    h.hand = h.hand.filter((x) => x !== c);
    if (active) continue;
    if (lostHalf) {
      h.lost.push(c);
      h.stats.lost++;
    } else h.discard.push(c);
  }
  // end-of-turn loot: coins and chests on the hero's own tile
  const here = s.pickups.filter((p) => p.x === h.x && p.y === h.y);
  for (const p of here) takePickup(s, h, p);
  if (tile(s.map, h.x, h.y) === 'X' && s.scenario.objective.kind === 'escape') {
    h.escaped = true;
    h.exhausted = true;
    log(s, `${h.name} escapes!`, 'good');
    fx(s, { kind: 'text', uid: h.uid, text: 'Escaped!', color: '#9ce59c' });
  }
  finishTurnCommon(s, h);
}

function finishTurnCommon(s: CombatState, h: HeroUnit): void {
  for (const el of s.infusedNow) s.elements[el] = 2;
  s.infusedNow = [];
  endUnitTurn(s, h);
  nextSlot(s);
}

// ------------------------------------------------------------------ intents

function owns(s: CombatState, player: string, uid: string): HeroUnit | null {
  const h = hero(s, uid);
  if (!h || (player !== '*' && h.owner !== player)) return null;
  return h;
}

/** Apply a player's intent. Returns an error message, or null when it worked. */
export function act(s: CombatState, player: string, i: Intent): string | null {
  // a refused action changes nothing, so the chosen half stays undoable
  const undo = s.undo ?? null;
  const err = actInner(s, player, i);
  if (err) s.undo = undo;
  return err;
}

/**
 * A co-op player left the game for good: their heroes drop out (exhausted) so the fight can go on without waiting on
 * them. (A player who only lost their connection keeps their heroes; the game waits for them to come back.)
 */
export function dropPlayer(s: CombatState, owner: string): boolean {
  let changed = false;
  for (const h of heroes(s)) {
    if (h.owner !== owner || h.exhausted) continue;
    h.exhausted = true;
    changed = true;
    log(s, `${h.name} leaves the fight: their player left the game.`, 'bad');
    s.pendQ = s.pendQ.filter((p) => p.heroUid !== h.uid);
    if (s.pending?.heroUid === h.uid) s.pending = s.pendQ.shift() ?? null;
    if (s.phase === 'turns' && s.heroTurn?.uid === h.uid) nextSlot(s);
  }
  if (changed) {
    checkEnd(s);
    if (s.phase === 'select') maybeStart(s);
  }
  return changed;
}

/** The whole state as JSON (minus the log, effects and any older snapshot). */
function snapshot(s: CombatState): string {
  return JSON.stringify({ ...s, undo: null, log: [], fx: [] });
}

/** Take back the card half the acting hero chose, if they have not acted on it yet. */
function undoHalf(s: CombatState, h: HeroUnit): string | null {
  if (!s.undo) return 'Nothing to take back: you have already acted on that card.';
  const before = JSON.parse(s.undo) as CombatState;
  const { log: keepLog, fx: keepFx, fxId, logSeq } = s;
  // anything created since the snapshot goes too (e.g. an empty push queue), so the restore is exact
  for (const k of Object.keys(s) as (keyof CombatState)[]) if (!(k in before) && k !== 'log' && k !== 'fx' && k !== 'fxId' && k !== 'logSeq' && k !== 'undo') delete s[k];
  Object.assign(s, before);
  s.logSeq = logSeq;
  s.log = keepLog;
  s.fx = keepFx;
  s.fxId = fxId;
  s.undo = null;
  log(s, `${h.name} takes that card back.`, 'hero');
  return null;
}

function actInner(s: CombatState, player: string, i: Intent): string | null {
  if (s.phase === 'won' || s.phase === 'lost') return 'The scenario is over.';
  const h = owns(s, player, i.uid);
  if (!h) return 'That is not your hero.';
  switch (i.t) {
    case 'pick': {
      if (s.phase !== 'select') return 'Not now.';
      if (h.exhausted) return 'Exhausted.';
      if (h.restDraw) return 'Finish your short rest first.';
      if (i.cards.length !== 2 || i.cards[0] === i.cards[1] || !i.cards.every((c) => h.hand.includes(c))) return 'Pick two different cards from your hand.';
      h.picked = [...i.cards];
      h.longRest = false;
      h.ready = true;
      maybeStart(s);
      return null;
    }
    case 'place': {
      if (!placing(s)) return 'Start positions are locked once the first round begins.';
      if (!startOptions(s).some(([x, y]) => x === i.x && y === i.y)) return 'Pick one of the free start hexes.';
      const from: [number, number] = [h.x, h.y];
      h.x = i.x;
      h.y = i.y;
      fx(s, { kind: 'move', uid: h.uid, path: [from, [h.x, h.y]] });
      return null;
    }
    case 'longRest': {
      if (s.phase !== 'select') return 'Not now.';
      if (h.restDraw) return 'Finish your short rest first.';
      if (h.discard.length < 2) return 'You need at least two cards in your discard pile to long rest.';
      h.picked = [];
      h.longRest = true;
      h.ready = true;
      maybeStart(s);
      return null;
    }
    case 'unready': {
      if (s.phase !== 'select') return 'Not now.';
      h.ready = false;
      h.picked = [];
      h.longRest = false;
      return null;
    }
    case 'shortRest': {
      if (s.phase !== 'select') return 'You can short rest between rounds.';
      if (h.shortRested) return 'You already short rested this round.';
      if (h.restDraw) return 'Finish your short rest first.';
      if (h.discard.length < 2) return 'You need at least two cards in your discard pile.';
      // a random discarded card is drawn to be lost; the hero may pay 1 HP once to lose a different one instead
      const card = h.discard[Math.floor(rand(s) * h.discard.length)]!;
      h.restDraw = { card };
      h.ready = false;
      h.picked = [];
      h.longRest = false;
      log(s, `${h.name} short rests: ${cardDef(card).name} will be lost (or pay 1 HP to lose a different card).`, 'hero');
      return null;
    }
    case 'restKeep':
    case 'restReroll': {
      const d = h.restDraw;
      if (!d) return 'You are not short resting.';
      let lose = d.card;
      if (i.t === 'restReroll') {
        if (h.hp <= 1) return 'Not enough health to pay for it.';
        const others = h.discard.filter((c) => c !== d.card);
        if (!others.length) return 'There is no other card to lose.';
        h.hp -= 1;
        fx(s, { kind: 'dmg', uid: h.uid, text: '-1', color: '#ff5a4a' });
        lose = others[Math.floor(rand(s) * others.length)]!;
        log(s, `${h.name} pays 1 HP to keep ${cardDef(d.card).name}.`, 'hero');
      }
      h.discard = h.discard.filter((c) => c !== lose);
      h.lost.push(lose);
      h.stats.lost++;
      h.hand.push(...h.discard);
      h.discard = [];
      h.shortRested = true;
      h.restDraw = null;
      bump(h, 'shortRests');
      log(s, `${h.name} finishes a short rest and loses ${cardDef(lose).name}.`, 'hero');
      // too few cards left to play a turn: exhausted now, and the round may be ready to start without them
      checkExhaustion(s);
      checkEnd(s);
      if (s.phase === 'select') maybeStart(s);
      return null;
    }
    case 'restLose': {
      if (!s.heroTurn || s.heroTurn.uid !== h.uid || !h.longRest) return 'Not resting.';
      if (!h.discard.includes(i.card)) return 'Pick a card from your discard pile.';
      h.discard = h.discard.filter((c) => c !== i.card);
      h.lost.push(i.card);
      h.stats.lost++;
      h.hand.push(...h.discard);
      h.discard = [];
      bump(h, 'longRests');
      healUnit(s, h, 2, h);
      for (const it of h.items) if (it.state === 'spent') it.state = 'ready';
      log(s, `${h.name} rests, loses ${cardDef(i.card).name}, heals and refreshes items.`, 'hero');
      finishTurnCommon(s, h);
      return null;
    }
    case 'negate': {
      const p = s.pending;
      if (!p || p.heroUid !== h.uid) return 'Nothing to answer.';
      const attacker = unit(s, p.fromUid);
      if (i.choice === 'take') {
        damage(s, h, p.dmg, attacker);
      } else if (i.choice.startsWith('discard:')) {
        // two cards of the hero's choosing from the discard pile
        const pair = i.choice.slice(8).split(',');
        if (pair.length !== 2 || pair[0] === pair[1] || !pair.every((c) => h.discard.includes(c))) return 'Choose two different cards from your discard pile.';
        h.discard = h.discard.filter((c) => !pair.includes(c));
        h.lost.push(...pair);
        h.stats.lost += 2;
        bump(h, 'negated');
        log(s, `${h.name} loses ${pair.map((c) => cardDef(c).name).join(' and ')} to avoid the damage.`, 'hero');
      } else {
        if (!h.hand.includes(i.choice) || h.picked.includes(i.choice)) return 'Pick a card from your hand (not one you picked this round).';
        h.hand = h.hand.filter((c) => c !== i.choice);
        h.lost.push(i.choice);
        h.stats.lost++;
        bump(h, 'negated');
        log(s, `${h.name} loses ${cardDef(i.choice).name} to avoid the damage.`, 'hero');
      }
      if (attacker) afterHit(s, attacker, h, p.cond, p.push, p.pull);
      s.pending = s.pendQ.shift() ?? null;
      checkEnd(s);
      return null;
    }
    case 'item':
      return useItem(s, h, i.item, i.cards);
    default:
      break;
  }
  // everything below happens on the hero's own turn
  if (s.phase !== 'turns' || !s.heroTurn || s.heroTurn.uid !== h.uid || !s.heroTurn.started) return 'It is not your turn.';
  if (s.pending) return 'Waiting for an answer.';
  const t = s.heroTurn;
  if (i.t === 'undo') return undoHalf(s, h);
  // a push waiting for its direction comes first
  if (s.pushQ?.length) {
    if (i.t !== 'push') return 'Choose where to push the enemy first.';
    const opts = pushOptions(s);
    if (!opts.some(([x, y]) => x === i.x && y === i.y)) return 'It can’t be pushed there: pick a highlighted hex.';
    pushStep(s, i.x, i.y);
    if (settlePushes(s)) {
      const then = s.pushThen;
      s.pushThen = null;
      if (then === 'advance' && s.phase === 'turns' && t.cur) {
        advanceStep(s, h);
        runSteps(s, h);
      }
    }
    return null;
  }
  if (i.t === 'useEl') {
    const cur = t.cur;
    if (!cur?.elAsk) return 'Nothing to spend an element on.';
    if (i.el !== null && !cur.elAsk.includes(i.el)) return 'That element is not available.';
    cur.elChoice = i.el;
    if (i.el === null) log(s, `${h.name} keeps the element${cur.elAsk.length > 1 ? 's' : ''} for later.`, 'hero');
    runSteps(s, h);
    return null;
  }
  if (t.cur?.elAsk) return 'First choose whether to spend the element.';
  // anything else done on the board is an action: the chosen half can no longer be taken back
  if (i.t !== 'half') s.undo = null;
  switch (i.t) {
    case 'half': {
      if (h.longRest) return 'You are resting this turn.';
      if (t.cur) return 'Finish the current action first.';
      if (!h.picked.includes(i.card)) return 'Play one of your two picked cards.';
      if (t.used.some((u) => u.card === i.card)) return 'You already used that card.';
      if (t.used.some((u) => u.half === i.half)) return i.half === 'top' ? 'You already played a top half.' : 'You already played a bottom half.';
      const steps: Step[] = i.basic ? [i.half === 'top' ? { t: 'attack', n: 2, range: 0 } : { t: 'move', n: 2 }] : heroCard(h, i.card)[i.half].steps;
      // remember the board as it is now, so this choice can be taken back until the hero acts on it
      const snap = snapshot(s);
      t.cur = { card: i.card, half: i.half, basic: i.basic, step: 0, steps, targetsHit: [], anyHit: false, stepReady: false };
      const c = cardDef(i.card);
      bump(h, i.basic ? 'basics' : 'halves');
      s.undo = snap;
      log(s, `${h.name} plays ${i.basic ? (i.half === 'top' ? 'a basic Attack 2' : 'a basic Move 2') : `${c.name} (${i.half === 'top' ? 'top' : 'bottom'})`}.`, 'hero');
      runSteps(s, h);
      return null;
    }
    case 'recover': {
      const st = curStep(s);
      if (!t.cur || st?.t !== 'recover') return 'Nothing to recover right now.';
      const pick = [...new Set(i.cards)];
      if (pick.length > st.n) return `Recover at most ${st.n}.`;
      if (!pick.every((c) => h.lost.includes(c))) return 'Pick cards from your lost pile.';
      h.lost = h.lost.filter((c) => !pick.includes(c));
      h.hand.push(...pick);
      log(s, pick.length ? `${h.name} recovers ${pick.map((c) => cardDef(c).name).join(' and ')} from the lost pile.` : `${h.name} recovers nothing.`, 'hero');
      advanceStep(s, h);
      runSteps(s, h);
      return null;
    }
    case 'skip': {
      if (!t.cur) return 'Nothing to skip.';
      const st = curStep(s);
      if (st?.t === 'attack' && st.selfDmg && t.cur.anyHit) damage(s, h, st.selfDmg);
      advanceStep(s, h);
      runSteps(s, h);
      return null;
    }
    case 'move': {
      const cur = t.cur;
      const st = curStep(s);
      if (!cur || !st) return 'Not moving.';
      if (st.t === 'teleport') {
        const n = st.n;
        if (hexDist(h.x, h.y, i.x, i.y) > n || unitAt(s, i.x, i.y)) return 'Too far or occupied.';
        const c = tile(s.map, i.x, i.y);
        if (c !== '.' && c !== ',' && c !== 'd' && c !== '~' && c !== 'X') return 'You can’t teleport there.';
        const from: [number, number] = [h.x, h.y];
        h.x = i.x;
        h.y = i.y;
        fx(s, { kind: 'move', uid: h.uid, path: [from, [h.x, h.y]], text: 'tp' });
        log(s, `${h.name} teleports.`, 'hero');
        advanceStep(s, h);
        runSteps(s, h);
        return null;
      }
      if (st.t !== 'move') return 'Not a move.';
      if (hasCond(h, 'immobilize')) return 'You are immobilized.';
      const budget = cur.movesLeft ?? st.n;
      const jump = !!cur.jump;
      const r = reach(s, h, { max: budget, doors: true, hazardCost: 0.01, ...(jump ? { jump } : {}) });
      const k = key(i.x, i.y);
      const c = r.cost.get(k);
      if (c === undefined || Math.floor(c + 1e-9) > budget || unitAt(s, i.x, i.y)) return 'You can’t move there.';
      const path = pathTo(r, [h.x, h.y], [i.x, i.y]);
      const from: [number, number] = [h.x, h.y];
      for (const [x, y] of path.slice(1)) {
        h.facing = Math.atan2(y - h.y, x - h.x);
        h.x = x;
        h.y = y;
        const tt = tile(s.map, x, y);
        if (tt === '~' || tt === 'T' || tt === 'D') {
          // only the landing tile triggers when jumping
          if (!jump || (x === i.x && y === i.y)) enterTile(s, h, jump && !(x === i.x && y === i.y));
        }
        if (h.exhausted) break;
      }
      fx(s, { kind: 'move', uid: h.uid, path });
      bump(h, 'moved', path.length - 1);
      void from;
      cur.movesLeft = budget - Math.floor(c + 1e-9);
      if (h.exhausted) {
        checkEnd(s);
        if (s.heroTurn?.uid === h.uid) nextSlot(s);
        return null;
      }
      if (cur.movesLeft <= 0 || moveOptions(s, h).length === 0) {
        advanceStep(s, h);
        runSteps(s, h);
      }
      return null;
    }
    case 'target': {
      const cur = t.cur;
      const st = curStep(s);
      if (!cur || !st) return 'Nothing to target.';
      const b = bonusOf(s);
      if (st.t === 'attack') {
        if (st.aoe && st.aoe !== 'ring') {
          if (i.x === undefined || i.y === undefined) return 'Pick where to aim.';
          if (!attackOptions(s, h, st).includes(`t${key(i.x, i.y)}`)) return 'Nothing to hit there.';
          const hitT = aoeTiles(s, h, st, i.x, i.y)
            .map(([x, y]) => enemyAt(s, h, x, y))
            .filter((u): u is Unit => !!u);
          for (const u of hitT) heroAttack(s, h, st, u);
          if (st.selfDmg && hitT.length) damage(s, h, st.selfDmg);
          if (!settlePushes(s)) {
            s.pushThen = 'advance';
            return null;
          }
          advanceStep(s, h);
          runSteps(s, h);
          return null;
        }
        const target = i.target ? unit(s, i.target) : undefined;
        if (!target || !attackOptions(s, h, st).includes(target.uid)) return 'You can’t attack that.';
        heroAttack(s, h, st, target);
        const max = (st.targets ?? 1) + (b?.targets ?? 0);
        if (s.phase !== 'turns') return null;
        const done = cur.targetsHit.length >= max || attackOptions(s, h, st).length === 0;
        if (done && st.selfDmg) damage(s, h, st.selfDmg);
        if (!settlePushes(s)) {
          s.pushThen = done ? 'advance' : 'stay';
          return null;
        }
        if (done) {
          advanceStep(s, h);
          runSteps(s, h);
        }
        return null;
      }
      if (st.t === 'heal' || st.t === 'shield' || st.t === 'buff' || st.t === 'bless') {
        const target = i.target ? unit(s, i.target) : undefined;
        const range = st.range ?? 0;
        if (!target || !isHeroSide(target) || target.dead || (target.kind === 'hero' && target.exhausted)) return 'Pick an ally.';
        if (target !== h && !inRange(s, h, target, Math.max(1, range))) return 'Out of range.';
        if (st.t === 'heal') {
          const got = healUnit(s, target, st.n + (b?.heal ?? b?.n ?? 0), h);
          for (const c of st.cond ?? []) giveCond(s, target, c);
          log(s, `${h.name} heals ${nameOf(target)} (+${got}).`, 'heal');
        } else if (st.t === 'shield') {
          const n = st.n + (b?.shield ?? b?.n ?? 0);
          target.shield += n;
          fx(s, { kind: 'shield', uid: target.uid, text: `Shield ${n}`, color: '#9ad0ff' });
          log(s, `${h.name} shields ${nameOf(target)} (${n}).`, 'hero');
        } else if (st.t === 'buff') {
          for (const c of [...st.cond, ...(b?.cond ?? [])]) giveCond(s, target, c);
        } else addBless(s, h, target, st.n);
        advanceStep(s, h);
        runSteps(s, h);
        return null;
      }
      if (st.t === 'curse') {
        const target = i.target ? unit(s, i.target) : undefined;
        if (!target || isHeroSide(target) || !inRange(s, h, target, st.range)) return 'Pick an enemy in range.';
        for (let k = 0; k < st.n; k++) s.monsterMods.push({ v: 0, temp: 'curse' });
        log(s, `${h.name} curses ${nameOf(target)} (${st.n} curse${st.n > 1 ? 's' : ''} in the monster deck).`, 'hero');
        fx(s, { kind: 'cond', uid: target.uid, text: 'Cursed', color: '#b07aff' });
        advanceStep(s, h);
        runSteps(s, h);
        return null;
      }
      return 'Nothing to target.';
    }
    default:
      return 'Unknown action.';
  }
}

function maybeStart(s: CombatState): void {
  const live = heroes(s).filter((h) => !h.exhausted);
  if (live.length && live.every((h) => h.ready)) startRound(s);
}

function useItem(s: CombatState, h: HeroUnit, id: string, cards?: string[]): string | null {
  const it = h.items.find((x) => x.id === id);
  const def = ITEMS[id];
  if (!it || !def) return 'You don’t have that.';
  if (def.use === 'passive') return 'That item works on its own.';
  if (it.state !== 'ready') return 'Already used.';
  const myTurn = s.phase === 'turns' && s.heroTurn?.uid === h.uid;
  if (!myTurn) return 'Use items on your turn.';
  const st = curStep(s);
  const e = def.fx;
  const cur = s.heroTurn?.cur;
  if (def.when === 'move' && (st?.t !== 'move' || !cur)) return 'Use it while moving.';
  // returning discards: the player chooses which (nothing random)
  let back: string[] = [];
  if (e.recover) {
    if (!h.discard.length && Object.keys(e).length === 1) return 'Your discard pile is empty.';
    if (h.discard.length) {
      if (!cards) return `Choose up to ${e.recover} discarded card${e.recover > 1 ? 's' : ''} to return.`;
      back = [...new Set(cards)];
      if (back.length > e.recover) return `Return at most ${e.recover}.`;
      if (!back.every((c) => h.discard.includes(c))) return 'Pick cards from your discard pile.';
    }
  }
  if (e.move && cur) cur.movesLeft = (cur.movesLeft ?? 0) + e.move;
  if (e.jump && cur) cur.jump = true;
  if (e.cure) h.conds = h.conds.filter((c) => !NEGATIVE.includes(c));
  if (e.heal) healUnit(s, h, e.heal, h);
  if (back.length) {
    h.discard = h.discard.filter((c) => !back.includes(c));
    h.hand.push(...back);
    log(s, `${h.name} gets back ${back.map((c) => cardDef(c).name).join(' and ')}.`, 'hero');
  }
  if (e.shield) h.shield += e.shield;
  if (e.retaliate) {
    h.retaliate += e.retaliate;
    h.retRange = Math.max(h.retRange, 1);
  }
  for (const el of e.infuse ?? []) infuseEl(s, el, h);
  for (const c of e.self ?? []) giveCond(s, h, c);
  if (e.bless) addBless(s, h, h, e.bless);
  if (e.refresh) for (const o of h.items) if (o !== it && o.state === 'spent') o.state = 'ready';
  if (e.loot) {
    const got = s.pickups.filter((p) => !p.opened && hexDist(p.x, p.y, h.x, h.y) <= e.loot! && los(s.map, h.x, h.y, p.x, p.y));
    for (const p of got) takePickup(s, h, p);
    if (!got.length) log(s, `${h.name} finds nothing to loot.`, 'info');
  }
  // bonuses for the next attack
  if (e.atk) h.next.atk = (h.next.atk ?? 0) + e.atk;
  if (e.pierce) h.next.pierce = (h.next.pierce ?? 0) + e.pierce;
  if (e.push) h.next.push = (h.next.push ?? 0) + e.push;
  if (e.cond?.length) h.next.cond = [...(h.next.cond ?? []), ...e.cond];
  if (e.adv) h.next.adv = true;
  it.state = def.use === 'consumed' ? 'consumed' : 'spent';
  bump(h, 'items');
  if (e.shield) bump(h, 'shieldGiven', e.shield);
  s.undo = null;
  log(s, `${h.name} uses ${def.name}.`, 'hero');
  fx(s, { kind: 'text', uid: h.uid, text: def.name, color: '#ffd24a' });
  if (s.heroTurn?.cur) {
    // a move might have gained options again
    const cur = s.heroTurn.cur;
    const stp = cur.steps[cur.step];
    if (stp?.t === 'move' && cur.movesLeft === undefined) cur.movesLeft = stp.n;
  }
  return null;
}

/** What the acting hero needs to do now, for the UI. */
export function heroPrompt(s: CombatState): { uid: string; step?: Step; kind: 'choose' | 'step' | 'rest' | 'element'; els?: Elem[] } | null {
  const t = s.heroTurn;
  if (!t || !t.started || s.phase !== 'turns') return null;
  const h = hero(s, t.uid);
  if (!h) return null;
  if (h.longRest) return { uid: h.uid, kind: 'rest' };
  if (!t.cur) return { uid: h.uid, kind: 'choose' };
  if (t.cur.elAsk) return { uid: h.uid, kind: 'element', step: t.cur.steps[t.cur.step]!, els: t.cur.elAsk };
  return { uid: h.uid, kind: 'step', step: t.cur.steps[t.cur.step]! };
}

/** Before the first round starts, heroes can still choose where they start. */
export function placing(s: CombatState): boolean {
  return s.round === 1 && s.phase === 'select' && !!s.starts?.length;
}

/** The free start hexes a hero can move to before the first round. */
export function startOptions(s: CombatState): [number, number][] {
  if (!placing(s)) return [];
  return (s.starts ?? []).filter(([x, y]) => !unitAt(s, x, y));
}

/** A card as this hero has it: with their enhancement stickers applied. */
export function heroCard(h: Pick<HeroUnit, 'enh'>, id: string): Card {
  return enhancedCard(cardDef(id), h.enh?.[id]);
}

export { mustRest, canPlay, hasCond, cardDef };
