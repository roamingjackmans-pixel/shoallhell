// Every class's ability cards, by id and by class.
import type { Card } from '../../game/types';
import { BERSERKER } from './berserker';
import { BRUTE } from './brute';
import { CLERIC } from './cleric';
import { DIVER } from './diver';
import { DUELIST } from './duelist';
import { GLOWSMITH } from './glowsmith';
import { HUNTER } from './hunter';
import { KNIGHT } from './knight';
import { LAMPLIGHTER } from './lamplighter';
import { NOBODY } from './nobody';
import { NOTARY } from './notary';
import { OCCULTIST } from './occultist';
import { SCHOLAR } from './scholar';
import { SPEARMAN } from './spearman';

export const CLASS_CARDS: Record<string, Card[]> = {
  knight: KNIGHT,
  brute: BRUTE,
  duelist: DUELIST,
  scholar: SCHOLAR,
  cleric: CLERIC,
  spearman: SPEARMAN,
  hunter: HUNTER,
  occultist: OCCULTIST,
  berserker: BERSERKER,
  nobody: NOBODY,
  diver: DIVER,
  notary: NOTARY,
  glowsmith: GLOWSMITH,
  lamplighter: LAMPLIGHTER,
};

export const CARDS: Record<string, Card> = {};
for (const list of Object.values(CLASS_CARDS)) for (const c of list) CARDS[c.id] = c;

export function card(id: string): Card {
  const c = CARDS[id];
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
}

/** The cards a hero of this class can bring at a level: all level-1 cards plus the level-ups they picked. */
export function starterCards(cls: string): string[] {
  return (CLASS_CARDS[cls] ?? []).filter((c) => c.level === 1).map((c) => c.id);
}
