// A tiny vocabulary for writing ability cards as data. Every card has a top half and a bottom half; on a turn a hero
// plays the top of one of their two picked cards and the bottom of the other (or the basic Attack 2 / Move 2).
import type { Aoe, Card, Cond, Consume, DamageType, Elem, Half, Persist, Step } from '../game/types';

type AtkOpts = {
  range?: number;
  targets?: number;
  aoe?: Aoe;
  pierce?: number;
  push?: number;
  pull?: number;
  cond?: Cond[];
  type?: DamageType;
  xp?: number;
  drain?: number;
  use?: Consume;
  selfDmg?: number;
  all?: boolean;
  note?: string;
};

/** Move n spaces (jump: fly over obstacles, enemies and hazards). */
export const mv = (n: number, jump = false): Step => ({ t: 'move', n, ...(jump ? { jump } : {}) });
/** Attack n (range 0 = melee). */
export const atk = (n: number, o: AtkOpts = {}): Step => ({ t: 'attack', n, range: o.range ?? 0, ...o });
/** Heal n. range 0 + self = self only. */
export const heal = (n: number, o: { range?: number; self?: boolean; all?: boolean; cond?: Cond[]; use?: Consume; xp?: number } = {}): Step => ({
  t: 'heal',
  n,
  range: o.range ?? 0,
  ...(o.range ? {} : { self: true }),
  ...o,
});
/** Shield n until the end of the round (range: give it to an ally; all: every ally in range). */
export const shield = (n: number, o: { range?: number; all?: boolean; use?: Consume; xp?: number } = {}): Step => ({ t: 'shield', n, ...o });
/** Retaliate n until the end of the round. */
export const ret = (n: number, o: { range?: number; use?: Consume; xp?: number } = {}): Step => ({ t: 'retaliate', n, ...o });
/** Give conditions (positive ones to self/allies). */
export const buff = (cond: Cond[], o: { range?: number; self?: boolean; all?: boolean; xp?: number; use?: Consume } = {}): Step => ({
  t: 'buff',
  cond,
  ...(o.range ? {} : { self: true }),
  ...o,
});
export const loot = (n: number, xp?: number): Step => ({ t: 'loot', n, ...(xp ? { xp } : {}) });
export const infuse = (el: Elem): Step => ({ t: 'infuse', el });
export const summon = (id: string, xp?: number): Step => ({ t: 'summon', id, ...(xp ? { xp } : {}) });
/** Return n cards from the discard pile to the hand. */
export const recover = (n: number, xp?: number): Step => ({ t: 'recover', n, ...(xp ? { xp } : {}) });
/** Add n Bless cards to an ally's (or your own) modifier deck. */
export const bless = (n: number, range = 0, xp?: number): Step => ({ t: 'bless', n, range, ...(xp ? { xp } : {}) });
/** Add n Curse cards to the monster modifier deck (target an enemy in range). */
export const curse = (n: number, range: number, xp?: number): Step => ({ t: 'curse', n, range, ...(xp ? { xp } : {}) });
/** Teleport to any empty space within n. */
export const tp = (n: number, xp?: number): Step => ({ t: 'teleport', n, ...(xp ? { xp } : {}) });
export const xp = (n: number): Step => ({ t: 'xp', n });

/** Spend an element for a bonus. */
export const use = (el: Elem | 'any', bonus: Omit<Consume, 'el'>): Consume => ({ el, ...bonus });

/** A card half. */
export const H = (steps: Step[], o: { lost?: boolean; persist?: Persist } = {}): Half => ({ steps, ...o });
/** A lost card half (the card is gone for the scenario once played). */
export const L = (steps: Step[], persist?: Persist): Half => ({ steps, lost: true, ...(persist ? { persist } : {}) });
/** A lasting bonus (shield/retaliate/+atk/+move/drain), `uses` 0 = for the rest of the scenario. */
export const P = (kind: Persist['kind'], n: number, uses: number, text: string, cond?: Cond): Persist => ({ kind, n, uses, text, ...(cond ? { cond } : {}) });

/** Build a class's card list: card(level, initiative, name, top, bottom, flavour?). */
export function deck(cls: string, list: [number, number, string, Half, Half, string?][]): Card[] {
  return list.map(([level, init, name, top, bot, flavor]) => ({
    id: `${cls}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    cls,
    name,
    level,
    init,
    top,
    bot,
    ...(flavor ? { flavor } : {}),
  }));
}
