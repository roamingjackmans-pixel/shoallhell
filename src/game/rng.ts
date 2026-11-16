// Seeded randomness (mulberry32). The state lives in the CombatState so the co-op host's state is all that matters.
export function rand(st: { rng: number }): number {
  st.rng = (st.rng + 0x6d2b79f5) | 0;
  let t = st.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(st: { rng: number }, lo: number, hi: number): number {
  return lo + Math.floor(rand(st) * (hi - lo + 1));
}

export function pick<T>(st: { rng: number }, list: readonly T[]): T {
  return list[Math.floor(rand(st) * list.length)]!;
}

export function shuffle<T>(st: { rng: number }, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand(st) * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

export function chance(st: { rng: number }, p: number): boolean {
  return rand(st) < p;
}
