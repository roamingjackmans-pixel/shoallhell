// The Enhancer: Gloomhaven-style stickers. A hero spends their own gold to permanently improve one ability line on
// one of their cards: +1 to its number, more range, another target, pierce/push/pull, a condition, jump, or an element.
import { enhanceCard, type Character } from '../game/campaign';
import { enhBlocked, enhCost, enhLabel, enhOptions, enhSlots, type EnhKind } from '../game/enhance';
import { cardDef, heroCard } from '../game/rules';
import { cardEl, stepText } from './cardView';
import { h, toast } from './dom';

let selected: string | null = null;
/** the sticker waiting for a second click to confirm: `${card}|${half}|${step}|${kind}` */
let armed: string | null = null;

export function enhancerTab(live: Character[], buyer: Character | undefined, pickBuyer: (id: string) => void, changed: () => void): HTMLElement {
  const box = h('div.col', { style: { gap: '10px' } });
  box.appendChild(
    h(
      'div',
      h('b', 'The Enhancer. '),
      h('span.dim', 'Old Mags works out of the welding bay with a tin of glowen ink. She paints a mark on a card and the card remembers it, for good. Stickers stay on the card for the rest of the hero’s career.'),
    ),
  );
  if (!buyer) {
    box.appendChild(h('div.dim', 'Recruit someone first.'));
    return box;
  }
  box.appendChild(
    h(
      'div.row.wrap',
      h('span.small.dim', 'Enhancing for: '),
      live.map((c) => h(`button.tiny${c.id === buyer.id ? '.on' : ''}`, { onclick: () => ((selected = null), (armed = null), pickBuyer(c.id)) }, `${c.name} (${c.gold}g)`)),
    ),
  );
  if (selected && !buyer.cards.includes(selected)) selected = null;

  // ---- every card the hero owns; click one to work on it
  const row = h('div.row.wrap', { style: { alignItems: 'flex-start' } });
  for (const id of buyer.cards) {
    const el = cardEl(heroCard(buyer, id), { small: true });
    el.classList.add('pick');
    if (selected && selected !== id) el.classList.add('dimmed');
    el.addEventListener('click', () => {
      selected = selected === id ? null : id;
      armed = null;
      changed();
    });
    row.appendChild(el);
  }

  if (!selected) {
    box.append(h('div.small.dim', 'Pick a card to enhance.'), row);
    box.appendChild(rulesNote());
    return box;
  }

  // ---- the chosen card: each ability line with its slots and the stickers it can take
  const base = cardDef(selected);
  const have = buyer.enh?.[selected] ?? [];
  const lines = h('div.col.grow', { style: { gap: '8px', minWidth: '0' } });
  for (const half of ['top', 'bot'] as const) {
    base[half].steps.forEach((st, i) => {
      const slots = enhSlots(st);
      if (!slots) return;
      const here = have.filter((e) => e.half === half && e.step === i);
      const opts = enhOptions(st);
      const line = h('div.enh-line');
      line.appendChild(
        h(
          'div.row',
          { style: { gap: '8px', alignItems: 'baseline' } },
          h('span.small.dim', half === 'top' ? 'Top' : 'Bottom'),
          h('span', { html: stepText(st) }),
          h('span.enh-slots', '●'.repeat(here.length) + '○'.repeat(Math.max(0, slots - here.length))),
          here.length ? h('span.small.enh-have', `✦ ${here.map((e) => enhLabel(e.kind, st)).join(', ')}`) : null,
        ),
      );
      if (here.length < slots) {
        const btns = h('div.row.wrap', { style: { gap: '4px' } });
        for (const kind of opts) {
          const why = enhBlocked(base, half, i, kind as EnhKind, have);
          if (why && why !== 'It already has that sticker.' && why !== 'One element per ability.') continue;
          const cost = enhCost(base, half, i, kind, have);
          const key = `${selected}|${half}|${i}|${kind}`;
          const isArmed = armed === key;
          const b = h(
            `button.tiny${isArmed ? '.primary' : ''}`,
            {
              disabled: !!why || buyer.gold < cost,
              title: why ?? (buyer.gold < cost ? `${buyer.name} has ${buyer.gold} gold.` : 'Click, then click again to confirm.'),
              onclick: () => {
                if (!isArmed) {
                  armed = key;
                  changed();
                  return;
                }
                const err = enhanceCard(buyer, selected!, half, i, kind);
                armed = null;
                if (err) toast(err);
                else toast(`${enhLabel(kind, st)} painted onto ${base.name}.`);
                changed();
              },
            },
            isArmed ? `Confirm ${enhLabel(kind, st)}: ${cost}g` : `${enhLabel(kind, st)} · ${cost}g`,
          );
          btns.appendChild(b);
        }
        line.appendChild(btns);
      } else line.appendChild(h('div.tiny.dim', 'No free sticker slots.'));
      lines.appendChild(line);
    });
  }
  if (!lines.childElementCount) lines.appendChild(h('div.dim', 'Nothing on this card takes a sticker: only Attack, Move, Heal, Shield, Retaliate and Loot lines do.'));

  box.append(
    h('div.row', { style: { alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' } }, cardEl(heroCard(buyer, selected)), lines),
    h('div.small.dim', 'Other cards:'),
    row,
    rulesNote(),
  );
  return box;
}

function rulesNote(): HTMLElement {
  return h(
    'div.small.dim',
    'Attack lines take two stickers; Move, Heal, Shield, Retaliate and Loot lines take one. Prices: +1 Attack 50, +1 Move/Heal 30, +1 Shield/Retaliate 100, +1 Range/Pierce/Push/Pull 30, +1 Target 50, Jump 50, Poison/Wound 75, Muddle 50, Immobilize 100, Disarm 150, an element 100. Doubled on abilities that hit several targets (except +1 Target), +25 per card level above 1, +75 for each sticker already on that line. An element sticker infuses that element when the line is played.',
  );
}
