// Gary's stall in the boiler room. Spent items come back on a long rest; consumed items come back after the scenario.
// Gary stocks an item once the campaign has reached its Depth (or the union's prosperity has, see the Boiler), so the
// stall fills up slowly on the way down. Chests in a Depth can also hold anything Gary would stock there.
//
// What an item does is data (`fx`): the engine reads these fields, it never special-cases an item by id.
import type { Cond, Elem } from '../game/types';

export interface ItemEffect {
  // ---- used on your turn
  heal?: number;
  /** remove every negative condition */
  cure?: boolean;
  /** return this many cards from the discard pile to the hand */
  recover?: number;
  shield?: number;
  retaliate?: number;
  infuse?: Elem[];
  /** gain these positive conditions */
  self?: Cond[];
  /** shuffle this many Bless cards into your own modifier deck */
  bless?: number;
  /** refresh your other spent items */
  refresh?: boolean;
  /** pick up coins and chests within this range */
  loot?: number;
  // ---- used during a move
  move?: number;
  jump?: boolean;
  // ---- added to your next attack
  atk?: number;
  pierce?: number;
  push?: number;
  cond?: Cond[];
  adv?: boolean;
  // ---- passive (worn)
  maxHp?: number;
  /** hazards and traps do not hurt you */
  hazardProof?: boolean;
  /** monster ×2 modifiers count as +0 against you */
  noCrit?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  slot: 'head' | 'body' | 'legs' | 'hand' | 'small';
  cost: number;
  use: 'spent' | 'consumed' | 'passive';
  text: string;
  /** when the item can be used: 'turn' any time on your turn, 'move' during a move, 'attack' before an attack */
  when?: 'turn' | 'move' | 'attack';
  /** the depth at which Gary starts stocking it */
  depth: number;
  /** a small picture for the inventory grid */
  icon?: string;
  fx: ItemEffect;
}

export const ITEMS: Record<string, ItemDef> = {};
const I = (d: ItemDef): void => void (ITEMS[d.id] = d);

// ---------------------------------------------------------------- Depth 1: the stairs
I({ id: 'thermos', icon: '☕', name: 'Joe’s Spare Thermos', slot: 'small', cost: 15, use: 'spent', when: 'turn', depth: 1, text: 'Heal 3. It is mostly tea.', fx: { heal: 3 } });
I({ id: 'potion_heal', icon: '🧪', name: 'Minor Glowen Tonic', slot: 'small', cost: 10, use: 'consumed', when: 'turn', depth: 1, text: 'Heal 3.', fx: { heal: 3 } });
I({ id: 'potion_stamina', icon: '🍵', name: 'Strong Builder’s Tea', slot: 'small', cost: 15, use: 'consumed', when: 'turn', depth: 1, text: 'Return 2 cards from your discard pile to your hand.', fx: { recover: 2 } });
I({ id: 'boots', icon: '👢', name: 'Wellies of Striding', slot: 'legs', cost: 20, use: 'spent', when: 'move', depth: 1, text: '+2 Move on one move.', fx: { move: 2 } });
I({ id: 'leather', icon: '🦺', name: 'Boiler Suit', slot: 'body', cost: 20, use: 'spent', when: 'turn', depth: 1, text: 'Shield 1 this round.', fx: { shield: 1 } });
I({ id: 'hardhat', icon: '⛑️', name: 'Hard Hat', slot: 'head', cost: 20, use: 'passive', depth: 1, text: '+2 maximum HP.', fx: { maxHp: 2 } });
I({ id: 'crowbar', icon: '🔧', name: 'Rusty Crowbar', slot: 'hand', cost: 15, use: 'spent', when: 'attack', depth: 1, text: '+1 Attack on one attack.', fx: { atk: 1 } });
I({ id: 'lantern', icon: '🏮', name: 'Glowen Lantern', slot: 'small', cost: 20, use: 'spent', when: 'turn', depth: 1, text: 'Infuse Holy.', fx: { infuse: ['holy'] } });
I({ id: 'plaster', icon: '🩹', name: 'Box of Plasters', slot: 'small', cost: 10, use: 'consumed', when: 'turn', depth: 1, text: 'Remove every negative condition, then Heal 1. Some of them are cartoon ones.', fx: { cure: true, heal: 1 } });
I({ id: 'fishing_net', icon: '🥅', name: 'Old Fishing Net', slot: 'hand', cost: 20, use: 'spent', when: 'attack', depth: 1, text: 'Your next attack applies Immobilize.', fx: { cond: ['immobilize'] } });

// ---------------------------------------------------------------- Depth 2
I({ id: 'wellies', icon: '🥾', name: 'Industrial Wellies', slot: 'legs', cost: 25, use: 'passive', depth: 2, text: 'Hazards and traps do not hurt you.', fx: { hazardProof: true } });
I({ id: 'iron_helm', icon: '🪖', name: 'Bucket Helm', slot: 'head', cost: 25, use: 'passive', depth: 2, text: 'Monster ×2 modifiers count as +0 against you.', fx: { noCrit: true } });
I({ id: 'poison_dagger', icon: '🗡️', name: 'Sewer Shiv', slot: 'hand', cost: 20, use: 'spent', when: 'attack', depth: 2, text: 'Your next attack applies Poison.', fx: { cond: ['poison'] } });
I({ id: 'spoon', icon: '🥄', name: 'Gary’s Lucky Spoon', slot: 'hand', cost: 25, use: 'spent', when: 'attack', depth: 2, text: 'Advantage on your next attack.', fx: { adv: true } });
I({ id: 'ember_jar', icon: '🔥', name: 'Jar of Embers', slot: 'small', cost: 20, use: 'spent', when: 'turn', depth: 2, text: 'Infuse Fire.', fx: { infuse: ['fire'] } });
I({ id: 'knuckles', icon: '👊', name: 'Brass Knuckles', slot: 'hand', cost: 25, use: 'spent', when: 'attack', depth: 2, text: '+1 Attack and Pierce 2 on your next attack.', fx: { atk: 1, pierce: 2 } });
I({ id: 'smelling_salts', icon: '🧂', name: 'Smelling Salts', slot: 'small', cost: 20, use: 'consumed', when: 'turn', depth: 2, text: 'Remove every negative condition and gain Strengthen.', fx: { cure: true, self: ['strengthen'] } });

// ---------------------------------------------------------------- Depth 3
I({ id: 'flippers', icon: '🩴', name: 'Diver’s Flippers', slot: 'legs', cost: 30, use: 'spent', when: 'move', depth: 3, text: 'One move becomes a Jump.', fx: { jump: true } });
I({ id: 'eel_battery', icon: '🔋', name: 'Eel Battery', slot: 'small', cost: 20, use: 'spent', when: 'turn', depth: 3, text: 'Infuse Magic.', fx: { infuse: ['magic'] } });
I({ id: 'union_card', icon: '🪪', name: 'Union Card', slot: 'small', cost: 35, use: 'consumed', when: 'turn', depth: 3, text: 'Gain Strengthen and Regenerate.', fx: { self: ['strengthen', 'regenerate'] } });
I({ id: 'boathook', icon: '🪝', name: 'Boathook', slot: 'hand', cost: 30, use: 'spent', when: 'attack', depth: 3, text: '+1 Attack and Push 2 on your next attack.', fx: { atk: 1, push: 2 } });
I({ id: 'jumper', icon: '🧶', name: 'Nan’s Fisherman’s Jumper', slot: 'body', cost: 30, use: 'passive', depth: 3, text: '+3 maximum HP. Itchy in a protective way.', fx: { maxHp: 3 } });
I({ id: 'toolbox', icon: '🧰', name: 'Gary’s Toolbox', slot: 'small', cost: 40, use: 'consumed', when: 'turn', depth: 3, text: 'Refresh all your other spent items.', fx: { refresh: true } });

// ---------------------------------------------------------------- Depth 4
I({ id: 'plate', icon: '🛡️', name: 'Second-hand Plate', slot: 'body', cost: 40, use: 'spent', when: 'turn', depth: 4, text: 'Shield 2 this round.', fx: { shield: 2 } });
I({ id: 'whistle', icon: '📯', name: 'The Instructor’s Whistle', slot: 'hand', cost: 30, use: 'spent', when: 'attack', depth: 4, text: 'Your next attack applies Stun.', fx: { cond: ['stun'] } });
I({ id: 'mirror_shard', icon: '🪞', name: 'Mirror Shard', slot: 'hand', cost: 35, use: 'spent', when: 'attack', depth: 4, text: 'Advantage on your next attack, and it applies Muddle.', fx: { adv: true, cond: ['muddle'] } });
I({ id: 'fog_horn', icon: '📢', name: 'Fog Horn', slot: 'small', cost: 35, use: 'consumed', when: 'turn', depth: 4, text: 'Gain Invisible. Everyone looks at the noise instead.', fx: { self: ['invisible'] } });
I({ id: 'diving_helmet', icon: '🤿', name: 'Brass Diving Helmet', slot: 'head', cost: 40, use: 'passive', depth: 4, text: '+3 maximum HP.', fx: { maxHp: 3 } });

// ---------------------------------------------------------------- Depth 5
I({ id: 'ink_pot', icon: '🖋️', name: 'Pot of Small Print', slot: 'small', cost: 20, use: 'spent', when: 'turn', depth: 5, text: 'Infuse Void.', fx: { infuse: ['void'] } });
I({ id: 'candle', icon: '🕯️', name: 'Blessed Candle Stub', slot: 'small', cost: 35, use: 'consumed', when: 'turn', depth: 5, text: 'Bless 2 (yourself).', fx: { bless: 2 } });
I({ id: 'chainmail', icon: '⛓️', name: 'Chain Mail Vest', slot: 'body', cost: 45, use: 'spent', when: 'turn', depth: 5, text: 'Shield 2 and Retaliate 1 this round.', fx: { shield: 2, retaliate: 1 } });
I({ id: 'keyring', icon: '🗝️', name: 'The Landlord’s Keyring', slot: 'small', cost: 40, use: 'spent', when: 'turn', depth: 5, text: 'Loot 2: pick up coins and chests within 2.', fx: { loot: 2 } });

// ---------------------------------------------------------------- Depth 6
I({ id: 'barnacle_shield', icon: '🐚', name: 'Barnacle Shield', slot: 'hand', cost: 45, use: 'spent', when: 'turn', depth: 6, text: 'Shield 3 this round.', fx: { shield: 3 } });
I({ id: 'boiler_gloves', icon: '🧤', name: 'Boiler Gloves', slot: 'hand', cost: 40, use: 'spent', when: 'attack', depth: 6, text: '+2 Attack on your next attack.', fx: { atk: 2 } });
I({ id: 'tide_boots', icon: '🌊', name: 'Riptide Boots', slot: 'legs', cost: 45, use: 'spent', when: 'move', depth: 6, text: '+3 Move and Jump on one move.', fx: { move: 3, jump: true } });
I({ id: 'pressure_valve', icon: '♨️', name: 'Pressure Valve', slot: 'small', cost: 40, use: 'spent', when: 'turn', depth: 6, text: 'Infuse Fire and Magic.', fx: { infuse: ['fire', 'magic'] } });

// ---------------------------------------------------------------- Depth 7
I({ id: 'major_tonic', icon: '⚗️', name: 'Major Glowen Tonic', slot: 'small', cost: 45, use: 'consumed', when: 'turn', depth: 7, text: 'Heal 6 and remove every negative condition.', fx: { heal: 6, cure: true } });
I({ id: 'void_lens', icon: '🔮', name: 'Void Lens Monocle', slot: 'head', cost: 50, use: 'spent', when: 'attack', depth: 7, text: '+1 Attack and Pierce 3 on your next attack.', fx: { atk: 1, pierce: 3 } });
I({ id: 'rent_book', icon: '📕', name: 'Rent Book (Unpaid)', slot: 'small', cost: 45, use: 'consumed', when: 'turn', depth: 7, text: 'Return 3 cards from your discard pile to your hand.', fx: { recover: 3 } });
I({ id: 'stilts', icon: '🦩', name: 'Wading Stilts', slot: 'legs', cost: 50, use: 'passive', depth: 7, text: 'Hazards and traps do not hurt you, and +1 maximum HP.', fx: { hazardProof: true, maxHp: 1 } });

// ---------------------------------------------------------------- Depth 8
I({ id: 'storm_coat', icon: '🧥', name: 'Storm Coat', slot: 'body', cost: 55, use: 'spent', when: 'turn', depth: 8, text: 'Shield 1 and Retaliate 3 this round.', fx: { shield: 1, retaliate: 3 } });
I({ id: 'anchor', icon: '⚓', name: 'Small Anchor', slot: 'hand', cost: 60, use: 'spent', when: 'attack', depth: 8, text: '+2 Attack, Push 2 and Immobilize on your next attack.', fx: { atk: 2, push: 2, cond: ['immobilize'] } });
I({ id: 'pearl_charm', icon: '🦪', name: 'Black Pearl Charm', slot: 'head', cost: 60, use: 'passive', depth: 8, text: '+4 maximum HP, and monster ×2 modifiers count as +0 against you.', fx: { maxHp: 4, noCrit: true } });

// ---------------------------------------------------------------- Depth 9: the bottom of the Shoal
I({ id: 'glowen_heart', icon: '💚', name: 'Glowen Heart', slot: 'small', cost: 70, use: 'consumed', when: 'turn', depth: 9, text: 'Heal 8, Bless 1 and gain Strengthen.', fx: { heal: 8, bless: 1, self: ['strengthen'] } });
I({ id: 'deed', icon: '📜', name: 'Deed to the Building', slot: 'small', cost: 75, use: 'consumed', when: 'turn', depth: 9, text: 'Gain Invisible and Regenerate, and return 2 discarded cards to your hand. Technically you own the place now.', fx: { self: ['invisible', 'regenerate'], recover: 2 } });
I({ id: 'executioner_axe', icon: '🪓', name: 'The Executor’s Spare Axe', slot: 'hand', cost: 80, use: 'spent', when: 'attack', depth: 9, text: '+3 Attack and Wound on your next attack.', fx: { atk: 3, cond: ['wound'] } });

export const ITEM_IDS = Object.keys(ITEMS);

/** small-item slots by level */
export function smallSlots(level: number): number {
  return Math.ceil(level / 2);
}

/** Does this hero wear something with this passive effect? */
export function wears(items: readonly { id: string }[], key: 'hazardProof' | 'noCrit'): boolean {
  return items.some((i) => !!ITEMS[i.id]?.fx[key]);
}
