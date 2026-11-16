// The account's save: the union (characters), unlocked classes, campaign progress, stats and tasks. Scenario results
// are applied here. Pure functions over plain JSON so the server can store the profile as-is.
import { CLASS_CARDS, starterCards } from '../data/cards';
import { CLASSES, levelForXp, MAX_LEVEL } from '../data/classes';
import { ITEMS, smallSlots } from '../data/items';
import { DELVE_NAMES, DEPTHS, SCENARIOS, scenarioById, type ScenarioDef } from '../data/story';
import { TASKS, type StatKey } from '../data/tasks';
import type { HeroSetup } from './rules';
import type { CombatState, HeroUnit, Objective } from './types';

export interface Character {
  id: string;
  name: string;
  cls: string;
  xp: number;
  level: number;
  gold: number;
  /** every card this character can bring (level 1 cards + the level-up picks) */
  cards: string[];
  /** the cards chosen for the hand (hand size); empty = default */
  hand: string[];
  /** items owned */
  items: string[];
  /** indices into the class perk list */
  perks: number[];
  /** level-ups waiting for a card pick */
  pendingCards: number[];
  /** perks waiting to be chosen */
  pendingPerks: number;
  scenarios: number;
  created: number;
  retired?: boolean;
}

export interface Profile {
  v: number;
  name: string;
  characters: Character[];
  classes: string[];
  unlocked: string[];
  completed: string[];
  stats: Partial<Record<StatKey, number>>;
  tasksDone: string[];
  seenPremise: boolean;
  seenDepths: number[];
  /** gold waiting to be claimed from tasks */
  fund: number;
  ending?: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
}

export function newProfile(name: string): Profile {
  return {
    v: 1,
    name,
    characters: [],
    classes: Object.values(CLASSES)
      .filter((c) => c.start)
      .map((c) => c.id),
    unlocked: ['1a'],
    completed: [],
    stats: {},
    tasksDone: [],
    seenPremise: false,
    seenDepths: [],
    fund: 0,
    difficulty: 'normal',
  };
}

/** Fill in fields an older save is missing. */
export function upgradeProfile(p: Profile): Profile {
  const base = newProfile(p.name ?? 'Tenant');
  const out = { ...base, ...p };
  for (const c of out.characters) {
    c.hand ??= [];
    c.items ??= [];
    c.perks ??= [];
    c.pendingCards ??= [];
    c.pendingPerks ??= 0;
  }
  for (const id of base.classes) if (!out.classes.includes(id)) out.classes.push(id);
  return out;
}

export function makeCharacter(name: string, cls: string): Character {
  return {
    id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: name.trim().slice(0, 24) || CLASSES[cls]!.name,
    cls,
    xp: 0,
    level: 1,
    gold: 30,
    cards: starterCards(cls),
    hand: [],
    items: [],
    perks: [],
    pendingCards: [],
    pendingPerks: 0,
    scenarios: 0,
    created: Date.now(),
  };
}

export function maxHp(c: Character): number {
  const def = CLASSES[c.cls]!;
  let hp = def.hp[Math.min(MAX_LEVEL, c.level) - 1]!;
  if (c.items.includes('hardhat')) hp += 2;
  return hp;
}

/** The hand a character brings: their chosen cards, or the first N cards they own. */
export function handFor(c: Character): string[] {
  const size = CLASSES[c.cls]!.hand;
  const valid = c.hand.filter((id) => c.cards.includes(id));
  if (valid.length === size) return valid;
  const out = [...valid];
  // prefer the highest-level cards owned for the remaining slots
  const rest = [...c.cards].filter((id) => !out.includes(id)).sort((a, b) => cardLevel(b) - cardLevel(a));
  for (const id of rest) if (out.length < size) out.push(id);
  return out;
}

function cardLevel(id: string): number {
  for (const list of Object.values(CLASS_CARDS)) {
    const c = list.find((x) => x.id === id);
    if (c) return c.level;
  }
  return 1;
}

/** Items a character brings: one per slot (two hands, small slots by level). */
export function loadout(c: Character): string[] {
  const out: string[] = [];
  const count: Record<string, number> = {};
  const cap: Record<string, number> = { head: 1, body: 1, legs: 1, hand: 2, small: smallSlots(c.level) };
  for (const id of c.items) {
    const it = ITEMS[id];
    if (!it) continue;
    if ((count[it.slot] ?? 0) >= cap[it.slot]!) continue;
    count[it.slot] = (count[it.slot] ?? 0) + 1;
    out.push(id);
  }
  return out;
}

export function heroSetup(c: Character, owner: string): HeroSetup {
  const def = CLASSES[c.cls]!;
  return {
    owner,
    charId: c.id,
    name: c.name,
    cls: c.cls,
    level: c.level,
    maxHp: maxHp(c),
    cards: handFor(c),
    items: loadout(c),
    perks: c.perks.map((i) => def.perks[i]?.[1]).filter((x): x is string => !!x),
  };
}

/** Cards offered at a level-up: every card of that level or lower not owned yet. */
export function levelUpOptions(c: Character, level: number): string[] {
  return (CLASS_CARDS[c.cls] ?? []).filter((x) => x.level <= level && x.level > 1 && !c.cards.includes(x.id)).map((x) => x.id);
}

export function chooseLevelCard(c: Character, cardId: string): boolean {
  const lvl = c.pendingCards[0];
  if (lvl === undefined || !levelUpOptions(c, lvl).includes(cardId)) return false;
  c.cards.push(cardId);
  c.pendingCards.shift();
  return true;
}

export function choosePerk(c: Character, idx: number): boolean {
  const def = CLASSES[c.cls]!;
  if (c.pendingPerks <= 0 || idx < 0 || idx >= def.perks.length) return false;
  // each perk can be taken as many times as it is listed (duplicates are separate entries)
  if (c.perks.includes(idx)) return false;
  c.perks.push(idx);
  c.pendingPerks--;
  return true;
}

/** Scenario level: half the party's average level, rounded up, plus depth and difficulty. */
export function scenarioLevel(levels: number[], depth: number, difficulty: Profile['difficulty']): number {
  const avg = levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length);
  const d = difficulty === 'easy' ? -1 : difficulty === 'hard' ? 1 : 0;
  return Math.max(0, Math.min(7, Math.ceil(avg / 2) + Math.floor((depth - 1) / 3) + d));
}

export function deepest(p: Profile): number {
  let d = 1;
  for (const id of p.unlocked) d = Math.max(d, scenarioById(id)?.depth ?? 1);
  return d;
}

/** A random side scenario at any Depth already reached. */
export function makeDelve(p: Profile, seed: number): ScenarioDef {
  const r = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const depth = 1 + r(deepest(p));
  const objectives: Objective[] = [{ kind: 'clear' }, { kind: 'clear' }, { kind: 'escape' }, { kind: 'survive', rounds: 5 }];
  const objective = objectives[r(objectives.length)]!;
  const zone = DEPTHS[depth - 1]!.zone;
  return {
    id: `delve-${seed}`,
    name: `${DELVE_NAMES[r(DELVE_NAMES.length)]}: ${DEPTHS[depth - 1]!.name}`,
    depth,
    zone,
    rooms: objective.kind === 'survive' ? 2 : 2 + r(2),
    objective,
    intro: ['The tide has gone out a little further than usual. Things are showing that should not be.', 'A quick dive for gold and practice. Probably quick.'],
    outro: ['The union hauls its finds back up to the boiler room. Gary takes a look. Gary makes an offer. It is insulting.'],
    unlocks: [],
    gold: 8 + depth * 3,
    mix: 0.45,
  };
}

export interface HeroResult {
  charId: string;
  name: string;
  xpGained: number;
  goldGained: number;
  levelUps: number;
  items: string[];
}

export interface Outcome {
  won: boolean;
  heroes: HeroResult[];
  tasks: string[];
  classes: string[];
  newScenarios: string[];
  ending: boolean;
}

function bump(p: Profile, k: StatKey, n: number): void {
  if (n) p.stats[k] = (p.stats[k] ?? 0) + n;
}

/**
 * Apply a finished fight to this account's profile. `owner` is this account's player id: only its own heroes gain
 * XP and gold here (co-op partners apply the same state to their own profiles). `campaign` is false when the
 * scenario is not this account's to complete (a guest helping on a scenario they have not unlocked yet).
 */
export function applyResult(p: Profile, s: CombatState, owner: string, sc: ScenarioDef, campaign: boolean): Outcome {
  const won = s.phase === 'won';
  const out: Outcome = { won, heroes: [], tasks: [], classes: [], newScenarios: [], ending: false };
  const mine = s.units.filter((u): u is HeroUnit => u.kind === 'hero' && u.owner === owner);
  for (const h of mine) {
    const c = p.characters.find((x) => x.id === h.charId);
    if (!c) continue;
    const bonus = won ? 4 + 2 * s.scenario.level : 0;
    const xpGained = h.xp + bonus;
    const scGold = won ? Math.round(sc.gold * (1 + s.scenario.level * 0.25)) : 0;
    const goldGained = h.gold + scGold;
    const before = c.level;
    c.xp += xpGained;
    c.gold += goldGained;
    c.scenarios++;
    const after = levelForXp(c.xp);
    for (let l = before + 1; l <= after; l++) {
      c.pendingCards.push(l);
      c.pendingPerks++;
    }
    c.level = after;
    const found = ((h as HeroUnit & { found?: string[] }).found ?? []).filter((id) => !c.items.includes(id));
    c.items.push(...found);
    out.heroes.push({ charId: c.id, name: c.name, xpGained, goldGained, levelUps: after - before, items: found });
    bump(p, 'kills', h.stats.kills);
    bump(p, 'heals', h.stats.heals);
    bump(p, 'infusions', h.stats.infusions);
    bump(p, 'rangedKills', h.stats.rangedKills);
    bump(p, 'elitesKilled', h.stats.elitesKilled);
    bump(p, 'undeadKills', (h.stats as Record<string, number>).undead ?? 0);
    bump(p, 'damage', h.stats.dmg);
    bump(p, 'cardsLost', h.stats.lost);
    bump(p, 'goldEarned', goldGained);
    if ((h.stats as Record<string, number>).exhausted || (h.exhausted && !h.escaped)) bump(p, 'exhaustions', 1);
    if (won && !h.exhausted && h.hp <= 3) bump(p, 'lowHpWins', 1);
  }
  if (won) {
    bump(p, 'scenariosWon', 1);
    if (sc.objective.kind === 'boss') bump(p, 'bossesKilled', 1);
    if (sc.id.startsWith('delve')) bump(p, 'delvesWon', 1);
    if (campaign && !sc.id.startsWith('delve')) {
      if (!p.completed.includes(sc.id)) p.completed.push(sc.id);
      for (const u of sc.unlocks)
        if (!p.unlocked.includes(u)) {
          p.unlocked.push(u);
          out.newScenarios.push(u);
        }
      if (sc.id === '9c') {
        p.ending = true;
        out.ending = true;
      }
    }
    p.stats.deepest = Math.max(p.stats.deepest ?? 1, deepest(p));
  }
  const t = checkTasks(p);
  out.tasks = t.tasks;
  out.classes = t.classes;
  return out;
}

export function taskProgress(p: Profile, id: string): { have: number; goal: number; done: boolean } {
  const t = TASKS.find((x) => x.id === id)!;
  const have = p.stats[t.stat] ?? (t.stat === 'deepest' ? 1 : 0);
  return { have: Math.min(have, t.goal), goal: t.goal, done: p.tasksDone.includes(id) };
}

/** Complete any task whose goal is met: unlock its class, add its gold to the union fund. */
export function checkTasks(p: Profile): { tasks: string[]; classes: string[] } {
  const tasks: string[] = [];
  const classes: string[] = [];
  for (const t of TASKS) {
    if (p.tasksDone.includes(t.id)) continue;
    const have = p.stats[t.stat] ?? (t.stat === 'deepest' ? 1 : 0);
    if (have < t.goal) continue;
    p.tasksDone.push(t.id);
    tasks.push(t.id);
    if (t.cls && !p.classes.includes(t.cls)) {
      p.classes.push(t.cls);
      classes.push(t.cls);
    }
    if (t.gold) p.fund += t.gold;
  }
  return { tasks, classes };
}

export function scenarioList(p: Profile): { sc: ScenarioDef; done: boolean; open: boolean }[] {
  return SCENARIOS.map((sc) => ({ sc, done: p.completed.includes(sc.id), open: p.unlocked.includes(sc.id) }));
}

export function buyItem(c: Character, id: string): string | null {
  const it = ITEMS[id];
  if (!it) return 'No such item.';
  if (c.items.includes(id)) return 'Already owned.';
  if (c.gold < it.cost) return 'Not enough gold.';
  c.gold -= it.cost;
  c.items.push(id);
  return null;
}

export function sellItem(c: Character, id: string): string | null {
  const it = ITEMS[id];
  if (!it || !c.items.includes(id)) return 'Not owned.';
  c.items = c.items.filter((x) => x !== id);
  c.gold += Math.floor(it.cost / 2);
  return null;
}
