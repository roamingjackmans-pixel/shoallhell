// Every Dungeon Joe enemy as a Shoallhell monster: a stat line by role, scaled by scenario level, and an ability deck
// built from its own attacks. A Red attack (can't be blocked in Dungeon Joe) ignores Shield here; a Blue (Piercing)
// attack hits every hero in its area. Bosses and summons are written out by hand below.
import type { Cond, DamageType, MonsterAbility, MonsterDef, MonsterStat, Role, SummonDef } from '../game/types';
import { DJ_ENEMIES, type DjEnemy } from './djEnemies';

const ROLE_BASE: Record<Exclude<Role, 'boss'>, MonsterStat> = {
  fodder: { hp: 5, move: 2, atk: 2, range: 0 },
  swarm: { hp: 2, move: 3, atk: 1, range: 0 },
  ranged: { hp: 4, move: 2, atk: 2, range: 4 },
  caster: { hp: 4, move: 2, atk: 2, range: 3 },
  brute: { hp: 9, move: 1, atk: 3, range: 0 },
  tank: { hp: 7, move: 2, atk: 2, range: 0, shield: 1 },
  assassin: { hp: 5, move: 3, atk: 3, range: 0 },
  hazard: { hp: 7, move: 0, atk: 2, range: 2 },
  support: { hp: 5, move: 2, atk: 1, range: 3 },
};

const ROLE_INIT: Record<Exclude<Role, 'boss'>, number> = {
  assassin: 14,
  swarm: 22,
  fodder: 38,
  ranged: 33,
  caster: 48,
  support: 55,
  tank: 61,
  brute: 70,
  hazard: 79,
};

const STATUS: Record<string, Cond> = { poison: 'poison', bleed: 'wound', burn: 'wound', chill: 'immobilize', freeze: 'stun', shock: 'disarm' };

const SUMMONERS = /raise|birth|split|mirror|images|reinforce|summon|court|trap/i;
const HEALERS = /mend|repair|prescribe|jelly|lament|late fee|enrage|choir shield|lichen coat|flask|hymn|stoke/i;

/** small deterministic number from a string, for initiative jitter */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 1000;
}

function clampInit(n: number): number {
  return Math.max(3, Math.min(95, Math.round(n)));
}

function elemOf(e: DjEnemy): DamageType {
  const tally: Record<string, number> = {};
  let total = 0;
  for (const a of e.atk) {
    if (a[1] === 'utility') continue;
    tally[a[2]] = (tally[a[2]] ?? 0) + 1;
    total++;
  }
  let best: DamageType = 'physical';
  let n = 0;
  for (const [k, v] of Object.entries(tally)) if (k !== 'physical' && v > n) ((best = k as DamageType), (n = v));
  return total > 0 && n / total >= 0.5 ? best : 'physical';
}

/** Enemies whose Dungeon Joe red attacks keep their numbers here but do not ignore Shield (owner's call). */
const SHIELD_STOPS_RED = new Set(['shambler']);

function convert(e: DjEnemy): MonsterDef {
  const role = (e.role in ROLE_BASE ? e.role : 'fodder') as Exclude<Role, 'boss'>;
  const base: MonsterStat = { ...ROLE_BASE[role] };
  if (e.move === 'stationary') base.move = 0;
  const flying = e.move === 'hover';
  const ranged = base.range > 0;
  const init0 = ROLE_INIT[role];
  const abilities: MonsterAbility[] = [];
  for (const [name, kind, type, pattern, status] of e.atk) {
    const cond = STATUS[status] ? [STATUS[status]!] : undefined;
    const j = (hashStr(e.id + name) % 13) - 6;
    const shot = pattern === 'projectile' || pattern === 'beam';
    if (kind === 'normal') {
      // a plain ranged attack is taken from where the monster stands: close in on a shooter to give it disadvantage
      const stands = ranged || shot;
      abilities.push({ name, init: clampInit(init0 + j), move: base.move && !stands ? 0 : null, atk: 0, ...(shot && !ranged ? { range: 3 } : {}), ...(cond ? { cond } : {}) });
    } else if (kind === 'red') {
      const lunge = pattern === 'line';
      abilities.push({
        name,
        init: clampInit(init0 + 12 + j),
        move: base.move ? (lunge ? 1 : 0) : null,
        atk: 1,
        ...(SHIELD_STOPS_RED.has(e.id) ? {} : { red: true }),
        ...(cond ? { cond } : {}),
        ...(/charge|ram|shield|anvil|crush|slam|swing|grab|reel/i.test(name) ? { push: 1 } : {}),
        ...(/reel|grab|pull|hug/i.test(name) ? { pull: 2, push: undefined } : {}),
      });
    } else if (kind === 'pierce') {
      const wide = /randomCircles|grid|lanes|pockets|sweep|wave|sequence/.test(pattern);
      abilities.push({
        name,
        init: clampInit(init0 + 18 + j),
        move: base.move ? -1 : null,
        atk: -1,
        blue: true,
        range: wide ? 3 : 2,
        ...(cond ? { cond } : {}),
      });
    } else {
      // utility: summon, mend, or reposition
      if (SUMMONERS.test(name)) {
        abilities.push({ name, init: clampInit(init0 + 5 + j), move: null, atk: null, summon: '__pack__', text: 'Summons help' });
      } else if (HEALERS.test(name)) {
        abilities.push({ name, init: clampInit(init0 - 8 + j), move: base.move ? 0 : null, atk: null, heal: { n: 2, range: 3 }, shield: 1, text: 'Mends allies' });
      } else {
        abilities.push({ name, init: clampInit(init0 - 12 + j), move: base.move ? 2 : null, atk: -1, shield: 1 });
      }
    }
    // the attack's own damage type rides on the ability (for the weakness chart)
    const last = abilities[abilities.length - 1]!;
    if (type !== 'physical' && last.atk !== null) last.type = type as DamageType;
  }
  // every deck has at least five cards: pad with plain shoves and guards
  const pads: MonsterAbility[] = [
    { name: 'Advance', init: clampInit(init0 - 4), move: base.move ? 1 : null, atk: -1 },
    { name: 'Hold the Line', init: clampInit(init0 + 8), move: base.move ? -1 : null, atk: 0, shield: 1 },
    { name: 'Press', init: clampInit(init0 + 2), move: base.move && !ranged ? 0 : null, atk: 1 },
  ];
  for (const p of pads) if (abilities.length < 5) abilities.push(p);
  return {
    id: e.id,
    name: e.name,
    zone: e.zone,
    role,
    draw: e.draw,
    radius: e.r,
    elem: elemOf(e),
    flavor: e.flavor,
    base,
    abilities,
    ...(e.swarm ? { pieces: Math.min(3, Math.max(2, Math.round(e.swarm / 2))) } : {}),
    ...(flying ? { flying } : {}),
    ...(e.undead ? { undead: true } : {}),
  };
}

export const MONSTERS: Record<string, MonsterDef> = {};
for (const e of DJ_ENEMIES) MONSTERS[e.id] = convert(e);

/** monster ids per Dungeon Joe zone (1–8) */
export const ZONE_MONSTERS: Record<number, string[]> = {};
for (const m of Object.values(MONSTERS)) (ZONE_MONSTERS[m.zone] ??= []).push(m.id);

// ------------------------------------------------------------------ bosses

function boss(def: Omit<MonsterDef, 'role' | 'boss' | 'immune'> & { immune?: Cond[] }): MonsterDef {
  return { ...def, role: 'boss', boss: true, immune: def.immune ?? ['stun', 'immobilize', 'disarm'] };
}

/** Boss hp is per hero; see bossStat(). */
export const BOSSES: Record<string, MonsterDef> = {
  the_caretaker: boss({
    id: 'the_caretaker', name: 'The Caretaker', zone: 1, draw: 'boss_caretaker', radius: 50, elem: 'physical',
    flavor: 'Buried the dead, kept their Glowen. Washed up in the Shoal with his lantern still lit and his contract renewed.',
    base: { hp: 10, move: 2, atk: 3, range: 0 },
    abilities: [
      { name: 'Shovel Swing', init: 40, move: 1, atk: 0, push: 1 },
      { name: 'Lantern Toss', init: 55, move: 0, atk: -1, range: 3, blue: true, type: 'fire', cond: ['wound'] } as MonsterAbility,
      { name: 'Grave Call', init: 70, move: null, atk: null, summon: 'shambler', text: 'Two Shamblers climb out' },
      { name: 'Overhead Slam', init: 62, move: 0, atk: 2, red: true },
      { name: 'Hands of the Dead', init: 30, move: 0, atk: 0, range: 3, blue: true, cond: ['immobilize'] },
      { name: 'Last Rites', init: 85, move: null, atk: null, heal: { n: 4, range: 0 }, shield: 1 },
    ],
  }),
  mother_spore: boss({
    id: 'mother_spore', name: 'Mother Spore', zone: 2, draw: 'boss_mother_spore', radius: 66, elem: 'physical',
    flavor: 'A cathedral-sized mushroom with a face in the stalk. The Shoal is wet and warm. She has never been happier.',
    base: { hp: 11, move: 0, atk: 3, range: 3 },
    abilities: [
      { name: 'Stalk Slam', init: 50, move: null, atk: 1, range: 1 },
      { name: 'Spore Bloom', init: 35, move: null, atk: -1, range: 4, blue: true, cond: ['poison'] },
      { name: 'Sporeling Birth', init: 60, move: null, atk: null, summon: 'sporeling', text: 'Two Sporelings pop out' },
      { name: 'Tendril Whip', init: 45, move: null, atk: 0, range: 4, pull: 2, red: true },
      { name: 'Rain of Caps', init: 72, move: null, atk: 0, range: 5, blue: true },
      { name: 'Mycelium Web', init: 25, move: null, atk: -1, range: 4, targets: 2, cond: ['immobilize'] },
    ],
  }),
  bloatking: boss({
    id: 'bloatking', name: 'The Bloatking', zone: 3, draw: 'boss_bloatking', radius: 60, elem: 'magic',
    flavor: 'A drowned monarch on a floating throne of debris. Skimmed the rent for centuries. The Shoal is his bathtub.',
    base: { hp: 12, move: 1, atk: 3, range: 2 },
    abilities: [
      { name: 'Scepter Swing', init: 48, move: 1, atk: 0, push: 2 },
      { name: 'Wave', init: 58, move: 0, atk: -1, range: 3, blue: true, type: 'magic', push: 1 } as MonsterAbility,
      { name: 'Summon Court', init: 66, move: null, atk: null, summon: 'drowned', text: 'Two Drowned rise' },
      { name: 'Royal Decree', init: 40, move: 0, atk: 1, range: 4, red: true, cond: ['poison'] },
      { name: 'Undertow', init: 30, move: 0, atk: 0, range: 4, pull: 3, cond: ['muddle'] },
      { name: 'Tidal Decree', init: 80, move: null, atk: null, heal: { n: 5, range: 0 } },
    ],
  }),
  vexthorn: boss({
    id: 'vexthorn', name: 'Vexthorn, the Hollow Stag', zone: 4, draw: 'boss_vexthorn', radius: 46, elem: 'holy',
    flavor: 'A fey stag with antlers of thorn and the forest’s last Glowen in a lantern for a heart. Drifted here on a raft of roots.',
    base: { hp: 10, move: 4, atk: 3, range: 0 },
    abilities: [
      { name: 'Antler Gore', init: 20, move: 2, atk: 0, cond: ['wound'] },
      { name: 'Charge', init: 15, move: 4, atk: 1, red: true, push: 2 },
      { name: 'Thorn Burst', init: 45, move: 0, atk: -1, range: 2, blue: true, cond: ['wound'] },
      { name: 'Fey Lights', init: 52, move: 1, atk: -1, range: 4, targets: 3, type: 'holy' } as MonsterAbility,
      { name: 'Bramble Cage', init: 33, move: 0, atk: 0, range: 3, cond: ['immobilize'] },
      { name: 'Wild Hunt', init: 60, move: null, atk: null, summon: 'hollow_wolf', text: 'The hollow wolves answer' },
    ],
  }),
  foreman_ignatius: boss({
    id: 'foreman_ignatius', name: 'Foreman Ignatius', zone: 5, draw: 'boss_ignatius', radius: 58, elem: 'fire',
    flavor: 'Riding an Anvil Golem’s shoulders. Two hundred years without a break, and now a sea to boil.',
    base: { hp: 13, move: 1, atk: 4, range: 0, shield: 1 },
    abilities: [
      { name: 'Golem Slam', init: 65, move: 1, atk: 0, push: 1 },
      { name: 'Hammer Throw', init: 40, move: 0, atk: -1, range: 4, red: true, type: 'fire' } as MonsterAbility,
      { name: 'Flame Pillars', init: 55, move: 0, atk: -1, range: 3, blue: true, type: 'fire', cond: ['wound'] } as MonsterAbility,
      { name: 'Molten Shockwave', init: 75, move: null, atk: 0, range: 2, blue: true, type: 'fire' } as MonsterAbility,
      { name: 'Stoke', init: 85, move: null, atk: null, heal: { n: 4, range: 0 }, shield: 2, infuse: 'fire' },
      { name: 'Forge Draw', init: 30, move: 0, atk: 0, range: 4, pull: 3, red: true },
    ],
  }),
  saint_aurelia: boss({
    id: 'saint_aurelia', name: 'Saint Aurelia the Unthawed', zone: 6, draw: 'boss_aurelia', radius: 46, elem: 'holy',
    flavor: 'She froze herself at the Reliquary door. The Executor has had her contract re-frozen. She is furious about it.',
    base: { hp: 11, move: 3, atk: 3, range: 0 },
    abilities: [
      { name: 'Blessed Blade', init: 28, move: 2, atk: 0, type: 'holy' } as MonsterAbility,
      { name: 'Ice Spears', init: 38, move: 0, atk: 0, range: 4, targets: 2, cond: ['immobilize'], type: 'magic' } as MonsterAbility,
      { name: 'Frostbite Lunge', init: 18, move: 3, atk: 1, red: true, cond: ['immobilize'] },
      { name: 'Hymn', init: 70, move: null, atk: null, heal: { n: 4, range: 0 }, shield: 1, infuse: 'holy' },
      { name: 'Frost Nova', init: 50, move: 0, atk: -1, range: 2, blue: true, cond: ['muddle'], type: 'magic' } as MonsterAbility,
      { name: 'Judgment', init: 60, move: 0, atk: 2, range: 3, type: 'holy' } as MonsterAbility,
    ],
  }),
  archmagister_tock: boss({
    id: 'archmagister_tock', name: 'Archmagister Tock', zone: 7, draw: 'boss_tock', radius: 48, elem: 'void',
    flavor: 'Keeps the Landlord’s ledger. The estate is in probate, and probate means paperwork. He has never been happier.',
    base: { hp: 11, move: 2, atk: 3, range: 3 },
    abilities: [
      { name: 'Arcane Volley', init: 35, move: 0, atk: -1, range: 4, targets: 3, type: 'void' } as MonsterAbility,
      { name: 'Laser Sweep', init: 50, move: 0, atk: 0, range: 3, blue: true },
      { name: 'Time Bubble', init: 25, move: 1, atk: 0, range: 3, cond: ['stun'], type: 'void' } as MonsterAbility,
      { name: 'Gear Dash', init: 15, move: 4, atk: 1, range: 1, red: true, jump: true },
      { name: 'Tin Reinforcements', init: 65, move: null, atk: null, summon: 'tin_soldier', text: 'Tin Soldiers march in' },
      { name: 'Chrono Lattice', init: 80, move: null, atk: null, heal: { n: 3, range: 0 }, shield: 2 },
    ],
  }),
  the_landlord: boss({
    id: 'the_landlord', name: 'The Landlord (A Notarised Copy)', zone: 8, draw: 'boss_landlord', radius: 46, elem: 'void',
    flavor: 'The real one came apart like a shredded contract. This one was photocopied from his will. The toner is still warm.',
    base: { hp: 14, move: 2, atk: 4, range: 0 },
    abilities: [
      { name: 'Briefcase Swing', init: 40, move: 1, atk: 0, push: 1 },
      { name: 'Eviction Notices', init: 30, move: 0, atk: -1, range: 4, targets: 3, type: 'void' } as MonsterAbility,
      { name: 'Void Cleave', init: 55, move: 1, atk: 2, red: true, type: 'void' } as MonsterAbility,
      { name: 'Audit', init: 45, move: 0, atk: 0, range: 3, blue: true, cond: ['muddle'], type: 'void' } as MonsterAbility,
      { name: 'Late Fee', init: 20, move: null, atk: 0, range: 5, cond: ['wound', 'poison'] },
      { name: 'Hostile Takeover', init: 70, move: null, atk: null, summon: 'bailiff', text: 'A Bailiff serves papers' },
      { name: 'Foreclosure', init: 85, move: null, atk: null, heal: { n: 5, range: 0 }, shield: 2, infuse: 'void' },
    ],
  }),
  the_executor: boss({
    id: 'the_executor', name: 'The Executor', zone: 9, draw: 'boss_executor', radius: 40, elem: 'void',
    flavor: 'Executor of the Landlord’s estate. Reads every will aloud, slowly, to a room he has locked from the outside.',
    base: { hp: 16, move: 3, atk: 4, range: 2 },
    abilities: [
      { name: 'Reading of the Will', init: 50, move: null, atk: 0, range: 5, blue: true, cond: ['muddle'], type: 'void' } as MonsterAbility,
      { name: 'Codicil', init: 25, move: 2, atk: 1, range: 1, red: true, cond: ['wound'] },
      { name: 'Probate', init: 35, move: 0, atk: -1, range: 4, targets: 4, cond: ['poison'], type: 'void' } as MonsterAbility,
      { name: 'Contest the Will', init: 15, move: 3, atk: 2, range: 1, jump: true, push: 2 },
      { name: 'Next of Kin', init: 65, move: null, atk: null, summon: 'hollow_joe', text: 'Hollow Joes claim to be relatives' },
      { name: 'Low Tide', init: 80, move: null, atk: null, heal: { n: 6, range: 0 }, shield: 2, infuse: 'void' },
      { name: 'Small Print', init: 40, move: 1, atk: 0, range: 3, cond: ['stun'], type: 'void' } as MonsterAbility,
    ],
  }),
};

export function monsterDef(id: string): MonsterDef {
  return MONSTERS[id] ?? BOSSES[id] ?? MONSTERS['shambler']!;
}

/** The stat line of a monster at a scenario level (0–7). */
export function monsterStat(def: MonsterDef, level: number, elite: boolean, heroes: number): MonsterStat {
  const b = def.base;
  if (def.boss) {
    return {
      hp: Math.round((b.hp + level * 3) * Math.max(2, heroes)),
      move: b.move,
      atk: b.atk + Math.floor(level * 0.6),
      range: b.range,
      ...(b.shield ? { shield: b.shield + (level >= 5 ? 1 : 0) } : {}),
    };
  }
  let hp = Math.round(b.hp * (1 + 0.28 * level));
  let atk = b.atk + Math.floor(level * 0.6);
  let move = b.move ? b.move + (level >= 5 ? 1 : 0) : 0;
  let range = b.range;
  let shield = (b.shield ?? 0) + (b.shield && level >= 4 ? 1 : 0);
  let retaliate = 0;
  if (elite) {
    hp = Math.round(hp * 1.6) + 1;
    atk += 1;
    if (range) range += 1;
    if (def.role === 'tank' || def.role === 'brute') shield += 1;
    if (def.role === 'brute' || def.role === 'hazard') retaliate = 1 + Math.floor(level / 4);
    if (move) move += def.role === 'assassin' ? 1 : 0;
  }
  return { hp: Math.max(1, hp), move, atk, range, ...(shield ? { shield } : {}), ...(retaliate ? { retaliate } : {}) };
}

// ------------------------------------------------------------------ hero summons (Dungeon Joe art, on our side)

export const SUMMONS: Record<string, SummonDef> = {
  glow_turret: { id: 'glow_turret', name: 'Glowen Turret', draw: 'citadel_gear_turret', radius: 20, hp: 4, move: 0, atk: 2, range: 3 },
  tin_helper: { id: 'tin_helper', name: 'Tin Apprentice', draw: 'citadel_tin_soldier', radius: 17, hp: 5, move: 2, atk: 2, range: 0 },
  bellows_buddy: { id: 'bellows_buddy', name: 'Retired Bellows Brute', draw: 'forge_bellows', radius: 30, hp: 8, move: 2, atk: 3, range: 0, shield: 1 },
  hound: { id: 'hound', name: 'Good Boy', draw: 'caverns_hound', radius: 18, hp: 5, move: 3, atk: 2, range: 0, cond: ['wound'] },
  pyre_wisp: { id: 'pyre_wisp', name: 'Pyre Wisp', draw: 'crypt_wisp', radius: 14, hp: 3, move: 3, atk: 1, range: 2, healer: 1 },
  intern: { id: 'intern', name: 'Unpaid Intern', draw: 'citadel_butler', radius: 18, hp: 4, move: 2, atk: 1, range: 0, cond: ['muddle'] },
  eel: { id: 'eel', name: 'Pet Fuse Eel', draw: 'sewers_eel', radius: 16, hp: 3, move: 3, atk: 2, range: 0, cond: ['disarm'] },
  moths: { id: 'moths', name: 'Lamp Moths', draw: 'reliquary_rime_moth', radius: 9, hp: 2, move: 4, atk: 1, range: 0, cond: ['immobilize'] },
  gary: { id: 'gary', name: 'Gary', draw: 'gary_pedlar', radius: 22, hp: 7, move: 0, atk: 0, range: 0, shield: 1, healer: 2 },
};

/** Which monster a boss's "summon" ability brings, and what a regular monster's "summon help" brings (its own zone's fodder). */
export function summonFor(monster: MonsterDef, ability: MonsterAbility): string {
  if (ability.summon && ability.summon !== '__pack__') return ability.summon;
  const zone = ZONE_MONSTERS[monster.zone] ?? ZONE_MONSTERS[1]!;
  const fodder = zone.filter((id) => MONSTERS[id]!.role === 'fodder' && id !== monster.id);
  return fodder[0] ?? monster.id;
}
