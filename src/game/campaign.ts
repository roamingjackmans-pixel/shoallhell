// The account's save: the union (characters), unlocked classes, campaign progress, stats and tasks. Scenario results
// are applied here. Pure functions over plain JSON so the server can store the profile as-is.
import { card as cardById, CLASS_CARDS, starterCards } from '../data/cards';
import { CLASSES, levelForXp, MAX_LEVEL } from '../data/classes';
import { ITEMS, smallSlots } from '../data/items';
import { DELVE_NAMES, DEPTHS, SCENARIOS, scenarioById, type ScenarioDef } from '../data/story';
import { TASKS, type StatKey } from '../data/tasks';
import { enhBlocked, enhCost, type Enh, type EnhKind, type EnhMap } from './enhance';
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
  /** the owned items worn or carried into scenarios (within slotCaps) */
  equipped?: string[];
  /** indices into the class perk list */
  perks: number[];
  /** level-ups waiting for a card pick */
  pendingCards: number[];
  /** perks waiting to be chosen */
  pendingPerks: number;
  scenarios: number;
  created: number;
  retired?: boolean;
  /** enhancement stickers bought at the Enhancer, by card id */
  enh?: EnhMap;
  /** Bless cards waiting for the next scenario (from donations at the Boiler) */
  blessed?: number;
}

/** One campaign: its own union of characters and its own way down through the Depths. */
export interface Campaign {
  id: string;
  name: string;
  created: number;
  characters: Character[];
  unlocked: string[];
  completed: string[];
  seenDepths: number[];
  /** gold waiting to be claimed from tasks */
  fund: number;
  /** gold given to the Boiler in this campaign: every 100 raises prosperity */
  donated?: number;
  ending?: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
}

/**
 * The account. Unlocked classes, Tasks and records belong to the account (they carry across every campaign); each
 * campaign keeps its own characters and progress. `active` is the campaign the hall is showing.
 */
export interface Profile {
  v: number;
  name: string;
  classes: string[];
  stats: Partial<Record<StatKey, number>>;
  tasksDone: string[];
  seenPremise: boolean;
  campaigns: Campaign[];
  active: string;
}

export const MAX_CAMPAIGNS = 8;

export function newCampaign(name: string): Campaign {
  return {
    id: `k${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: name.trim().slice(0, 32) || 'The Tenants’ Union',
    created: Date.now(),
    characters: [],
    unlocked: ['1a'],
    completed: [],
    seenDepths: [],
    fund: 0,
    donated: 0,
    difficulty: 'normal',
  };
}

export function newProfile(name: string): Profile {
  const first = newCampaign('The Tenants’ Union');
  return {
    v: 2,
    name,
    classes: Object.values(CLASSES)
      .filter((c) => c.start)
      .map((c) => c.id),
    stats: {},
    tasksDone: [],
    seenPremise: false,
    campaigns: [first],
    active: first.id,
  };
}

/** The campaign the hall is showing (making one if somehow there is none). */
export function camp(p: Profile): Campaign {
  let c = p.campaigns.find((x) => x.id === p.active) ?? p.campaigns[0];
  if (!c) {
    c = newCampaign('The Tenants’ Union');
    p.campaigns.push(c);
  }
  p.active = c.id;
  return c;
}

/** Find a character in any of the account's campaigns. */
export function findCharacter(p: Profile, id: string): Character | undefined {
  for (const c of p.campaigns) {
    const ch = c.characters.find((x) => x.id === id);
    if (ch) return ch;
  }
  return undefined;
}

/** Fill in fields an older save is missing; a version-1 save (one campaign) becomes the first campaign. */
export function upgradeProfile(raw: Profile): Profile {
  const old = raw as Profile & Partial<Campaign> & { characters?: Character[] };
  const base = newProfile(old.name ?? 'Tenant');
  const out: Profile = {
    v: 2,
    name: old.name ?? base.name,
    classes: Array.isArray(old.classes) ? old.classes : base.classes,
    stats: old.stats ?? {},
    tasksDone: old.tasksDone ?? [],
    seenPremise: !!old.seenPremise,
    campaigns: Array.isArray(old.campaigns) ? old.campaigns : [],
    active: old.active ?? '',
  };
  if (!out.campaigns.length) {
    // version 1: everything lived on the profile itself
    const c = newCampaign('The Tenants’ Union');
    c.characters = old.characters ?? [];
    c.unlocked = old.unlocked ?? c.unlocked;
    c.completed = old.completed ?? [];
    c.seenDepths = old.seenDepths ?? [];
    c.fund = old.fund ?? 0;
    if (old.ending) c.ending = true;
    c.difficulty = old.difficulty ?? 'normal';
    out.campaigns.push(c);
    out.active = c.id;
  }
  for (const k of out.campaigns) {
    const fresh = newCampaign(k.name);
    Object.assign(k, { ...fresh, ...k });
    for (const c of k.characters) {
      c.hand ??= [];
      c.items ??= [];
      c.perks ??= [];
      c.pendingCards ??= [];
      c.pendingPerks ??= 0;
      c.enh ??= {};
      c.blessed ??= 0;
      // level-1 cards added to a class since the character was made join their pool
      c.cards ??= [];
      for (const id of starterCards(c.cls)) if (!c.cards.includes(id)) c.cards.push(id);
      // older saves carried everything that fit: start them equipped the same way
      if (!Array.isArray(c.equipped)) {
        c.equipped = [];
        for (const id of c.items) autoEquip(c, id);
      }
    }
  }
  for (const id of base.classes) if (!out.classes.includes(id)) out.classes.push(id);
  camp(out);
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
    equipped: [],
    enh: {},
    blessed: 0,
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
  // worn items that raise maximum HP (Hard Hat, jumpers, helmets)
  for (const id of loadout(c)) hp += ITEMS[id]?.fx.maxHp ?? 0;
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
export type Slot = 'head' | 'body' | 'legs' | 'hand' | 'small';
export const SLOT_NAMES: Record<Slot, string> = { head: 'Helmet', body: 'Chest', legs: 'Shoes', hand: 'Hands', small: 'Potions & utility' };

/**
 * How many items of each kind a hero can carry: one helmet, one chest, one pair of shoes, two hand items (one if the
 * class fights with a two-handed weapon), and potions/utility items up to half their level, rounded up.
 */
export function slotCaps(c: Character): Record<Slot, number> {
  return { head: 1, body: 1, legs: 1, hand: CLASSES[c.cls]?.twoHanded ? 1 : 2, small: smallSlots(c.level) };
}

/** Items equipped per slot right now. */
export function slotUse(c: Character): Record<Slot, number> {
  const use: Record<Slot, number> = { head: 0, body: 0, legs: 0, hand: 0, small: 0 };
  for (const id of loadout(c)) {
    const it = ITEMS[id];
    if (it) use[it.slot]++;
  }
  return use;
}

/** The items a hero brings into a scenario: what they equipped, within their slot limits. */
export function loadout(c: Character): string[] {
  const out: string[] = [];
  const count: Partial<Record<Slot, number>> = {};
  const cap = slotCaps(c);
  for (const id of c.equipped ?? []) {
    const it = ITEMS[id];
    if (!it || !c.items.includes(id) || out.includes(id)) continue;
    if ((count[it.slot] ?? 0) >= cap[it.slot]) continue;
    count[it.slot] = (count[it.slot] ?? 0) + 1;
    out.push(id);
  }
  return out;
}

/** Equip an owned item if its slot has room. Returns an error message, or null. */
export function equipItem(c: Character, id: string): string | null {
  const it = ITEMS[id];
  if (!it || !c.items.includes(id)) return 'You do not own that.';
  c.equipped = loadout(c);
  if (c.equipped.includes(id)) return null;
  const cap = slotCaps(c)[it.slot];
  if (slotUse(c)[it.slot] >= cap) {
    if (it.slot === 'small') return `You can carry ${cap} potion/utility item${cap === 1 ? '' : 's'} at level ${c.level} (half your level, rounded up). Unequip one first.`;
    if (it.slot === 'hand') return cap === 1 ? 'A two-handed weapon leaves one hand free. Unequip your hand item first.' : 'Both hands are full. Unequip a hand item first.';
    return `You already wear ${SLOT_NAMES[it.slot].toLowerCase()}. Unequip it first.`;
  }
  c.equipped.push(id);
  return null;
}

export function unequipItem(c: Character, id: string): void {
  c.equipped = loadout(c).filter((x) => x !== id);
}

/**
 * Equip from the bag like Dungeon Joe: into a free slot of its kind, or swapping out what is in that slot (`replace`
 * names which equipped item to swap; the first one of that kind otherwise). Returns the item taken off, if any.
 */
export function equipSwap(c: Character, id: string, replace?: string): string | null {
  const it = ITEMS[id];
  if (!it || !c.items.includes(id)) return null;
  c.equipped = loadout(c);
  if (c.equipped.includes(id)) return null;
  let off: string | null = null;
  if (slotUse(c)[it.slot] >= slotCaps(c)[it.slot]) {
    off = replace && ITEMS[replace]?.slot === it.slot && c.equipped.includes(replace) ? replace : c.equipped.find((x) => ITEMS[x]?.slot === it.slot) ?? null;
    if (!off) return null;
    c.equipped = c.equipped.filter((x) => x !== off);
  }
  c.equipped.push(id);
  return off;
}

/** Put a newly gained item on if there is room (bought from Gary, found in a chest). */
export function autoEquip(c: Character, id: string): void {
  equipItem(c, id);
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
    enh: c.enh ?? {},
    bless: c.blessed ?? 0,
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
export function scenarioLevel(levels: number[], depth: number, difficulty: Campaign['difficulty']): number {
  const avg = levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length);
  const d = difficulty === 'easy' ? -1 : difficulty === 'hard' ? 1 : 0;
  return Math.max(0, Math.min(7, Math.ceil(avg / 2) + Math.floor((depth - 1) / 3) + d));
}

export function deepest(k: Campaign): number {
  let d = 1;
  for (const id of k.unlocked) d = Math.max(d, scenarioById(id)?.depth ?? 1);
  return d;
}

/** A random side scenario at any Depth this campaign has reached. */
export function makeDelve(k: Campaign, seed: number): ScenarioDef {
  const r = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const depth = 1 + r(deepest(k));
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
 * XP and gold here (co-op partners apply the same state to their own profiles). Progress goes to the campaign the
 * heroes belong to; a co-op guest (`asGuest`) only gets it when their campaign has that scenario open too.
 */
export function applyResult(p: Profile, s: CombatState, owner: string, sc: ScenarioDef, asGuest: boolean): Outcome {
  const won = s.phase === 'won';
  const out: Outcome = { won, heroes: [], tasks: [], classes: [], newScenarios: [], ending: false };
  const mine = s.units.filter((u): u is HeroUnit => u.kind === 'hero' && u.owner === owner);
  const k = p.campaigns.find((x) => mine.some((h) => x.characters.some((c) => c.id === h.charId))) ?? camp(p);
  const campaign = !asGuest || k.unlocked.includes(sc.id);
  for (const h of mine) {
    const c = findCharacter(p, h.charId);
    if (!c) continue;
    const bonus = won ? 4 + 2 * s.scenario.level : 0;
    const xpGained = h.xp + bonus;
    const scGold = won ? Math.round(sc.gold * (1 + s.scenario.level * 0.25)) : 0;
    const goldGained = h.gold + scGold;
    const before = c.level;
    c.xp += xpGained;
    c.gold += goldGained;
    c.scenarios++;
    c.blessed = 0; // the Boiler's blessing lasts one scenario
    const after = levelForXp(c.xp);
    for (let l = before + 1; l <= after; l++) {
      c.pendingCards.push(l);
      c.pendingPerks++;
    }
    c.level = after;
    const found = ((h as HeroUnit & { found?: string[] }).found ?? []).filter((id) => !c.items.includes(id));
    c.items.push(...found);
    for (const id of found) autoEquip(c, id);
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
      if (!k.completed.includes(sc.id)) k.completed.push(sc.id);
      for (const u of sc.unlocks)
        if (!k.unlocked.includes(u)) {
          k.unlocked.push(u);
          out.newScenarios.push(u);
        }
      if (sc.id === '9c') {
        k.ending = true;
        out.ending = true;
      }
    }
    p.stats.deepest = Math.max(p.stats.deepest ?? 1, deepest(k));
  }
  const t = checkTasks(p, k);
  out.tasks = t.tasks;
  out.classes = t.classes;
  return out;
}

export function taskProgress(p: Profile, id: string): { have: number; goal: number; done: boolean } {
  const t = TASKS.find((x) => x.id === id)!;
  const have = p.stats[t.stat] ?? (t.stat === 'deepest' ? 1 : 0);
  return { have: Math.min(have, t.goal), goal: t.goal, done: p.tasksDone.includes(id) };
}

/** Complete any task whose goal is met: unlock its class (for every campaign), add its gold to a campaign's fund. */
export function checkTasks(p: Profile, k: Campaign = camp(p)): { tasks: string[]; classes: string[] } {
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
    if (t.gold) k.fund += t.gold;
  }
  return { tasks, classes };
}

export function scenarioList(k: Campaign): { sc: ScenarioDef; done: boolean; open: boolean }[] {
  return SCENARIOS.map((sc) => ({ sc, done: k.completed.includes(sc.id), open: k.unlocked.includes(sc.id) }));
}

export function buyItem(c: Character, id: string): string | null {
  const it = ITEMS[id];
  if (!it) return 'No such item.';
  if (c.items.includes(id)) return 'Already owned.';
  if (c.gold < it.cost) return 'Not enough gold.';
  c.gold -= it.cost;
  c.items.push(id);
  autoEquip(c, id);
  return null;
}

export function sellItem(c: Character, id: string): string | null {
  const it = ITEMS[id];
  if (!it || !c.items.includes(id)) return 'Not owned.';
  c.items = c.items.filter((x) => x !== id);
  c.equipped = (c.equipped ?? []).filter((x) => x !== id);
  c.gold += Math.floor(it.cost / 2);
  return null;
}

// ------------------------------------------------------------------ the Enhancer and the Boiler

/** Buy an enhancement sticker for one of this character's cards. Returns an error, or null when bought. */
export function enhanceCard(c: Character, cardId: string, half: 'top' | 'bot', step: number, kind: EnhKind): string | null {
  if (!c.cards.includes(cardId)) return 'Not one of their cards.';
  const cd = cardById(cardId);
  if (!cd) return 'No such card.';
  c.enh ??= {};
  const have: Enh[] = c.enh[cardId] ?? [];
  const why = enhBlocked(cd, half, step, kind, have);
  if (why) return why;
  const cost = enhCost(cd, half, step, kind, have);
  if (c.gold < cost) return 'Not enough gold.';
  c.gold -= cost;
  c.enh[cardId] = [...have, { half, step, kind }];
  return null;
}

export const DONATION = 10;
export const DONATION_BLESS = 2;
export const PROSPERITY_STEP = 100;

/** Prosperity: 1 + one level per 100 gold donated in this campaign. */
export function prosperity(k: Campaign): number {
  return 1 + Math.floor((k.donated ?? 0) / PROSPERITY_STEP);
}

/** The deepest Depth Gary stocks for: how far down the campaign has been, or its prosperity if higher. */
export function shopDepth(k: Campaign): number {
  return Math.max(deepest(k), prosperity(k));
}

/** Donate to the Boiler: 10 gold for 2 Bless cards in the next scenario (one blessing at a time). */
export function donate(k: Campaign, c: Character): string | null {
  if ((c.blessed ?? 0) > 0) return 'Already blessed for the next scenario.';
  if (c.gold < DONATION) return 'Not enough gold.';
  c.gold -= DONATION;
  c.blessed = DONATION_BLESS;
  k.donated = (k.donated ?? 0) + DONATION;
  return null;
}
