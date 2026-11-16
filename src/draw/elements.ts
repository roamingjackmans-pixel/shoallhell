// The five damage types (D80): their colours, names and the weakness chart (D81).
// Pure data and functions: safe to import from game, render and UI code alike.
import type { DamageType } from './dtypes';
export type { DamageType };

export interface ElementLook {
  name: string;
  short: string;
  /** the type's own colour (bodies, armour tints, item text on light backgrounds) */
  main: string;
  /** a brighter shade that reads on the dark dungeon floor (glows, telegraph sparks, swing trails) */
  glow: string;
  /** a deep shade for shadows and undersides */
  deep: string;
}

export const ELEMENTS: Record<DamageType, ElementLook> = {
  physical: { name: 'Physical', short: 'Phys', main: '#ece6da', glow: '#ffffff', deep: '#8a8478' },
  magic: { name: 'Magic', short: 'Magic', main: '#3f8cff', glow: '#7cc4ff', deep: '#1a3f8a' },
  void: { name: 'Void', short: 'Void', main: '#2a2631', glow: '#9a93ab', deep: '#0d0b11' },
  fire: { name: 'Fire', short: 'Fire', main: '#e33b22', glow: '#ff7a3a', deep: '#7a1608' },
  holy: { name: 'Holy', short: 'Holy', main: '#f0c43c', glow: '#ffe98a', deep: '#8a6a10' },
};

export function elementColor(t: DamageType): string {
  return ELEMENTS[t].main;
}
export function elementGlow(t: DamageType): string {
  return ELEMENTS[t].glow;
}

/**
 * The weakness chart (D81). Physical is neutral to everything and everything is neutral to Physical.
 * Magic beats Holy, Holy beats Void, Void beats Fire, Fire beats Magic (and each loses to the one that beats it).
 */
export const STRONG_VS: Partial<Record<DamageType, DamageType>> = { magic: 'holy', holy: 'void', void: 'fire', fire: 'magic' };
export const WEAK_VS: Partial<Record<DamageType, DamageType>> = { magic: 'fire', holy: 'magic', void: 'holy', fire: 'void' };
export const STRONG_MULT = 1.5;
export const WEAK_MULT = 0.6;

/** Damage multiplier for an attack of type `attack` landing on a body of type `defender`. */
export function affinityMult(attack: DamageType, defender: DamageType): number {
  if (STRONG_VS[attack] === defender) return STRONG_MULT;
  if (WEAK_VS[attack] === defender) return WEAK_MULT;
  return 1;
}

/** Plain-language chart line for tooltips and the codex: "Weak to Fire · Resists Void". */
export function chartLine(t: DamageType): string {
  if (t === 'physical') return 'No weakness';
  const weakTo = (Object.keys(STRONG_VS) as DamageType[]).find((k) => STRONG_VS[k] === t);
  const resists = (Object.keys(WEAK_VS) as DamageType[]).find((k) => WEAK_VS[k] === t);
  return `Weak to ${ELEMENTS[weakTo!].name} · Resists ${ELEMENTS[resists!].name}`;
}
