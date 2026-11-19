// The inventory, Dungeon Joe style: a paper doll with equipment slots around the hero, and a bag of everything else
// they own. Click an item in the bag to equip it (swapping out whatever was in that slot); click a worn item to take it
// off. Only equipped items come into a scenario.
//   Helmet · Chest · Shoes · two Hands (one with a two-handed weapon) · Potions & utility (half the level, rounded up)
import { CLASSES, MAX_LEVEL } from '../data/classes';
import { ITEMS } from '../data/items';
import { equipSwap, loadout, slotCaps, SLOT_NAMES, unequipItem, type Character, type Slot } from '../game/campaign';
import { heroPortrait } from '../render/hero';
import { h } from './dom';

const EMPTY_ICON: Record<Slot, string> = { head: '⛑', body: '👕', legs: '👢', hand: '✋', small: '🧪' };
const CELL = 58;

export function inventoryEl(c: Character, changed: () => void): HTMLElement {
  const worn = loadout(c);
  const caps = slotCaps(c);
  const def = CLASSES[c.cls]!;
  const info = h('div.inv-info.small', 'Hover an item to see what it does. Click a bag item to equip it, click a worn item to take it off.');
  const describe = (id: string | null, fallback: string): void => {
    const it = id ? ITEMS[id] : null;
    info.replaceChildren(it ? h('div', h('b', `${it.icon ?? ''} ${it.name}`), h('span.dim', ` · ${SLOT_NAMES[it.slot]} · ${it.use}`), h('div', it.text)) : h('span.dim', fallback));
  };

  const itemCell = (id: string, onClick: () => void, extra = ''): HTMLElement => {
    const it = ITEMS[id]!;
    const el = h(`button.cell.inv-cell${extra}`, { type: 'button', title: `${it.name}: ${it.text}` }, h('span.inv-icon', it.icon ?? '?'));
    el.addEventListener('mouseenter', () => describe(id, ''));
    el.addEventListener('focus', () => describe(id, ''));
    el.addEventListener('click', onClick);
    return el;
  };
  const emptyCell = (slot: Slot, label: string, locked = false): HTMLElement => {
    const el = h(`div.cell.inv-cell.empty${locked ? '.locked' : ''}`, h('span.inv-icon.faint', locked ? '🔒' : EMPTY_ICON[slot]), h('span.inv-label', label));
    el.addEventListener('mouseenter', () => describe(null, locked ? label : `${SLOT_NAMES[slot]}: empty. Click a matching item in the bag to equip it.`));
    return el;
  };

  // ---- the paper doll: slots around the hero
  const bySlot = (slot: Slot): string[] => worn.filter((id) => ITEMS[id]?.slot === slot);
  const slotCell = (slot: Slot, i: number, label: string, locked: string | null): HTMLElement => {
    const id = bySlot(slot)[i];
    if (locked) {
      const el = emptyCell(slot, locked, true);
      el.addEventListener('mouseenter', () => describe(null, locked === '2-handed' ? `${def.name}s fight with a two-handed weapon: one hand stays on it.` : `Opens at ${locked.replace('Lv', 'level')}: potion/utility slots are half your level, rounded up.`));
      return el;
    }
    if (!id) return emptyCell(slot, label);
    return itemCell(id, () => {
      unequipItem(c, id);
      changed();
    }, '.worn');
  };
  const place = (el: HTMLElement, x: number, y: number): HTMLElement => {
    el.style.position = 'absolute';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    return el;
  };
  const doll = h('div.inv-doll');
  const portrait = heroPortrait(c.cls, 150);
  portrait.style.position = 'absolute';
  portrait.style.left = '85px';
  portrait.style.top = '66px';
  doll.append(
    portrait,
    place(slotCell('head', 0, 'Helmet', null), 131, 0),
    place(slotCell('body', 0, 'Chest', null), 8, 92),
    place(slotCell('hand', 0, 'Hand', null), 254, 70),
    place(slotCell('hand', 1, 'Hand', caps.hand < 2 ? '2-handed' : null), 254, 140),
    place(slotCell('legs', 0, 'Shoes', null), 131, 226),
  );
  // potion & utility slots: one per two levels, the locked ones show when they open
  const smalls = h('div.row', { style: { gap: '6px', justifyContent: 'center' } });
  const maxSmall = Math.ceil(MAX_LEVEL / 2);
  for (let i = 0; i < maxSmall; i++) smalls.appendChild(slotCell('small', i, 'Potion', i < caps.small ? null : `Lv ${i * 2 + 1}`));

  // ---- the bag: owned but not worn
  const bagItems = c.items.filter((id) => ITEMS[id] && !worn.includes(id));
  const bag = h('div.inv-bag');
  for (const id of bagItems)
    bag.appendChild(
      itemCell(id, () => {
        const off = equipSwap(c, id);
        if (off === null && !loadout(c).includes(id)) return;
        changed();
      }),
    );
  const BAG_MIN = 12;
  for (let i = bagItems.length; i < BAG_MIN; i++) bag.appendChild(h('div.cell.inv-cell.empty.bagslot'));

  return h(
    'div.inv',
    h(
      'div.col',
      { style: { gap: '8px', alignItems: 'center' } },
      doll,
      h('div.small.dim', 'Potions & utility'),
      smalls,
    ),
    h('div.col', { style: { gap: '6px', minWidth: '0', flex: '1' } }, h('h3', { style: { margin: 0 } }, `Bag (${bagItems.length})`), bag, info),
  );
}

export const INVENTORY_CELL = CELL;
