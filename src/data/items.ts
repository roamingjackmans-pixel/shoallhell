// Gary's stall in the boiler room. Spent items come back on a long rest; consumed items come back after the scenario.
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
}

export const ITEMS: Record<string, ItemDef> = {};
const I = (d: ItemDef): void => void (ITEMS[d.id] = d);

I({ id: 'thermos', icon: '☕', name: 'Joe’s Spare Thermos', slot: 'small', cost: 15, use: 'spent', when: 'turn', depth: 1, text: 'Heal 3. It is mostly tea.' });
I({ id: 'potion_heal', icon: '🧪', name: 'Minor Glowen Tonic', slot: 'small', cost: 10, use: 'consumed', when: 'turn', depth: 1, text: 'Heal 3.' });
I({ id: 'potion_stamina', icon: '🍵', name: 'Strong Builder’s Tea', slot: 'small', cost: 15, use: 'consumed', when: 'turn', depth: 1, text: 'Return 2 cards from your discard pile to your hand.' });
I({ id: 'boots', icon: '👢', name: 'Wellies of Striding', slot: 'legs', cost: 20, use: 'spent', when: 'move', depth: 1, text: '+2 Move on one move.' });
I({ id: 'wellies', icon: '🥾', name: 'Industrial Wellies', slot: 'legs', cost: 25, use: 'passive', depth: 2, text: 'Hazards and traps do not hurt you.' });
I({ id: 'flippers', icon: '🩴', name: 'Diver’s Flippers', slot: 'legs', cost: 30, use: 'spent', when: 'move', depth: 3, text: 'One move becomes a Jump.' });
I({ id: 'leather', icon: '🦺', name: 'Boiler Suit', slot: 'body', cost: 20, use: 'spent', when: 'turn', depth: 1, text: 'Shield 1 this round.' });
I({ id: 'plate', icon: '🛡️', name: 'Second-hand Plate', slot: 'body', cost: 40, use: 'spent', when: 'turn', depth: 4, text: 'Shield 2 this round.' });
I({ id: 'hardhat', icon: '⛑️', name: 'Hard Hat', slot: 'head', cost: 20, use: 'passive', depth: 1, text: '+2 maximum HP.' });
I({ id: 'iron_helm', icon: '🪖', name: 'Bucket Helm', slot: 'head', cost: 25, use: 'passive', depth: 2, text: 'Monster ×2 modifiers count as +0 against you.' });
I({ id: 'crowbar', icon: '🔧', name: 'Rusty Crowbar', slot: 'hand', cost: 15, use: 'spent', when: 'attack', depth: 1, text: '+1 Attack on one attack.' });
I({ id: 'poison_dagger', icon: '🗡️', name: 'Sewer Shiv', slot: 'hand', cost: 20, use: 'spent', when: 'attack', depth: 2, text: 'Your next attack applies Poison.' });
I({ id: 'spoon', icon: '🥄', name: 'Gary’s Lucky Spoon', slot: 'hand', cost: 25, use: 'spent', when: 'attack', depth: 2, text: 'Advantage on your next attack.' });
I({ id: 'lantern', icon: '🏮', name: 'Glowen Lantern', slot: 'small', cost: 20, use: 'spent', when: 'turn', depth: 1, text: 'Infuse Holy.' });
I({ id: 'ember_jar', icon: '🔥', name: 'Jar of Embers', slot: 'small', cost: 20, use: 'spent', when: 'turn', depth: 2, text: 'Infuse Fire.' });
I({ id: 'eel_battery', icon: '🔋', name: 'Eel Battery', slot: 'small', cost: 20, use: 'spent', when: 'turn', depth: 3, text: 'Infuse Magic.' });
I({ id: 'ink_pot', icon: '🖋️', name: 'Pot of Small Print', slot: 'small', cost: 20, use: 'spent', when: 'turn', depth: 5, text: 'Infuse Void.' });
I({ id: 'union_card', icon: '🪪', name: 'Union Card', slot: 'small', cost: 35, use: 'consumed', when: 'turn', depth: 3, text: 'Gain Strengthen and Regenerate.' });
I({ id: 'whistle', icon: '📯', name: 'The Instructor’s Whistle', slot: 'hand', cost: 30, use: 'spent', when: 'attack', depth: 4, text: 'Your next attack applies Stun.' });

export const ITEM_IDS = Object.keys(ITEMS);

/** small-item slots by level */
export function smallSlots(level: number): number {
  return Math.ceil(level / 2);
}
