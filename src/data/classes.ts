// The fourteen classes: Dungeon Joe's ten (same names, same looks, same jokes) and four new ones from the Shoal.
// Four start unlocked; the rest unlock through Tasks (src/data/tasks.ts).
import type { JoeLook } from '../draw/players';
import type { Elem } from '../game/types';

export interface ClassDef {
  id: string;
  name: string;
  /** a one-line role summary on the class picker */
  role: string;
  blurb: string;
  /** max HP at levels 1–5 */
  hp: number[];
  /** hand size: how many cards come into a scenario */
  hand: number;
  elem: Elem | null;
  look: JoeLook;
  weapon: string;
  off?: { kind: 'shield' | 'tool' | 'weapon'; draw: string };
  twoHanded?: boolean;
  start: boolean;
  /** banner colour on cards and the HUD */
  color: string;
  /** the perk list: [text, spec]; spec "-a,b;+c,d" removes then adds modifier cards (see game/mods.ts) */
  perks: [string, string][];
  isNew?: boolean;
}

const LOW = [6, 7, 8, 9, 10];
const MED = [8, 9, 11, 12, 14];
const HIGH = [10, 12, 14, 16, 18];

const COMMON: [string, string][] = [
  ['Remove two −1 cards', '--1,-1'],
  ['Remove two −1 cards', '--1,-1'],
  ['Replace one −2 card with one +0 card', '--2;+0'],
  ['Replace one +0 card with one +2 card', '-0;+2'],
];

export const CLASSES: Record<string, ClassDef> = {
  knight: {
    id: 'knight', name: 'Knight', role: 'Tank · shields allies · punishes anyone who swings at him', start: true, color: '#4a6aa0', elem: 'holy',
    blurb: 'Took the job for the armour. The job came with stairs. Then a sea.',
    hp: HIGH, hand: 10, weapon: 'w_longsword', off: { kind: 'shield', draw: 's_round' },
    look: { skin: '#e8c9a0', hair: '#5a3a22', head: 'helm', headStyle: 'nasal', headColor: '#9aa3ad', body: 'chain', bodyColor: '#8a929c', trim: '#c9b98a', legsColor: '#5a5f6a', hairStyle: 'short', beard: 'stubble', over: 'tabard', overColor: '#4a6aa0', emblem: 'cross', emblemColor: '#e6d9a8', pauldrons: 'round', legs: 'chausses', belt: '#5a3a22' },
    perks: [...COMMON, ['Add two +1 cards', '+1,1'], ['Add one +1 Shield 1 card', '+1s'], ['Add two +1 Holy cards', '+1h,1h'], ['Add one +2 Muddle card', '+2muddle']],
  },
  brute: {
    id: 'brute', name: 'Brute', role: 'Heavy melee · pushes · stuns · hits hard and often', start: true, color: '#9a5a2a', elem: null,
    blurb: 'Solves things. Usually with a hammer. Occasionally with a slightly larger hammer.',
    hp: HIGH, hand: 10, weapon: 'w_greathammer', twoHanded: true,
    look: { skin: '#d9b088', hair: '#2a1a10', head: 'none', headColor: '#a07a4a', body: 'leather', bodyColor: '#7a4a2a', trim: '#a07a4a', legsColor: '#4a3a2a', hairStyle: 'bald', beard: 'full', pauldrons: 'fur', belt: '#3a2414', legs: 'trousers', texture: 'studs' },
    perks: [...COMMON, ['Add one +3 card', '+3'], ['Add two +1 Push 1 cards', '+1p,1p'], ['Add one +0 Stun card', '+0stun'], ['Add two rolling +1 cards', '+r1,r1']],
  },
  duelist: {
    id: 'duelist', name: 'Duelist', role: 'Fast melee · strikes twice · vanishes · big hand of cards', start: true, color: '#a02030', elem: 'void',
    blurb: 'Has never been hit. Says so. Has been hit several times since saying so.',
    hp: LOW, hand: 12, weapon: 'w_daggers', twoHanded: true,
    look: { skin: '#f0d0b0', hair: '#1a1a1a', head: 'bandana', headColor: '#a02030', body: 'leather', bodyColor: '#7a2a3a', trim: '#e6b84a', legsColor: '#2a2a3a', hairStyle: 'slick', beard: 'moustache', cape: '#a02030', capeStyle: 'short', belt: '#1a1a1a', legs: 'boots' },
    perks: [...COMMON, ['Add two rolling +1 cards', '+r1,r1'], ['Add two +1 Wound cards', '+1wound,1wound'], ['Add one +1 Invisible card', '+1invisible'], ['Add two +1 Void cards', '+1v,1v']],
  },
  scholar: {
    id: 'scholar', name: 'Scholar', role: 'Ranged magic · area spells · elements · fragile', start: true, color: '#3a4a8a', elem: 'magic',
    blurb: 'Read about dungeons once. Has now read about seas. Has brought the book.',
    hp: LOW, hand: 10, weapon: 'w_rapier', off: { kind: 'tool', draw: 't_staff_arcane' },
    look: { skin: '#f0d8b8', hair: '#8a6a3a', head: 'wizard', headColor: '#3a4a8a', body: 'robe', bodyColor: '#3a4a8a', trim: '#e6b84a', legsColor: '#2a2a3a', hairStyle: 'long', beard: 'goatee', emblem: 'star', emblemColor: '#e6b84a', belt: '#e6b84a', legs: 'slippers' },
    perks: [...COMMON, ['Add two +1 Magic cards', '+1m,1m'], ['Add two +1 Fire cards', '+1f,1f'], ['Add one +2 Immobilize card', '+2immobilize'], ['Add one +1 Heal 2 card', '+1heal']],
  },
  cleric: {
    id: 'cleric', name: 'Pyre Priest', role: 'Healer · fire and holy · blesses allies, burns the rest', start: false, color: '#c8401a', elem: 'fire',
    blurb: 'Heals the faithful. Cremates the rest. Same sermon either way.',
    hp: MED, hand: 11, weapon: 'w_censer', off: { kind: 'tool', draw: 't_talisman_sun' },
    look: { skin: '#e8c9a0', hair: '#c0c0c0', head: 'mitre', headColor: '#c8401a', body: 'robe', bodyColor: '#9a2a1a', trim: '#ff9a2a', legsColor: '#3a2420', hairStyle: 'bald', beard: 'full', emblem: 'flame', emblemColor: '#ffb84a', belt: '#ffb84a', over: 'stole', overColor: '#ffb84a' },
    perks: [...COMMON, ['Add two +1 Fire cards', '+1f,1f'], ['Add two +1 Holy cards', '+1h,1h'], ['Add one +1 Heal 2 card', '+1heal'], ['Add two rolling Heal 1 cards', '+r0heal,r0heal']],
  },
  spearman: {
    id: 'spearman', name: 'Battlemage', role: 'Hybrid · sword the size of a shelf · magic infusions', start: false, color: '#34508a', elem: 'magic',
    blurb: 'Read one book on magic. Hit the librarian with a sword the size of the shelf.',
    hp: MED, hand: 10, weapon: 'w_colossal', twoHanded: true,
    look: { skin: '#d8b090', hair: '#3a2a1a', head: 'wizard', headColor: '#2a3a6a', body: 'chain', bodyColor: '#5a6a8a', trim: '#8fd3ff', legsColor: '#2a2a3a', hairStyle: 'topknot', beard: 'full', emblem: 'star', emblemColor: '#8fd3ff', glow: '#8fd3ff', pauldrons: 'layered', legs: 'greaves' },
    perks: [...COMMON, ['Add two +1 Magic cards', '+1m,1m'], ['Add one +2 Magic card', '+2m'], ['Add two +1 Push 1 cards', '+1p,1p'], ['Add one +1 Shield 1 card', '+1s']],
  },
  hunter: {
    id: 'hunter', name: 'Hunter', role: 'Ranged physical · traps · a very good dog', start: false, color: '#3a5a2a', elem: null,
    blurb: 'Can track anything. Mostly tracks in mud. The Shoal is all mud.',
    hp: MED, hand: 11, weapon: 'w_bow', twoHanded: true,
    look: { skin: '#e0b890', hair: '#6a3a1a', head: 'hood', headStyle: 'ranger', headColor: '#3a5a2a', body: 'leather', bodyColor: '#3a5a2a', trim: '#a0803a', legsColor: '#3a3020', hairStyle: 'short', beard: 'stubble', cape: '#2e4a22', capeStyle: 'tattered', extra: 'quiver', belt: '#3a2a1a', legs: 'boots' },
    perks: [...COMMON, ['Add two rolling +1 cards', '+r1,r1'], ['Add two +1 Wound cards', '+1wound,1wound'], ['Add one +1 Immobilize card', '+1immobilize'], ['Add one +2 card', '+2']],
  },
  occultist: {
    id: 'occultist', name: 'Zealot', role: 'Holy melee · trades health for power · sunrays', start: false, color: '#d8b84a', elem: 'holy',
    blurb: 'Up at five to pray. Up at five past to stab whoever was not.',
    hp: MED, hand: 10, weapon: 'w_katana', off: { kind: 'tool', draw: 't_talisman_silver' },
    look: { skin: '#d8c0b0', hair: '#e8d8a0', head: 'hood', headStyle: 'deep', headColor: '#d8c8a0', eyeGlow: '#ffd27a', body: 'robe', bodyColor: '#efe6d2', trim: '#e6b84a', legsColor: '#5a4a2a', hairStyle: 'long', emblem: 'sun', emblemColor: '#e6b84a', belt: '#e6b84a' },
    perks: [...COMMON, ['Add two +1 Holy cards', '+1h,1h'], ['Add one +2 Holy card', '+2h'], ['Add two rolling Heal 1 cards', '+r0heal,r0heal'], ['Add one +1 Stun card', '+1stun']],
  },
  berserker: {
    id: 'berserker', name: 'Berserker', role: 'Reckless melee · stronger when hurt · heals by hitting', start: false, color: '#a03a1a', elem: 'fire',
    blurb: 'Was asked to calm down once. Once. Has never been asked to count.',
    hp: HIGH, hand: 10, weapon: 'w_twinaxes', twoHanded: true,
    look: { skin: '#e0b088', hair: '#a03a1a', head: 'horned', headColor: '#7a7f88', body: 'leather', bodyColor: '#5a2a1a', trim: '#c9b98a', legsColor: '#3a2a1a', hairStyle: 'braids', beard: 'braided', pauldrons: 'fur', mark: 'warpaint', belt: '#2a1a10', legs: 'wraps' },
    perks: [...COMMON, ['Add two rolling +2 cards', '+r2,r2'], ['Add one +1 Fire card', '+1f'], ['Add two +1 Wound cards', '+1wound,1wound'], ['Add one +3 card', '+3']],
  },
  nobody: {
    id: 'nobody', name: 'Nobody', role: 'Joe · a bit of everything · big Thermos', start: false, color: '#9a8a7a', elem: null,
    blurb: 'Joe. Just Joe. He came down for the fuse box. Again.',
    hp: MED, hand: 10, weapon: 'w_club',
    look: { skin: '#e8c9a0', hair: '#4a3626', head: 'none', headColor: '#c9b98a', body: 'bathrobe', bodyColor: '#9a8a7a', trim: '#c9b98a', legsColor: '#8a6a3a', hairStyle: 'messy', beard: 'stubble', legs: 'slippers' },
    perks: [...COMMON, ['Add one +2 card', '+2'], ['Add two rolling +1 cards', '+r1,r1'], ['Add one +1 Heal 2 card', '+1heal'], ['Remove one −1 card and add one +1 card', '--1;+1']],
  },
  // ---------------------------------------------------------------- new in Shoallhell
  diver: {
    id: 'diver', name: 'Shoal Diver', role: 'Harpoon control · pulls · walks through hazards', start: false, color: '#2f7a8a', elem: 'magic', isNew: true,
    blurb: 'Went down in 1874 to fix a leak. Came back up last Tuesday with the leak in a jar.',
    hp: MED, hand: 10, weapon: 'w_spear', twoHanded: true,
    look: { skin: '#d8b090', hair: '#3a2a1a', head: 'greathelm', headStyle: 'bucket', headColor: '#b8893a', visor: 'grille', eyeGlow: '#7cc4ff', body: 'leather', bodyColor: '#2f5a6a', trim: '#b8893a', legsColor: '#2a3a40', extra: 'boiler', metal: '#b8893a', legs: 'waders', bootColor: '#3a2a1a', hands: 'glove' },
    perks: [...COMMON, ['Add two +1 Immobilize cards', '+1immobilize,1immobilize'], ['Add two +1 Magic cards', '+1m,1m'], ['Add one +2 Push 2 card', '+2p'], ['Add two rolling +1 cards', '+r1,r1']],
  },
  notary: {
    id: 'notary', name: 'Notary', role: 'Debuffer · curses · stamps conditions on everything', start: false, color: '#4a4058', elem: 'void', isNew: true,
    blurb: 'Defected from the Landlord’s office with a stamp, a whip of red tape and everyone’s paperwork.',
    hp: LOW, hand: 11, weapon: 'w_whip', off: { kind: 'tool', draw: 't_relic' },
    look: { skin: '#e8d0b8', hair: '#2a2420', head: 'bowler', headColor: '#1a1a1a', body: 'suit', bodyColor: '#2a2a33', trim: '#b02020', legsColor: '#22222a', hairStyle: 'slick', brows: 'worried', over: 'vest', overColor: '#4a4058', extra: 'tie', legs: 'slacks', bootColor: '#111' },
    perks: [...COMMON, ['Add two +1 Muddle cards', '+1muddle,1muddle'], ['Add two +1 Void cards', '+1v,1v'], ['Add one +0 Stun card', '+0stun'], ['Add two +1 Poison cards', '+1poison,1poison']],
  },
  glowsmith: {
    id: 'glowsmith', name: 'Glowsmith', role: 'Summoner · builds turrets and helpers · fire', start: false, color: '#d07a1a', elem: 'fire', isNew: true,
    blurb: 'Quit the Forge on the day Ignatius clocked out. Still has the keys. Still has the overtime.',
    hp: MED, hand: 10, weapon: 'w_mace',
    look: { skin: '#c89070', hair: '#1a1410', head: 'cap', headStyle: 'goggles', headColor: '#5a3a22', body: 'leather', bodyColor: '#5a3a22', trim: '#d4af37', legsColor: '#3a2a1a', hairStyle: 'curly', beard: 'full', female: true, over: 'apron', overColor: '#3a2a1a', hands: 'glove', extra: 'pouches', glow: '#ffb84a', legs: 'boots' },
    perks: [...COMMON, ['Add two +1 Fire cards', '+1f,1f'], ['Add one +1 Shield 1 card', '+1s'], ['Add two +1 cards', '+1,1'], ['Add one +2 Fire card', '+2f']],
  },
  lamplighter: {
    id: 'lamplighter', name: 'Lamplighter', role: 'Support · light and holy fire · long reach · keeps everyone moving', start: false, color: '#e0b030', elem: 'holy', isNew: true,
    blurb: 'Lit every lamp in Joe’s building for thirty years. Someone has to light the Shoal.',
    hp: MED, hand: 11, weapon: 'w_dawn_glaive', twoHanded: true,
    look: { skin: '#a8724a', hair: '#e8e8e0', head: 'hood', headStyle: 'pointed', headColor: '#3a3a5a', body: 'cloak', bodyColor: '#3a3a5a', trim: '#e0b030', legsColor: '#2a2a3a', hairStyle: 'ponytail', female: true, cape: '#2a2a4a', capeLining: '#e0b030', capeStyle: 'full', glow: '#ffe98a', legs: 'boots' },
    perks: [...COMMON, ['Add two +1 Holy cards', '+1h,1h'], ['Add one +1 Heal 2 card', '+1heal'], ['Add two rolling +1 cards', '+r1,r1'], ['Add one +2 Holy card', '+2h']],
  },
};

export const CLASS_IDS = Object.keys(CLASSES);

/** XP needed to reach levels 2–5. */
export const XP_LEVELS = [0, 45, 95, 150, 210];
export const MAX_LEVEL = 5;

export function levelForXp(xp: number): number {
  let l = 1;
  for (let i = 1; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i]!) l = i + 1;
  return Math.min(MAX_LEVEL, l);
}
