// Core types for Shoallhell: cards, actions, units, scenarios and the combat state.
// The whole CombatState is plain JSON (no Maps/Sets/classes) so the co-op host can send it to guests as-is.
import type { DamageType } from '../draw/dtypes';
export type { DamageType };
import type { EnhMap } from './enhance';

/** The four infusable elements: Dungeon Joe's damage types minus Physical. */
export type Elem = 'fire' | 'magic' | 'void' | 'holy';
export const ELEMS: readonly Elem[] = ['fire', 'magic', 'void', 'holy'];

/** Negative conditions go on enemies (or heroes hit by enemies); positive ones are buffs. */
export type Cond = 'poison' | 'wound' | 'immobilize' | 'disarm' | 'stun' | 'muddle' | 'strengthen' | 'invisible' | 'regenerate';
export const NEGATIVE: readonly Cond[] = ['poison', 'wound', 'immobilize', 'disarm', 'stun', 'muddle'];
export const POSITIVE: readonly Cond[] = ['strengthen', 'invisible', 'regenerate'];

/** Area shapes, relative to the attacker (melee shapes) or to a chosen tile (blast). */
export type Aoe = 'cleave' | 'line2' | 'line3' | 'cone' | 'ring' | 'blast' | 'cross';

/** A bonus for spending an element when the step is performed. */
export interface Consume {
  el: Elem | 'any';
  n?: number;
  range?: number;
  targets?: number;
  cond?: Cond[];
  heal?: number;
  pierce?: number;
  push?: number;
  xp?: number;
  shield?: number;
  /** text shown on the card */
  text?: string;
}

/** Enhancement stickers on an ability line (labels shown on the card); an infuse step added by a sticker says so. */
export interface StepStickers {
  stickers?: string[];
  sticker?: boolean;
}

export type Step = StepStickers & StepBase;
export type StepBase =
  | { t: 'move'; n: number; jump?: boolean }
  | {
      t: 'attack';
      n: number;
      /** 0 = melee (adjacent, diagonals count) */
      range: number;
      targets?: number;
      aoe?: Aoe;
      pierce?: number;
      push?: number;
      pull?: number;
      cond?: Cond[];
      type?: DamageType;
      /** the attacker gains this many XP if the attack hits anything */
      xp?: number;
      /** also heals the attacker for this much */
      drain?: number;
      /** adds to the attack +1 per enemy adjacent to the target (pack tactics) etc. — free text on the card */
      note?: string;
      use?: Consume;
      /** damage the attacker takes (berserker) */
      selfDmg?: number;
      /** hits every enemy in range (the DJ "blue" area attacks, used by monsters and a few cards) */
      all?: boolean;
    }
  | { t: 'heal'; n: number; range: number; self?: boolean; all?: boolean; cond?: Cond[]; use?: Consume; xp?: number }
  | { t: 'shield'; n: number; range?: number; all?: boolean; use?: Consume; xp?: number }
  | { t: 'retaliate'; n: number; range?: number; use?: Consume; xp?: number }
  | { t: 'buff'; cond: Cond[]; range?: number; self?: boolean; all?: boolean; xp?: number; use?: Consume }
  | { t: 'loot'; n: number; xp?: number }
  | { t: 'infuse'; el: Elem }
  | { t: 'summon'; id: string; xp?: number }
  | { t: 'recover'; n: number; xp?: number }
  | { t: 'bless'; n: number; range?: number; xp?: number }
  | { t: 'curse'; n: number; range: number; xp?: number }
  | { t: 'teleport'; n: number; xp?: number }
  | { t: 'xp'; n: number };

/** A lasting effect: the card sits in the active area until its uses run out. uses 0 = rest of the scenario. */
export interface Persist {
  kind: 'shield' | 'retaliate' | 'atk' | 'move' | 'drain' | 'cond';
  n: number;
  uses: number;
  cond?: Cond;
  text: string;
}

export interface Half {
  steps: Step[];
  /** the card is lost (out for the scenario) once this half is played */
  lost?: boolean;
  persist?: Persist;
  /** when set, the half is only an XP gain (no XP per step) */
  xp?: number;
}

export interface Card {
  id: string;
  cls: string;
  name: string;
  level: number;
  init: number;
  top: Half;
  bot: Half;
  /** short flavour line */
  flavor?: string;
}

// ------------------------------------------------------------------ attack modifiers

export interface Mod {
  /** numeric change; ignored when mult is set */
  v: number;
  /** 'x2' or 'null' */
  mult?: 'x2' | 'null';
  cond?: Cond;
  infuse?: Elem;
  /** rolling: draw again and add */
  roll?: boolean;
  /** bless/curse cards are removed once drawn */
  temp?: 'bless' | 'curse';
  push?: number;
  pierce?: number;
  heal?: number;
  shield?: number;
}

// ------------------------------------------------------------------ monsters

export type Role = 'fodder' | 'ranged' | 'swarm' | 'brute' | 'caster' | 'tank' | 'assassin' | 'hazard' | 'support' | 'boss';

export interface MonsterStat {
  hp: number;
  move: number;
  atk: number;
  range: number;
  shield?: number;
  retaliate?: number;
  /** conditions this unit's attacks always apply */
  cond?: Cond[];
  pierceAll?: boolean;
}

export interface MonsterAbility {
  name: string;
  init: number;
  /** move delta from the stat line (null = no move) */
  move: number | null;
  /** attack delta from the stat line (null = no attack) */
  atk: number | null;
  range?: number;
  targets?: number;
  /** DJ "red": cannot be blocked (ignores shield) */
  red?: boolean;
  /** DJ "blue": hits every hero within range */
  blue?: boolean;
  cond?: Cond[];
  heal?: { n: number; range: number };
  shield?: number;
  retaliate?: number;
  summon?: string;
  infuse?: Elem;
  push?: number;
  pull?: number;
  /** the attack's damage type (for the weakness chart) */
  type?: DamageType;
  /** the boss (or any monster) teleports next to its focus */
  jump?: boolean;
  text?: string;
}

export interface MonsterDef {
  id: string;
  name: string;
  zone: number;
  role: Role;
  draw: string;
  radius: number;
  elem: DamageType;
  flavor: string;
  /** stat line at scenario level 0, normal */
  base: MonsterStat;
  abilities: MonsterAbility[];
  /** spawns this many pieces per placement (swarms) */
  pieces?: number;
  flying?: boolean;
  undead?: boolean;
  boss?: boolean;
  /** conditions this monster ignores */
  immune?: Cond[];
}

// ------------------------------------------------------------------ map

/**
 * Tile codes: ' ' outside, '#' wall, '.' floor, 'o' obstacle (prop, blocks movement, not sight), '~' hazard
 * (1 damage on entering… the zone's lava, thorns, spores…), ',' difficult terrain (costs 2), 'D' closed door,
 * 'd' open door, 'X' exit, 'T' trap (damage 2 + condition, then removed).
 */
export interface MapData {
  w: number;
  h: number;
  tiles: string[];
  /** room index per tile, -1 for walls/outside */
  room: number[];
  rooms: RoomInfo[];
  zone: number;
}

export interface RoomInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  revealed: boolean;
  zone: number;
  /** monsters placed here when the room is revealed */
  spawns: Spawn[];
}

export interface Spawn {
  monster: string;
  x: number;
  y: number;
  elite: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  kind: 'coin' | 'chest';
  /** chest contents */
  gold?: number;
  item?: string;
  opened?: boolean;
}

// ------------------------------------------------------------------ units

export interface UnitBase {
  uid: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  conds: Cond[];
  /** conditions applied this turn that should not tick yet */
  fresh: Cond[];
  shield: number;
  retaliate: number;
  retRange: number;
  dead?: boolean;
  /** last facing angle for drawing */
  facing: number;
}

export interface HeroUnit extends UnitBase {
  kind: 'hero';
  /** the account/socket that controls this hero */
  owner: string;
  charId: string;
  name: string;
  cls: string;
  level: number;
  hand: string[];
  discard: string[];
  lost: string[];
  active: ActiveCard[];
  /** the two cards picked for this round, lead first */
  picked: string[];
  longRest: boolean;
  init: number;
  exhausted: boolean;
  xp: number;
  gold: number;
  mods: Mod[];
  modDiscard: Mod[];
  items: { id: string; state: 'ready' | 'spent' | 'consumed' }[];
  /** one-shot bonuses from items (poison dagger, crowbar, spoon) */
  next: { atk?: number; pierce?: number; push?: number; cond?: Cond[]; adv?: boolean; move?: number; jump?: boolean };
  /** short rest already taken this round */
  shortRested: boolean;
  /** a short rest in progress: the card it will lose, and whether the 1 HP reroll is still on offer */
  restDraw?: { card: string } | null;
  /** enhancement stickers on this hero's cards, by card id */
  enh?: EnhMap;
  ready: boolean;
  escaped?: boolean;
  stats: HeroStats;
}

/**
 * What a hero did in this scenario (shown on the stats page). The named ones always exist; the rest are added as they
 * happen (see bump() in rules.ts), so older saved fights still load.
 */
export interface HeroStats {
  dmg: number;
  kills: number;
  heals: number;
  infusions: number;
  rangedKills: number;
  elitesKilled: number;
  lost: number;
  [k: string]: number;
}

export interface ActiveCard {
  card: string;
  half: 'top' | 'bot';
  persist: Persist;
  left: number;
}

export interface MonsterUnit extends UnitBase {
  kind: 'monster';
  monster: string;
  elite: boolean;
  num: number;
  stat: MonsterStat;
  /** spawned this round (acts next round) */
  summoned?: boolean;
}

export interface SummonUnit extends UnitBase {
  kind: 'summon';
  summon: string;
  owner: string;
  heroUid: string;
  stat: MonsterStat;
  summoned?: boolean;
}

export type Unit = HeroUnit | MonsterUnit | SummonUnit;

export interface SummonDef {
  id: string;
  name: string;
  draw: string;
  radius: number;
  hp: number;
  move: number;
  atk: number;
  range: number;
  cond?: Cond[];
  shield?: number;
  /** heals the most hurt ally within 2 each turn (itself when no ally needs it) */
  healer?: number;
}

// ------------------------------------------------------------------ the fight

export type Phase = 'select' | 'turns' | 'won' | 'lost';

export interface TurnSlot {
  /** hero uid, monster type id, or summon uid */
  who: string;
  kind: 'hero' | 'monster' | 'summon';
  init: number;
  done: boolean;
}

/** What the acting hero is in the middle of doing. */
export interface HeroTurn {
  uid: string;
  /** halves already played this turn */
  used: { card: string; half: 'top' | 'bot'; basic: boolean }[];
  /** the half being played and the index of the step it is on */
  cur: null | { card: string; half: 'top' | 'bot'; basic: boolean; step: number; steps: Step[]; movesLeft?: number; jump?: boolean; targetsHit: string[]; anyHit: boolean; stepReady: boolean;
    /** the step can spend one of these elements for its bonus: waiting for the player to say yes (which) or no */
    elAsk?: Elem[];
    /** the player's answer for the current step: the element to spend, or null to keep it */
    elChoice?: Elem | null;
  };
  /** turn-start effects already applied */
  started: boolean;
}

export interface LogLine {
  t: string;
  /** running number of the line in this fight (the log keeps only the newest lines, so its length stops changing) */
  n?: number;
  kind?: 'hero' | 'monster' | 'info' | 'dmg' | 'heal' | 'good' | 'bad';
}

/** A visual event the renderer animates (floating numbers, swings, deaths). */
export interface Fx {
  id: number;
  kind: 'dmg' | 'heal' | 'shield' | 'miss' | 'cond' | 'swing' | 'shot' | 'death' | 'text' | 'move' | 'infuse' | 'loot' | 'calc';
  uid?: string;
  to?: string;
  x?: number;
  y?: number;
  text?: string;
  color?: string;
  el?: string;
  path?: [number, number][];
}

/** A lethal hit a hero may avoid by losing cards (Gloomhaven-style damage negation). */
export interface Pending {
  kind: 'negate';
  heroUid: string;
  dmg: number;
  cond: Cond[];
  push: number;
  pull: number;
  fromUid: string;
  by: string;
}

export interface ScenarioRun {
  id: string;
  name: string;
  objective: Objective;
  level: number;
  seed: number;
  depth: number;
  /** the campaign's difficulty: Normal monsters have 15% less HP, Hardcore 30% more (older fights: unchanged) */
  difficulty?: Difficulty;
}

export type Difficulty = 'normal' | 'hardcore';

/** Monster HP multiplier for each difficulty. */
export const DIFFICULTY_HP: Record<Difficulty, number> = { normal: 0.85, hardcore: 1.3 };

export type Objective =
  | { kind: 'clear' }
  | { kind: 'boss'; boss: string }
  | { kind: 'escape' }
  | { kind: 'survive'; rounds: number }
  | { kind: 'destroy'; monster: string; count: number };

/**
 * Rule changes for a whole fight, used by FlashGames modifiers (src/flash/). Plain JSON; normal play has none, and
 * every field left out means the normal rule.
 */
export interface HouseRules {
  /** every monster that appears is an Elite (bosses excepted) */
  allElite?: boolean;
  /** monster maximum HP multiplier (bosses too) */
  monsterHp?: number;
  /** extra boss maximum HP multiplier */
  bossHp?: number;
  /** Retaliate every monster has on top of its own */
  monsterRetaliate?: number;
  /** added to every attack a hero makes */
  heroAtk?: number;
  /** every element is always strong, and spending one is free (and automatic) */
  freeElements?: boolean;
  /** pushes and pulls go this many times as far */
  pushMult?: number;
  /** every monster attack pushes this many hexes (before pushMult) */
  monsterPush?: number;
  /** added to every move: heroes' moves, monsters' moving abilities and summons */
  allMove?: number;
  /** every hero move is a jump */
  heroJump?: boolean;
  /** a monster that dies deals this much damage to every monster and summon next to it */
  deathBlast?: number;
  /** ...and this much to every hero next to it */
  deathBlastHero?: number;
  /** cards played go straight back to the hand instead of the discard pile (lost halves are still lost) */
  cardsReturn?: boolean;
  /** coins and chest gold are worth this many times as much */
  goldMult?: number;
}

export interface CombatState {
  v: number;
  scenario: ScenarioRun;
  /** rule changes for this fight (FlashGames modifiers); absent in normal play */
  house?: HouseRules;
  map: MapData;
  units: Unit[];
  pickups: Pickup[];
  round: number;
  phase: Phase;
  order: TurnSlot[];
  turnIdx: number;
  heroTurn: HeroTurn | null;
  /** monster type -> drawn ability index for this round */
  drawn: Record<string, number>;
  /** monster type -> remaining ability deck (indices) */
  decks: Record<string, number[]>;
  elements: Record<Elem, 0 | 1 | 2>;
  /** elements infused this turn (become strong at end of turn) */
  infusedNow: Elem[];
  monsterMods: Mod[];
  monsterModDiscard: Mod[];
  rng: number;
  log: LogLine[];
  fx: Fx[];
  fxId: number;
  pending: Pending | null;
  pendQ: Pending[];
  /** monster type ids revealed so far (for the ability card strip) */
  types: string[];
  destroyed: number;
  /** monster turn progress within the current slot */
  monsterCursor: number;
  /**
   * The state just before the acting hero chose their latest card half (JSON, without log/fx), so they can take it
   * back until they act on it. Cleared by any real action, any attack (modifier cards were drawn) and the end of the
   * turn. Co-op guests receive '1' instead of the snapshot.
   */
  undo?: string | null;
  /** the start hexes: heroes may move between the free ones until the first round begins */
  starts?: [number, number][];
  /** the scenario goal was met this round: it is won once the round has played out (the text to win with) */
  goalMet?: string | null;
  /**
   * Pushes a hero caused that wait for the player to choose where the enemy goes (one hex at a time; when only one hex
   * works it is used without asking). sx/sy is where the push comes from.
   */
  pushQ?: { uid: string; sx: number; sy: number; left: number }[];
  /** once the pushes are settled: carry on to the card's next step ('advance') or stay on this one (more targets) */
  pushThen?: 'advance' | 'stay' | null;
  /** how many log lines this fight has written (see LogLine.n) */
  logSeq?: number;
  result?: { won: boolean; rounds: number; text: string };
}
