// Enhancements, Gloomhaven style: permanent stickers a hero buys for their own cards at the Enhancer. Each ability
// line (a step of a card half) has a few sticker slots; each sticker improves that line: +1 to its number, more range,
// another target, pierce/push/pull, a condition, jump, or an element infusion.
//
// Prices follow Gloomhaven: a base cost per sticker, doubled when the ability hits several targets (except +1 Target
// itself), +25 gold per card level above 1, and +75 gold for every sticker already on that ability line.
import type { Card, Cond, Elem, Half, Step } from './types';

export type EnhKind =
  | 'plus1'
  | 'range'
  | 'target'
  | 'pierce'
  | 'push'
  | 'pull'
  | 'jump'
  | 'poison'
  | 'wound'
  | 'muddle'
  | 'immobilize'
  | 'disarm'
  | 'fire'
  | 'magic'
  | 'void'
  | 'holy';

/** One sticker on one ability line: which half, which step of it (index in the card's own steps), what it adds. */
export interface Enh {
  half: 'top' | 'bot';
  step: number;
  kind: EnhKind;
}

/** A hero's stickers, by card id. */
export type EnhMap = Record<string, Enh[]>;

const CONDS: EnhKind[] = ['poison', 'wound', 'muddle', 'immobilize', 'disarm'];
const ELEMS: EnhKind[] = ['fire', 'magic', 'void', 'holy'];

/** Base prices (gold). */
const BASE: Record<EnhKind, number> = {
  plus1: 30,
  range: 30,
  target: 50,
  pierce: 30,
  push: 30,
  pull: 30,
  jump: 50,
  poison: 75,
  wound: 75,
  muddle: 50,
  immobilize: 100,
  disarm: 150,
  fire: 100,
  magic: 100,
  void: 100,
  holy: 100,
};

/** +1 on an attack costs more than +1 on a move, as in Gloomhaven. */
function plusOneCost(st: Step): number {
  switch (st.t) {
    case 'attack':
      return 50;
    case 'shield':
    case 'retaliate':
      return 100;
    case 'loot':
      return 60;
    default:
      return 30;
  }
}

/** How many stickers an ability line can hold. */
export function enhSlots(st: Step): number {
  switch (st.t) {
    case 'attack':
      return 2;
    case 'move':
    case 'heal':
    case 'shield':
    case 'retaliate':
    case 'loot':
      return 1;
    default:
      return 0;
  }
}

/** The stickers this ability line can take at all. */
export function enhOptions(st: Step): EnhKind[] {
  switch (st.t) {
    case 'attack': {
      const out: EnhKind[] = ['plus1'];
      if (st.range > 0) out.push('range');
      if (!st.aoe && !st.all) out.push('target');
      out.push('pierce');
      if (st.push) out.push('push');
      if (st.pull) out.push('pull');
      out.push(...CONDS, ...ELEMS);
      return out;
    }
    case 'move':
      return st.jump ? ['plus1', ...ELEMS] : ['plus1', 'jump', ...ELEMS];
    case 'heal':
      return st.range > 0 ? ['plus1', 'range', ...ELEMS] : ['plus1', ...ELEMS];
    case 'shield':
    case 'retaliate':
    case 'loot':
      return ['plus1', ...ELEMS];
    default:
      return [];
  }
}

export function enhLabel(kind: EnhKind, st?: Step): string {
  switch (kind) {
    case 'plus1': {
      const what = st ? { attack: 'Attack', move: 'Move', heal: 'Heal', shield: 'Shield', retaliate: 'Retaliate', loot: 'Loot' }[st.t as string] ?? '' : '';
      return `+1 ${what}`.trim();
    }
    case 'range':
      return '+1 Range';
    case 'target':
      return '+1 Target';
    case 'pierce':
      return '+1 Pierce';
    case 'push':
      return '+1 Push';
    case 'pull':
      return '+1 Pull';
    case 'jump':
      return 'Jump';
    case 'fire':
    case 'magic':
    case 'void':
    case 'holy':
      return `Infuse ${kind[0]!.toUpperCase()}${kind.slice(1)}`;
    default:
      return kind[0]!.toUpperCase() + kind.slice(1);
  }
}

function hitsMany(st: Step): boolean {
  return st.t === 'attack' && (!!st.aoe || !!st.all || (st.targets ?? 1) > 1);
}

/** The price of a sticker on a card's ability line, given the stickers it already has. */
export function enhCost(card: Card, half: 'top' | 'bot', step: number, kind: EnhKind, existing: Enh[]): number {
  const st = card[half].steps[step];
  if (!st) return Infinity;
  let cost = kind === 'plus1' ? plusOneCost(st) : BASE[kind];
  if (kind !== 'target' && hitsMany(st)) cost *= 2;
  cost += 25 * Math.max(0, card.level - 1);
  cost += 75 * existing.filter((e) => e.half === half && e.step === step).length;
  return cost;
}

/** Why a sticker can't go on, or null when it can. */
export function enhBlocked(card: Card, half: 'top' | 'bot', step: number, kind: EnhKind, existing: Enh[]): string | null {
  const st = card[half].steps[step];
  if (!st) return 'No such ability.';
  if (!enhOptions(st).includes(kind)) return 'That sticker does not fit this ability.';
  const here = existing.filter((e) => e.half === half && e.step === step);
  if (here.length >= enhSlots(st)) return 'This ability has no free sticker slots.';
  if (here.some((e) => e.kind === kind)) return 'It already has that sticker.';
  if (ELEMS.includes(kind) && here.some((e) => ELEMS.includes(e.kind))) return 'One element per ability.';
  return null;
}

/** Apply one sticker to a step (returns a new step). */
function applyOne(st: Step, kind: EnhKind): Step {
  const s: Step = { ...st, stickers: [...(st.stickers ?? []), enhLabel(kind, st)] };
  switch (kind) {
    case 'plus1':
      if ('n' in s && typeof s.n === 'number') s.n += 1;
      break;
    case 'range':
      if (s.t === 'attack' || s.t === 'heal') s.range += 1;
      break;
    case 'target':
      if (s.t === 'attack') s.targets = (s.targets ?? 1) + 1;
      break;
    case 'pierce':
      if (s.t === 'attack') s.pierce = (s.pierce ?? 0) + 1;
      break;
    case 'push':
      if (s.t === 'attack') s.push = (s.push ?? 0) + 1;
      break;
    case 'pull':
      if (s.t === 'attack') s.pull = (s.pull ?? 0) + 1;
      break;
    case 'jump':
      if (s.t === 'move') s.jump = true;
      break;
    default:
      if (CONDS.includes(kind) && s.t === 'attack') s.cond = [...(s.cond ?? []), kind as Cond];
  }
  return s;
}

function applyHalf(half: Half, which: 'top' | 'bot', enh: Enh[]): Half {
  const mine = enh.filter((e) => e.half === which);
  if (!mine.length) return half;
  const steps: Step[] = [];
  half.steps.forEach((st, i) => {
    let s = st;
    const here = mine.filter((e) => e.step === i);
    for (const e of here) if (!ELEMS.includes(e.kind)) s = applyOne(s, e.kind);
    // an element sticker infuses right after the ability it is on
    const el = here.find((e) => ELEMS.includes(e.kind));
    if (el) s = { ...s, stickers: [...(s.stickers ?? []), enhLabel(el.kind)] };
    steps.push(s);
    if (el) steps.push({ t: 'infuse', el: el.kind as Elem, sticker: true });
  });
  return { ...half, steps };
}

/** A card as one hero has it: their stickers applied. */
export function enhancedCard(card: Card, enh: Enh[] | undefined): Card {
  if (!enh?.length) return card;
  return { ...card, top: applyHalf(card.top, 'top', enh), bot: applyHalf(card.bot, 'bot', enh) };
}

/** Total stickers on a card. */
export function enhCount(enh: EnhMap | undefined, cardId: string): number {
  return enh?.[cardId]?.length ?? 0;
}
