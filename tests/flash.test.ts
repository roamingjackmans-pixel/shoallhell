// FlashGames mode (src/flash/): flash.json, the ?flash= config, the day's party, every modifier doing what it says,
// a bot playing flash scenarios (each modifier alone, in pairs and in threes) to an end, and a score that never
// goes down while a whole run is chained.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CLASS_CARDS } from '../src/data/cards';
import { CLASSES } from '../src/data/classes';
import { monsterDef, monsterStat } from '../src/data/monsters';
import { FLASH_MOD_IDS, FLASH_MODS, compatible, flashJson, houseRules } from '../src/flash/mods';
import { FlashScore, flashCombat, flashScenario, heroSetups, livePoints, partyPlan, rngFor, scenarioKind } from '../src/flash/run';
import { hexDist } from '../src/game/grid';
import { createCombat, heroes, monsters } from '../src/game/rules';
import type { CombatState, HeroUnit } from '../src/game/types';
import { SCENARIOS } from '../src/data/story';
import { SEED, cfgOf, fight, playOut } from './balance/flashBot';

describe('flash.json', () => {
  const pub = JSON.parse(readFileSync(new URL('../public/flash.json', import.meta.url), 'utf8')) as ReturnType<typeof flashJson> & { modifiers: { id: string; excludes?: string[] }[]; pick: number[]; maxScore: number };

  it('is what src/flash/mods.ts says (regenerate it if this fails)', () => {
    expect(pub).toEqual(flashJson());
  });

  it('follows the protocol', () => {
    expect(pub.v).toBe(1);
    expect(pub.id).toBe('shoallhell');
    for (const k of ['name', 'tagline', 'goal', 'scoring'] as const) expect(typeof pub[k]).toBe('string');
    expect(pub.modifiers.length).toBeGreaterThanOrEqual(12);
    expect(pub.modifiers.length).toBeLessThanOrEqual(16);
    expect(new Set(pub.modifiers.map((m) => m.id)).size).toBe(pub.modifiers.length);
    for (const m of pub.modifiers) for (const x of m.excludes ?? []) expect(FLASH_MOD_IDS, `${m.id} excludes ${x}`).toContain(x);
    expect(pub.pick[0]).toBeGreaterThanOrEqual(1);
    expect(pub.pick[1]).toBeGreaterThanOrEqual(pub.pick[0]!);
    expect(pub.maxScore).toBeGreaterThan(100000);
  });
});

describe('the ?flash= config (flash-run.js)', () => {
  const saved = { location: (globalThis as Record<string, unknown>).location, addEventListener: (globalThis as Record<string, unknown>).addEventListener };
  beforeAll(() => {
    const code = Buffer.from(JSON.stringify({ v: 1, date: '2026-11-24', seed: SEED, mods: ['elite', 'shove'], limit: 120, run: 'test' }), 'utf8').toString('base64url');
    (globalThis as Record<string, unknown>).location = { search: `?flash=${code}` };
    (globalThis as Record<string, unknown>).addEventListener = () => undefined;
  });
  afterAll(() => {
    (globalThis as Record<string, unknown>).location = saved.location;
    (globalThis as Record<string, unknown>).addEventListener = saved.addEventListener;
  });

  it('reads the run, and its seeded streams are the ones the run is built from', async () => {
    vi.resetModules();
    await import('../src/flash/flash-run.js');
    const F = (globalThis as unknown as { FlashRun: FlashRunApi }).FlashRun;
    expect(F.active).toBe(true);
    expect(F.mods).toEqual(['elite', 'shove']);
    expect(F.has('elite')).toBe(true);
    expect(F.seed).toBe(SEED);
    expect(F.limit).toBe(120);
    const ours = rngFor(SEED);
    for (const salt of ['party', 'cards', 'scenario:0', 'shape:3']) {
      const a = F.rng(salt);
      const b = ours(salt);
      for (let i = 0; i < 5; i++) expect(b()).toBe(a());
    }
    // the party comes from FlashRun.rng('party')
    expect(partyPlan({ mods: F.mods, rng: (s) => F.rng(s) })).toEqual(partyPlan(cfgOf(['elite', 'shove'])));
  });
});

describe('the day’s party and scenarios', () => {
  it('everyone gets the same party, maps and monsters for the same day', () => {
    const a = flashCombat(0, cfgOf(['swarm', 'goldrush'])).state;
    const b = flashCombat(0, cfgOf(['swarm', 'goldrush'])).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = flashCombat(0, cfgOf(['swarm', 'goldrush'], SEED + 1)).state;
    expect(JSON.stringify(c.map)).not.toBe(JSON.stringify(a.map));
  });

  it('two different classes at level 2 or 3, with valid hands', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const plan = partyPlan(cfgOf([], seed));
      expect(plan.classes).toHaveLength(2);
      expect(plan.classes[0]).not.toBe(plan.classes[1]);
      expect([2, 3]).toContain(plan.level);
      for (const h of heroSetups(cfgOf([], seed))) {
        const def = CLASSES[h.cls]!;
        expect(h.cards).toHaveLength(def.hand);
        expect(new Set(h.cards).size).toBe(h.cards.length);
        for (const c of h.cards) expect(CLASS_CARDS[h.cls]!.some((x) => x.id === c && x.level <= h.level)).toBe(true);
        expect(h.perks).toHaveLength(h.level - 1);
        expect(h.maxHp).toBe(def.hp[h.level - 1]);
        expect(h.items).toEqual([]);
      }
    }
  });

  it('scenarios chain clear, escape, boss, one Depth deeper each time, monsters one level up', () => {
    const cfg = cfgOf([]);
    for (let k = 0; k < 12; k++) {
      const { sc, level } = flashScenario(k, cfg);
      expect(sc.depth).toBe(Math.min(9, k + 1));
      expect(level).toBe(Math.min(7, k));
      expect(sc.objective.kind).toBe(scenarioKind(k));
      if (sc.objective.kind === 'boss') expect(monsterDef(sc.objective.boss).boss).toBe(true);
    }
    expect(['clear', 'escape', 'boss']).toEqual([0, 1, 2].map(scenarioKind));
  });

  it('flash states are plain JSON, and normal fights have no house rules', () => {
    for (const mods of [[], ['glowen', 'rush', 'volatile'], ['bossrush', 'swarm', 'goldrush'], ['coinflip', 'blessed', 'clearance']]) {
      const s = flashCombat(2, cfgOf(mods)).state;
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
    const normal = createCombat(SCENARIOS[0]!, heroSetups(cfgOf([])), 1, 7);
    expect('house' in normal).toBe(false);
    expect(houseRules([])).toBeUndefined();
    expect('house' in flashCombat(0, cfgOf(['veterans'])).state).toBe(false);
  });
});

describe('every modifier does what it says', () => {
  it('has 12 to 16 modifiers, each with a name and a text', () => {
    expect(FLASH_MODS.length).toBeGreaterThanOrEqual(12);
    expect(FLASH_MODS.length).toBeLessThanOrEqual(16);
    for (const m of FLASH_MODS) {
      expect(m.name.length).toBeGreaterThan(2);
      expect(m.text.length).toBeGreaterThan(10);
    }
  });

  it('elite: every monster is an Elite, in every room', () => {
    const s = fight(0, ['elite']);
    let seen = 0;
    playOut(s, (st) => {
      for (const m of monsters(st)) {
        if (!monsterDef(m.monster).boss) expect(m.elite).toBe(true);
        seen++;
      }
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('glass: 2 max HP and +3 on every hero attack', () => {
    const s = fight(0, ['glass']);
    for (const h of heroes(s)) expect([h.hp, h.maxHp]).toEqual([2, 2]);
    expect(s.house?.heroAtk).toBe(3);
    const bases: number[] = [];
    playOut(s, (st) => {
      for (const l of st.log.slice(-6)) {
        const m = new RegExp(`^(${heroes(st).map((h) => h.name).join('|')}) attacks .* for (\\d+) `).exec(l.t);
        if (m) bases.push(Number(m[2]));
      }
    });
    expect(bases.length).toBeGreaterThan(0);
    expect(Math.min(...bases)).toBeGreaterThanOrEqual(4); // the smallest attack on a card is 1, +3
  });

  it('blessed: 15 Bless cards in every hero deck', () => {
    for (const h of heroes(fight(0, ['blessed']))) expect(h.mods.filter((m) => m.temp === 'bless')).toHaveLength(15);
  });

  it('coinflip: every deck is ten ×2 and ten ×0', () => {
    const s = fight(0, ['coinflip']);
    for (const deck of [...heroes(s).map((h) => h.mods), s.monsterMods]) {
      expect(deck).toHaveLength(20);
      expect(deck.filter((m) => m.mult === 'x2')).toHaveLength(10);
      expect(deck.filter((m) => m.mult === 'null')).toHaveLength(10);
    }
    // with Blessed Day too, the blessings stay
    for (const h of heroes(fight(0, ['coinflip', 'blessed']))) expect(h.mods.filter((m) => m.temp === 'bless')).toHaveLength(15);
  });

  it('glowen: the elements stay strong all fight and spending them is never asked', () => {
    const s = fight(1, ['glowen']);
    let spent = 0;
    playOut(s, (st) => {
      expect(Object.values(st.elements)).toEqual([2, 2, 2, 2]);
      expect(st.heroTurn?.cur?.elAsk).toBeUndefined();
      spent = Math.max(spent, ...heroes(st).map((h) => h.stats.elSpent ?? 0));
    });
    expect(['won', 'lost']).toContain(s.phase);
    // some day a party has no card that spends an element; most do (checked over a few days below)
    let anySpent = spent > 0;
    for (let seed = 1; seed <= 6 && !anySpent; seed++) {
      const t = fight(0, ['glowen'], seed);
      playOut(t);
      anySpent = heroes(t).some((h) => (h.stats.elSpent ?? 0) > 0);
    }
    expect(anySpent).toBe(true);
  });

  it('fullhand: every card of the class, every level', () => {
    for (const h of heroes(fight(0, ['fullhand']))) expect([...h.hand].sort()).toEqual(CLASS_CARDS[h.cls]!.map((c) => c.id).sort());
  });

  it('veterans: level 5, full health, best cards, four perks; the monsters stay at the run’s level', () => {
    const setups = heroSetups(cfgOf(['veterans']));
    for (const h of setups) {
      expect(h.level).toBe(5);
      expect(h.maxHp).toBe(CLASSES[h.cls]!.hp[4]);
      expect(h.perks).toHaveLength(4);
      expect(h.cards.some((c) => CLASS_CARDS[h.cls]!.find((x) => x.id === c)!.level === 5)).toBe(true);
    }
    expect(fight(0, ['veterans']).scenario.level).toBe(0);
  });

  it('clearance: a full kit from the whole stall', () => {
    for (const h of heroes(fight(0, ['clearance']))) {
      expect(h.items.length).toBeGreaterThanOrEqual(6);
      expect(new Set(h.items.map((i) => i.id)).size).toBe(h.items.length);
    }
  });

  it('bossrush: a boss in every room after the first, at half health', () => {
    for (const k of [0, 1, 2, 3]) {
      const s = fight(k, ['bossrush']);
      s.map.rooms.forEach((r, i) => {
        if (i > 0) expect(r.spawns.some((sp) => monsterDef(sp.monster).boss), `scenario ${k} room ${i}`).toBe(true);
      });
      const bosses = s.map.rooms.flatMap((r) => r.spawns.filter((sp) => monsterDef(sp.monster).boss).map((sp) => sp.monster));
      expect(new Set(bosses).size).toBe(bosses.length);
    }
    // a boss that shows up has half the health it normally would (Normal difficulty: 85%)
    let seen = 0;
    for (let seed = 1; seed <= 10 && !seen; seed++) {
      const s = fight(0, ['bossrush'], seed);
      playOut(s, (st) => {
        for (const m of monsters(st)) {
          const def = monsterDef(m.monster);
          if (!def.boss) continue;
          expect(m.maxHp).toBe(Math.max(1, Math.round(monsterStat(def, st.scenario.level, false, 2).hp * (0.85 * 0.5))));
          seen++;
        }
      });
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('swarm: twice the monsters, half the health', () => {
    for (const k of [0, 1]) {
      const plain = flashCombat(k, cfgOf([])).state;
      const sw = flashCombat(k, cfgOf(['swarm'])).state;
      const count = (s: CombatState): number => s.map.rooms.reduce((n, r) => n + r.spawns.length, 0);
      expect(count(sw)).toBe(count(plain) * 2);
      expect(monsters(sw).length).toBe(monsters(plain).length * 2);
      for (const m of monsters(sw)) expect(m.maxHp).toBe(Math.max(1, Math.round(monsterStat(monsterDef(m.monster), sw.scenario.level, m.elite, 2).hp * (0.85 * 0.5))));
    }
  });

  it('shove: monster attacks shove heroes two hexes', () => {
    let shoves = 0;
    for (let seed = 1; seed <= 8 && !shoves; seed++) {
      const s = fight(0, ['shove'], seed);
      let before = new Map<string, [number, number]>();
      playOut(s, (st) => {
        const slot = st.order[st.turnIdx];
        if (st.phase === 'turns' && slot?.kind === 'monster') {
          for (const h of heroes(st)) {
            const b = before.get(h.uid);
            if (b && !h.exhausted && hexDist(b[0], b[1], h.x, h.y) === 2) shoves++;
          }
        }
        before = new Map(heroes(st).map((h) => [h.uid, [h.x, h.y]]));
      });
    }
    expect(shoves).toBeGreaterThan(0);
  });

  it('thorns: monsters retaliate for 2', () => {
    const s = fight(0, ['thorns']);
    for (const m of monsters(s)) expect(m.stat.retaliate).toBeGreaterThanOrEqual(2);
    let hits = false;
    for (let seed = 1; seed <= 6 && !hits; seed++) {
      const t = fight(0, ['thorns'], seed);
      playOut(t, (st) => {
        if (st.log.some((l) => l.kind === 'monster' && /retaliates for [2-9]/.test(l.t))) hits = true;
      });
    }
    expect(hits).toBe(true);
  });

  it('rush: hero moves are 2 longer and jumps; monsters move 2 further', () => {
    const s = fight(0, ['rush']);
    let checked = 0;
    playOut(s, (st) => {
      const cur = st.heroTurn?.cur;
      const step = cur?.steps[cur.step];
      if (cur?.stepReady && step?.t === 'move' && cur.movesLeft !== undefined && cur.movesLeft >= step.n + 2) {
        expect(cur.jump).toBe(true);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
    expect(s.house?.allMove).toBe(2);
  });

  it('volatile: dying monsters burst', () => {
    let bursts = 0;
    for (let seed = 1; seed <= 6 && !bursts; seed++) {
      const s = fight(0, ['volatile', 'swarm'], seed);
      playOut(s, (st) => {
        if (st.log.some((l) => / bursts!$/.test(l.t))) bursts++;
      });
    }
    expect(bursts).toBeGreaterThan(0);
  });

  it('bottomless: played cards come straight back; only lost halves leave the hand', () => {
    const s = fight(0, ['bottomless']);
    playOut(s, (st) => {
      for (const h of heroes(st)) {
        expect(h.discard).toEqual([]);
        expect(h.hand.length + h.lost.length + h.active.length).toBe(CLASSES[h.cls]!.hand);
      }
    });
  });

  it('goldrush: three times the coins, a chest in every room, double gold', () => {
    const plain = flashCombat(1, cfgOf([])).state;
    const rich = flashCombat(1, cfgOf(['goldrush'])).state;
    const coins = (s: CombatState): number => s.pickups.filter((p) => p.kind === 'coin').length;
    expect(coins(rich)).toBeGreaterThanOrEqual(coins(plain) * 3);
    const roomOf = (s: CombatState, x: number, y: number): number => s.map.room[y * s.map.w + x]!;
    for (let i = 1; i < rich.map.rooms.length; i++) expect(rich.pickups.some((p) => p.kind === 'chest' && roomOf(rich, p.x, p.y) === i)).toBe(true);
    // every coin picked up in a level-0 scenario is worth 4 gold (2, doubled); seen in the log as it happens
    const picks: number[] = [];
    for (let seed = 1; seed <= 6 && !picks.length; seed++) {
      const s = fight(0, ['goldrush'], seed);
      let seenLine = 0;
      playOut(s, (st) => {
        for (const l of st.log) {
          if ((l.n ?? 0) <= seenLine) continue;
          seenLine = l.n ?? 0;
          const m = / picks up (\d+) gold/.exec(l.t);
          if (m) picks.push(Number(m[1]));
        }
      });
    }
    expect(picks.length).toBeGreaterThan(0);
    for (const g of picks) expect(g).toBe(4);
  });
});

describe('a bot plays flash scenarios to an end', () => {
  for (const id of FLASH_MOD_IDS) {
    it(`${id} alone (clear, escape and boss)`, () => {
      for (const k of [0, 1, 2]) {
        const s = fight(k, [id]);
        playOut(s);
        expect(['won', 'lost']).toContain(s.phase);
      }
    }, 60000);
  }

  it('every pair that may share a day', () => {
    let n = 0;
    for (let i = 0; i < FLASH_MOD_IDS.length; i++)
      for (let j = i + 1; j < FLASH_MOD_IDS.length; j++) {
        const pair = [FLASH_MOD_IDS[i]!, FLASH_MOD_IDS[j]!];
        if (!compatible(pair[0]!, pair[1]!)) continue;
        const s = fight(n % 3, pair, SEED + n);
        playOut(s);
        expect(['won', 'lost'], pair.join('+')).toContain(s.phase);
        n++;
      }
    expect(n).toBeGreaterThan(100);
  }, 180000);

  it('threes that may share a day (a fixed sample)', () => {
    const all: string[][] = [];
    const ids = FLASH_MOD_IDS;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        for (let k = j + 1; k < ids.length; k++) {
          const t = [ids[i]!, ids[j]!, ids[k]!];
          if (compatible(t[0]!, t[1]!) && compatible(t[0]!, t[2]!) && compatible(t[1]!, t[2]!)) all.push(t);
        }
    // every seventh one: about 75 of them, spread over every modifier
    const sample = all.filter((_, i) => i % 7 === 0);
    for (const id of ids) expect(sample.some((t) => t.includes(id)), id).toBe(true);
    sample.forEach((t, n) => {
      const s = fight(n % 3, t, SEED + 1000 + n);
      playOut(s);
      expect(['won', 'lost'], t.join('+')).toContain(s.phase);
    });
  }, 240000);
});

describe('the score', () => {
  it('counts kills, Elites, bosses, doors and gold, and a win adds its bonus', () => {
    const s = fight(0, []);
    expect(livePoints(s).points).toBe(0);
    playOut(s);
    const live = livePoints(s);
    const dead = s.units.filter((u) => u.kind === 'monster' && u.dead);
    expect(live.kills).toBe(dead.length);
    const run = new FlashScore();
    const before = run.now(0, s).score;
    expect(before).toBe(live.points);
    if (s.phase === 'won') {
      const bonus = run.bankWin(s);
      expect(bonus).toBeGreaterThanOrEqual(1000);
      expect(run.now(0, s).score).toBe(live.points + bonus);
      // banking twice does nothing
      expect(run.bankWin(s)).toBe(0);
      expect(run.now(0, s).score).toBe(live.points + bonus);
    }
  });

  it('never goes down over a whole chained run, and grows scenario after scenario', () => {
    const days: string[][] = [[], ['veterans', 'goldrush'], ['swarm', 'rush', 'glowen'], ['bossrush', 'elite'], ['bottomless', 'coinflip', 'clearance']];
    let chained = 0;
    days.forEach((mods, d) => {
      const run = new FlashScore();
      let last = 0;
      let k = 0;
      const check = (s: CombatState): void => {
        const { score, detail } = run.now(k, s);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(last);
        expect(detail.length).toBeLessThanOrEqual(120);
        last = score;
      };
      for (; k < 4; k++) {
        const s = fight(k, mods, SEED + d * 31);
        playOut(s, check);
        check(s);
        if (s.phase !== 'won') break;
        run.bankWin(s);
        check(s);
        chained++;
      }
      expect(last).toBeGreaterThan(0);
    });
    expect(chained).toBeGreaterThan(0);
  }, 120000);

  it('a standing hero’s HP and cards count in the win bonus', () => {
    const s = fight(0, ['veterans']);
    playOut(s);
    if (s.phase !== 'won') return;
    const standing = heroes(s).filter((h: HeroUnit) => !h.exhausted || h.escaped);
    const extra = standing.reduce((n, h) => n + 10 * h.hp + 20 * (h.hand.length + h.discard.length), 0);
    const rounds = s.result!.rounds;
    expect(new FlashScore().bankWin(s)).toBe(1000 * s.scenario.depth + 50 * Math.max(0, 12 - rounds) + extra);
  });
});

describe('rules that are easy to break', () => {
  it('no Math.random() in the rules or the map generator, and the flash code touches no saves', () => {
    for (const f of ['../src/game/rules.ts', '../src/game/procgen.ts', '../src/flash/run.ts', '../src/flash/mods.ts']) {
      expect(readFileSync(new URL(f, import.meta.url), 'utf8'), f).not.toMatch(/Math\.random\(/);
    }
    for (const f of ['../src/flash/run.ts', '../src/flash/mods.ts', '../src/flash/boot.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/localStorage|sessionStorage|indexedDB|from '\.\.\/app'|from '\.\.\/net\/|from '\.\.\/resume'|saveResume|applyResult/);
    }
  });
});
