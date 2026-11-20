// Attack modifier decks: the 20-card starting deck, perks that change it, Bless/Curse, and drawing with
// advantage/disadvantage. Every hero has their own deck; all monsters share one.
import type { Cond, Elem, Mod } from './types';
import { rand } from './rng';

export function baseDeck(): Mod[] {
  const d: Mod[] = [];
  for (let i = 0; i < 6; i++) d.push({ v: 0 });
  for (let i = 0; i < 5; i++) d.push({ v: 1 });
  for (let i = 0; i < 5; i++) d.push({ v: -1 });
  d.push({ v: 2 }, { v: -2 }, { v: 0, mult: 'x2' }, { v: 0, mult: 'null' });
  return d;
}

const CONDS: Cond[] = ['poison', 'wound', 'immobilize', 'disarm', 'stun', 'muddle', 'strengthen', 'invisible', 'regenerate'];
const EL: Record<string, Elem> = { f: 'fire', m: 'magic', v: 'void', h: 'holy' };

/** Parse one token like "1", "-1", "r1", "+2m", "1wound", "r0heal", "1p", "1s". */
export function parseMod(tok: string): Mod {
  let t = tok.trim();
  const m: Mod = { v: 0 };
  if (t.startsWith('r')) {
    m.roll = true;
    t = t.slice(1);
  }
  const num = /^[+-]?\d+/.exec(t);
  if (num) {
    m.v = parseInt(num[0], 10);
    t = t.slice(num[0].length);
  }
  if (!t) return m;
  if (EL[t]) m.infuse = EL[t];
  else if (t === 'p') m.push = 1;
  else if (t === 's') m.shield = 1;
  else if (t === 'heal') m.heal = 2;
  else if ((CONDS as string[]).includes(t)) m.cond = t as Cond;
  return m;
}

function sameMod(a: Mod, b: Mod): boolean {
  return a.v === b.v && !a.mult && !b.mult && !!a.roll === !!b.roll && a.cond === b.cond && a.infuse === b.infuse && !a.push && !b.push && !a.shield && !a.heal && !a.temp;
}

/** Apply a perk spec ("-a,b;+c,d") to a deck. */
export function applyPerk(deck: Mod[], spec: string): void {
  for (const seg of spec.split(';')) {
    const op = seg[0];
    const toks = seg.slice(1).split(',').filter(Boolean);
    for (const tok of toks) {
      const mod = parseMod(tok);
      if (op === '-') {
        const i = deck.findIndex((d) => sameMod(d, mod));
        if (i >= 0) deck.splice(i, 1);
      } else deck.push(mod);
    }
  }
}

export function heroDeck(perkSpecs: string[]): Mod[] {
  const d = baseDeck();
  for (const p of perkSpecs) applyPerk(d, p);
  return d;
}

export function modLabel(m: Mod): string {
  if (m.temp === 'bless') return 'BLESS ×2';
  if (m.temp === 'curse') return 'CURSE ×0';
  if (m.mult === 'x2') return '×2';
  if (m.mult === 'null') return '×0';
  let s = (m.v >= 0 ? '+' : '') + m.v;
  if (m.roll) s = '↻ ' + s;
  if (m.cond) s += ' ' + m.cond;
  if (m.infuse) s += ' ' + m.infuse;
  if (m.push) s += ' push';
  if (m.shield) s += ' shield';
  if (m.heal) s += ' heal';
  return s;
}

export interface DeckHolder {
  mods: Mod[];
  modDiscard: Mod[];
}

/** Draw one card (reshuffling the discard if the deck is empty). Bless/Curse are removed instead of discarded. */
function drawOne(st: { rng: number }, h: DeckHolder): Mod {
  if (h.mods.length === 0) {
    h.mods.push(...h.modDiscard);
    h.modDiscard.length = 0;
  }
  const i = Math.floor(rand(st) * h.mods.length);
  const m = h.mods.splice(i, 1)[0]!;
  if (!m.temp) h.modDiscard.push(m);
  return m;
}

export interface Drawn {
  /** cards shown, in order */
  shown: Mod[];
  /** the cards that count */
  used: Mod[];
}

/** Draw for one attack: rolling cards chain; advantage/disadvantage draw two and keep the better/worse. */
export function drawMods(st: { rng: number }, h: DeckHolder, adv: number, base: number): Drawn {
  const chain = (): Mod[] => {
    const out: Mod[] = [];
    let m = drawOne(st, h);
    out.push(m);
    let guard = 0;
    while (m.roll && guard++ < 10) {
      m = drawOne(st, h);
      out.push(m);
    }
    return out;
  };
  if (adv === 0) {
    const c = chain();
    return { shown: c, used: c };
  }
  const a = chain();
  const b = chain();
  const va = apply(base, a);
  const vb = apply(base, b);
  const pick = adv > 0 ? (va >= vb ? a : b) : va <= vb ? a : b;
  return { shown: [...a, ...b], used: pick };
}

/** The attack value after a set of modifier cards. */
export function apply(base: number, used: Mod[]): number {
  let v = base;
  let mult: Mod['mult'] | undefined;
  for (const m of used) {
    if (m.temp === 'bless') mult = 'x2';
    else if (m.temp === 'curse') mult = 'null';
    else if (m.mult) mult = m.mult;
    else v += m.v;
  }
  if (mult === 'null') return 0;
  if (mult === 'x2') return v * 2;
  return Math.max(0, v);
}

export function needsShuffle(used: Mod[]): boolean {
  return used.some((m) => m.mult === 'x2' || m.mult === 'null');
}
