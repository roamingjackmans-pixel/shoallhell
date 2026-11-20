// Balance report: every class plays the same seeded missions solo, with the same bot, many times. Run it with
//   $env:BALANCE='1'; npx vitest run tests/balance.test.ts
// Options: BAL_LEVEL (scenario level, default 1), BAL_N (seeds per scenario, default 40), BAL_OUT (write the report
// to docs/BALANCE.md). Skipped in the normal test run.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLASS_CARDS } from '../src/data/cards';
import { CLASSES } from '../src/data/classes';
import { SCENARIOS } from '../src/data/story';
import { createCombat, heroes, type HeroSetup } from '../src/game/rules';
import { playOut } from './balance/bot';

/**
 * The calibration missions: the first Depth's clear-the-rooms fights, cut down to one room of monsters after the
 * start (a lone level-1 hero cannot clear the full three-room missions). BAL_ROOMS changes the number of rooms.
 */
export const BALANCE_MISSIONS = SCENARIOS.filter((sc) => sc.depth <= 3 && sc.objective.kind === 'clear')
  .slice(0, 5)
  .map((sc) => ({ ...sc, id: `bal-${sc.id}`, rooms: Number(process.env.BAL_ROOMS ?? 1) }));

function rng(seed: number): () => number {
  let x = seed | 0 || 1;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

/** A hero with a random hand from their level-1 cards (so every build gets played). */
function setup(cls: string, seed: number): HeroSetup {
  const def = CLASSES[cls]!;
  const pool = CLASS_CARDS[cls]!.filter((c) => c.level === 1).map((c) => c.id);
  const r = rng(seed);
  const shuffled = pool.map((id) => [r(), id] as const).sort((a, b) => a[0] - b[0]).map(([, id]) => id);
  return { owner: 'p', charId: 'c', name: def.name, cls, level: 1, maxHp: def.hp[0]!, cards: shuffled.slice(0, def.hand), items: [], perks: [] };
}

export interface ClassResult {
  cls: string;
  games: number;
  wins: number;
  rounds: number;
  dmg: number;
  hpLeft: number;
}

export function runClass(cls: string, level: number, n: number): ClassResult {
  const out: ClassResult = { cls, games: 0, wins: 0, rounds: 0, dmg: 0, hpLeft: 0 };
  BALANCE_MISSIONS.forEach((sc, si) => {
    for (let i = 0; i < n; i++) {
      const seed = 1000 + Number(process.env.BAL_SEED ?? 0) * 104729 + si * 7919 + i * 131;
      const s = createCombat(sc, [setup(cls, seed + 3)], level, seed, 'normal');
      playOut(s);
      const h = heroes(s)[0]!;
      out.games++;
      if (s.phase === 'won') {
        out.wins++;
        out.hpLeft += h.exhausted ? 0 : h.hp / h.maxHp;
      }
      out.rounds += s.round;
      out.dmg += h.stats.dmg;
    }
  });
  return out;
}

describe.skipIf(!process.env.BALANCE)('balance report', () => {
  it('every class against the same missions', () => {
    const level = Number(process.env.BAL_LEVEL ?? 1);
    const n = Number(process.env.BAL_N ?? 40);
    const t0 = Date.now();
    const rows = Object.keys(CLASSES).map((c) => runClass(c, level, n));
    const avg = rows.reduce((a, r) => a + r.wins / r.games, 0) / rows.length;
    const lines = [
      `Balance report: ${BALANCE_MISSIONS.map((s) => s.id).join(', ')} (${BALANCE_MISSIONS[0]!.rooms} room${BALANCE_MISSIONS[0]!.rooms > 1 ? 's' : ''} of monsters) · scenario level ${level} · ${n} seeds each · Normal · solo, level 1, random hand from the level-1 cards`,
      `Average win rate ${(avg * 100).toFixed(1)}% · band (±20% of average) ${(avg * 80).toFixed(1)}%–${(avg * 120).toFixed(1)}% · ${((Date.now() - t0) / 1000).toFixed(0)} s`,
      '',
      '| Class | Win rate | vs average | Avg rounds | Avg damage | HP left when won |',
      '|---|---|---|---|---|---|',
      ...rows
        .sort((a, b) => b.wins / b.games - a.wins / a.games)
        .map((r) => {
          const w = r.wins / r.games;
          const rel = avg ? w / avg : 0;
          const flag = rel > 1.2 ? ' ▲ strong' : rel < 0.8 ? ' ▼ weak' : '';
          return `| ${CLASSES[r.cls]!.name} | ${(w * 100).toFixed(1)}% | ${(rel * 100).toFixed(0)}%${flag} | ${(r.rounds / r.games).toFixed(1)} | ${(r.dmg / r.games).toFixed(1)} | ${r.wins ? ((r.hpLeft / r.wins) * 100).toFixed(0) : '—'}% |`;
        }),
    ];
    console.log('\n' + lines.join('\n'));
    // docs/BALANCE.md: replace the table, keep the notes below it ("## How it is measured" onwards)
    let notes = '';
    try {
      const old = readFileSync('docs/BALANCE.md', 'utf8');
      const i = old.indexOf('\n## ');
      if (i >= 0) notes = old.slice(i);
    } catch {
      /* no report yet */
    }
    writeFileSync(process.env.BAL_OUT ? 'docs/BALANCE.md' : 'tests/balance/last-report.md', `# Class balance\n\n${lines.join('\n')}\n${process.env.BAL_OUT ? notes : ''}`);
    expect(rows.length).toBe(Object.keys(CLASSES).length);
  }, 600_000);
});
