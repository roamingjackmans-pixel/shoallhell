// The scenario stats page: everything each hero did, one column per hero plus the party total. Shown on the results
// screen when a scenario ends, from the 📊 Stats button during a fight (numbers so far), and for each of the recent
// games in the hall's Records.
import { CLASSES } from '../data/classes';
import type { GameHero } from '../game/campaign';
import type { CombatState, HeroUnit } from '../game/types';
import { heroPortrait } from '../render/hero';
import { h } from './dom';

type Row = {
  label: string;
  /** a stat key, or a function for derived numbers */
  get: (u: GameHero) => number;
  /** how the party column combines: sum (default), max, or none */
  total?: 'sum' | 'max' | 'none';
  /** format a number for display */
  fmt?: (n: number) => string;
  /** a small explanation on hover */
  tip?: string;
  /** a lower number is better (for highlighting the leader) */
  low?: boolean;
};

const n = (k: string) => (u: GameHero): number => u.stats[k] ?? 0;
const found = (u: GameHero): number => u.found;

const SECTIONS: [string, Row[]][] = [
  [
    'Offence',
    [
      { label: 'Damage dealt', get: n('dmg'), tip: 'Including damage done by their summons and retaliation.' },
      { label: 'Damage to bosses', get: n('bossDmg') },
      { label: 'Best single hit', get: n('bestHit'), total: 'max' },
      { label: 'Attacks made', get: n('attacks') },
      { label: 'Hits', get: n('hits') },
      { label: '×0 drawn (no damage)', get: n('misses'), low: true },
      { label: 'Hit rate', get: (u) => ((u.stats.attacks ?? 0) ? Math.round(((u.stats.hits ?? 0) / u.stats.attacks!) * 100) : 0), total: 'none', fmt: (v) => `${v}%` },
      { label: '×2 and Bless drawn', get: n('crits') },
      { label: 'Enemies defeated', get: n('kills') },
      { label: 'Elites defeated', get: n('elitesKilled') },
      { label: 'Ranged kills', get: n('rangedKills') },
      { label: 'Undead defeated', get: n('undead') },
      { label: 'Conditions inflicted', get: n('condsGiven'), tip: 'Poison, Wound, Muddle, Immobilize, Disarm and Stun put on enemies.' },
      { label: 'Enemies pushed or pulled', get: n('shoved') },
      { label: 'Retaliate damage', get: n('retDmg') },
      { label: 'Allies summoned', get: n('summons') },
    ],
  ],
  [
    'Defence',
    [
      { label: 'Damage taken', get: n('dmgTaken'), low: true },
      { label: 'Damage blocked by Shield', get: n('blocked') },
      { label: 'Times attacked', get: n('attacked') },
      { label: 'Attacks that missed them', get: n('dodged') },
      { label: 'Hazard, trap and bleed damage', get: n('hazardDmg'), low: true },
      { label: 'Healing received', get: n('healed') },
      { label: 'Lethal hits avoided (lost cards)', get: n('negated') },
      { label: 'HP left', get: (u) => (u.exhausted ? 0 : u.hp), total: 'sum' },
      { label: 'Exhausted', get: (u) => (u.exhausted && !u.escaped ? 1 : 0), fmt: (v) => (v ? 'Yes' : '—'), low: true },
    ],
  ],
  [
    'Support',
    [
      { label: 'Healing done', get: n('heals') },
      { label: 'Shield given', get: n('shieldGiven') },
      { label: 'Elements infused', get: n('infusions') },
      { label: 'Elements spent', get: n('elSpent') },
    ],
  ],
  [
    'Cards and turns',
    [
      { label: 'Turns taken', get: n('turns') },
      { label: 'Card halves played', get: n('halves') },
      { label: 'Basic Attack 2 / Move 2', get: n('basics') },
      { label: 'Cards lost', get: n('lost'), low: true },
      { label: 'Cards left (hand + discard)', get: (u) => u.cardsLeft },
      { label: 'Short rests', get: n('shortRests') },
      { label: 'Long rests', get: n('longRests') },
      { label: 'Items used', get: n('items') },
      { label: 'Hexes moved', get: n('moved') },
    ],
  ],
  [
    'Loot',
    [
      { label: 'Gold picked up', get: (u) => u.gold },
      { label: 'Coins collected', get: n('coins') },
      { label: 'Chests opened', get: n('chests') },
      { label: 'Items found', get: found },
      { label: 'XP earned in the fight', get: (u) => u.xp },
    ],
  ],
];

/** The stats table for a fight. `round` is shown in the heading. */
/** A fight's heroes as stats rows. */
export function fightHeroes(s: CombatState, owner?: string): GameHero[] {
  return s.units
    .filter((u): u is HeroUnit => u.kind === 'hero')
    .map((u) => ({
      name: u.name,
      cls: u.cls,
      mine: owner ? u.owner === owner : true,
      stats: u.stats,
      gold: u.gold,
      xp: u.xp,
      hp: u.hp,
      maxHp: u.maxHp,
      exhausted: u.exhausted,
      escaped: !!u.escaped,
      cardsLeft: u.hand.length + u.discard.length,
      found: ((u as HeroUnit & { found?: string[] }).found ?? []).length,
    }));
}

/** The stats page for a fight (live or finished). */
export function statsEl(s: CombatState): HTMLElement {
  const won = s.phase === 'won' ? 'Victory' : s.phase === 'lost' ? 'Defeat' : 'In progress';
  return statsTable(fightHeroes(s), `${s.scenario.name} · ${won} · round ${s.round} · level ${s.scenario.level}`);
}

/** The stats table: one column per hero plus the party total. */
export function statsTable(heroes: GameHero[], subtitle: string): HTMLElement {
  const multi = heroes.length > 1;
  const table = h('table.stats');
  // heading: one column per hero, then the party
  table.appendChild(
    h(
      'thead',
      h(
        'tr',
        h('th', ''),
        heroes.map((u) => h('th', h('div.col', { style: { alignItems: 'center', gap: '2px' } }, heroPortrait(u.cls, 40), h('div', u.name), h('div.tiny.dim', CLASSES[u.cls]?.name ?? u.cls)))),
        multi ? h('th.total', h('div', 'Party'), h('div.tiny.dim', 'total')) : null,
      ),
    ),
  );
  const body = h('tbody');
  for (const [title, rows] of SECTIONS) {
    body.appendChild(h('tr.section', h('td', { colSpan: heroes.length + 2 }, title)));
    for (const r of rows) {
      const vals = heroes.map((u) => r.get(u));
      const fmt = r.fmt ?? ((v: number) => String(v));
      const best = r.low ? Math.min(...vals) : Math.max(...vals);
      const lead = multi && vals.some((v) => v !== best) && (r.low ? true : best > 0);
      const tot = r.total === 'none' ? null : r.total === 'max' ? Math.max(0, ...vals) : vals.reduce((a, b) => a + b, 0);
      body.appendChild(
        h(
          'tr',
          h('td.label', r.tip ? { title: r.tip } : {}, r.label),
          vals.map((v) => h(`td${lead && v === best ? '.lead' : ''}${v === 0 ? '.zero' : ''}`, fmt(v))),
          multi ? h('td.total', r.label === 'Hit rate' ? partyRate(heroes) : tot === null ? '—' : r.label === 'Exhausted' ? String(tot) : fmt(tot)) : null,
        ),
      );
    }
  }
  table.appendChild(body);
  return h(
    'div.col.statspage',
    { style: { gap: '8px' } },
    h('div.row.wrap', { style: { gap: '14px', alignItems: 'baseline' } }, h('h2', { style: { margin: 0 } }, 'Scenario stats'), h('span.dim', subtitle)),
    h('div.statswrap', table),
    multi ? h('div.tiny.dim', 'Highlighted: the best in the party for that line.') : null,
  );
}

function partyRate(heroes: GameHero[]): string {
  const a = heroes.reduce((x, u) => x + (u.stats.attacks ?? 0), 0);
  const hit = heroes.reduce((x, u) => x + (u.stats.hits ?? 0), 0);
  return a ? `${Math.round((hit / a) * 100)}%` : '0%';
}
