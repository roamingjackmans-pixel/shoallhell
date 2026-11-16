// The battle screen: the board, and around it the initiative track, the monsters' ability cards, the elements,
// the log, and the hand. Pick two cards each round; on your turn play the top of one and the bottom of the other,
// dragging your hero to move and clicking enemies to attack.
import { CLASSES } from '../data/classes';
import { ITEMS } from '../data/items';
import { monsterDef, SUMMONS } from '../data/monsters';
import { DEFEAT_QUIPS, DEFEAT_TITLES } from '../data/story';
import { chartLine } from '../draw/elements';
import { hexDist, key, los, unitAt } from '../game/grid';
import type { Match } from '../game/match';
import { aoeTiles, attackOptions, cardDef, heroPrompt, moveOptions, nameOf, objectiveText } from '../game/rules';
import type { CombatState, Elem, HeroUnit, Step, Unit } from '../game/types';
import { ELEMS } from '../game/types';
import { Board } from '../render/board';
import { abilityEl, cardEl, condName } from './cardView';
import { clear, h, modal, toast } from './dom';

const EL_GLYPH: Record<Elem, string> = { fire: '🔥', magic: '✦', void: '◐', holy: '☀' };
const EL_COLOR: Record<Elem, string> = { fire: 'var(--fire)', magic: 'var(--magic)', void: 'var(--void)', holy: 'var(--holy)' };

export function combatScreen(root: HTMLElement, match: Match, onEnd: (s: CombatState) => void, onLeave: () => void): () => void {
  clear(root);
  const screen = h('div.screen');
  root.appendChild(screen);
  const board = new Board(screen);
  const hud = h('div.hud');
  screen.appendChild(hud);
  const top = h('div.topbar');
  const track = h('div.track');
  const strip = h('div.monstrip');
  const logbox = h('div.logbox');
  const inspect = h('div.inspect', { style: { display: 'none' } });
  const handbar = h('div.handbar');
  const banner = h('div.big-banner');
  hud.append(top, track, strip, logbox, inspect, handbar, banner);

  let viewHero: string | null = null;
  let localPick: string[] = [];
  let lastPhaseRound = '';
  let ended = false;
  let negateClose: (() => void) | null = null;
  let hoverMonsterType: string | null = null;
  let logLen = 0;
  let lastTurnUid: string | null = null;

  const me = match.me;
  const mine = (s: CombatState): HeroUnit[] => s.units.filter((u): u is HeroUnit => u.kind === 'hero' && u.owner === me);

  const send = (i: Parameters<Match['intent']>[0]): void => {
    const err = match.intent(i);
    if (err) toast(err);
  };

  // ---------------------------------------------------------------- board input
  board.handlers = {
    onDrop: (uid, x, y) => {
      const s = match.state;
      const p = heroPrompt(s);
      if (!p || p.uid !== uid || p.kind !== 'step') return;
      if (p.step?.t === 'move' || p.step?.t === 'teleport') send({ t: 'move', uid, x, y });
    },
    onTile: (x, y) => {
      const s = match.state;
      const p = heroPrompt(s);
      if (!p || p.kind !== 'step' || !isMine(s, p.uid)) return;
      const st = p.step!;
      if (st.t === 'move' || st.t === 'teleport') {
        if (board.hl.move?.has(key(x, y)) || board.hl.teleport?.has(key(x, y))) send({ t: 'move', uid: p.uid, x, y });
      } else if (st.t === 'attack' && st.aoe && st.aoe !== 'ring') {
        if (board.hl.aim?.has(key(x, y))) send({ t: 'target', uid: p.uid, x, y });
      }
    },
    onUnit: (uid) => {
      const s = match.state;
      const p = heroPrompt(s);
      if (p && p.kind === 'step' && isMine(s, p.uid)) {
        if (board.hl.enemies?.has(uid) || board.hl.allies?.has(uid)) {
          send({ t: 'target', uid: p.uid, target: uid });
          return;
        }
      }
      const u = s.units.find((x) => x.uid === uid);
      if (u?.kind === 'hero' && u.owner === me) {
        viewHero = uid;
        render(s);
      }
    },
    onHover: (uid) => showInspect(match.state, uid),
  };

  function isMine(s: CombatState, uid: string): boolean {
    return mine(s).some((h) => h.uid === uid);
  }

  // ---------------------------------------------------------------- highlights
  function highlights(s: CombatState): void {
    board.hl = {};
    const slot = s.order[s.turnIdx];
    board.focusUid = s.phase === 'turns' && slot ? slot.who : null;
    const p = heroPrompt(s);
    if (!p || !isMine(s, p.uid) || s.pending) return;
    const hero = s.units.find((u) => u.uid === p.uid) as HeroUnit;
    if (p.kind !== 'step' || !p.step) return;
    const st = p.step;
    if (st.t === 'move') {
      board.hl.move = new Set(moveOptions(s, hero));
      board.hl.draggable = hero.uid;
    } else if (st.t === 'teleport') {
      const set = new Set<number>();
      for (let y = hero.y - st.n; y <= hero.y + st.n; y++)
        for (let x = hero.x - st.n; x <= hero.x + st.n; x++) {
          const c = s.map.tiles[y]?.[x];
          if (c && '.,d~X'.includes(c) && !unitAt(s, x, y) && hexDist(hero.x, hero.y, x, y) <= st.n) set.add(key(x, y));
        }
      board.hl.teleport = set;
      board.hl.draggable = hero.uid;
    } else if (st.t === 'attack') {
      const opts = attackOptions(s, hero, st);
      if (st.aoe && st.aoe !== 'ring') {
        board.hl.aim = new Set(opts.map((o) => Number(o.slice(1))));
        board.hl.aoe = (x, y) => aoeTiles(s, hero, st, x, y);
      } else board.hl.enemies = new Set(opts);
    } else if (st.t === 'heal' || st.t === 'shield' || st.t === 'buff' || st.t === 'bless') {
      const range = Math.max(1, st.range ?? 0);
      board.hl.allies = new Set(
        s.units
          .filter((u) => !u.dead && (u.kind === 'hero' ? !u.exhausted : u.kind === 'summon') && (u.uid === hero.uid || (hexDist(u.x, u.y, hero.x, hero.y) <= range && los(s.map, hero.x, hero.y, u.x, u.y))))
          .map((u) => u.uid),
      );
    } else if (st.t === 'curse') {
      board.hl.enemies = new Set(s.units.filter((u) => u.kind === 'monster' && !u.dead && hexDist(u.x, u.y, hero.x, hero.y) <= st.range && los(s.map, hero.x, hero.y, u.x, u.y)).map((u) => u.uid));
    }
  }

  // ---------------------------------------------------------------- panels
  function renderTop(s: CombatState): void {
    clear(top);
    top.append(
      h('button.tiny', { onclick: () => confirmLeave() }, '☰ Leave'),
      h('div.col', { style: { gap: '0' } }, h('div.title', s.scenario.name), h('div.small.dim', `Round ${s.round} · Level ${s.scenario.level} · ${objectiveText(s)}`)),
      h('div.grow'),
      h(
        'div.elements',
        ELEMS.map((e) =>
          h(`div.elem.s${s.elements[e]}`, { style: { color: EL_COLOR[e] }, title: `${e[0]!.toUpperCase() + e.slice(1)}: ${s.elements[e] === 2 ? 'strong' : s.elements[e] === 1 ? 'waning' : 'inert'}${s.infusedNow.includes(e) ? ' (infusing)' : ''}` }, EL_GLYPH[e]),
        ),
      ),
      h('button.tiny', { onclick: () => board.fit(), title: 'Fit the map (F). Pan: drag empty ground or WASD/arrows. Zoom: wheel or +/−' }, '⤢ Fit'),
      h('button.tiny', { onclick: () => helpModal() }, '? Rules'),
    );
  }

  function renderTrack(s: CombatState): void {
    clear(track);
    if (s.phase === 'select') {
      track.appendChild(h('div.slot', h('div.ini', '…'), h('div', h('div', 'Choosing cards'), h('div.tiny.dim', 'Initiative order appears when everyone is ready'))));
      for (const hu of s.units.filter((u): u is HeroUnit => u.kind === 'hero' && !u.exhausted))
        track.appendChild(h('div.slot.hero', h('div.ini', hu.ready ? '✔' : '…'), h('div.nm', `${hu.name}${hu.ready ? (hu.longRest ? ' (long rest)' : ' — ready') : ''}`)));
      return;
    }
    s.order.forEach((o, i) => {
      let label = '';
      let cls = 'hero';
      if (o.kind === 'hero') label = (s.units.find((u) => u.uid === o.who) as HeroUnit | undefined)?.name ?? '?';
      else if (o.kind === 'summon') {
        const u = s.units.find((x) => x.uid === o.who);
        label = u ? nameOf(u) : 'Summon';
        cls = 'sum';
      } else {
        const d = monsterDef(o.who);
        const ab = d.abilities[s.drawn[o.who] ?? 0];
        label = `${d.name}${ab ? ` — ${ab.name}` : ''}`;
        cls = 'mon';
      }
      const el = h(`div.slot.${cls}${i === s.turnIdx ? '.cur' : ''}${o.done ? '.done' : ''}`, h('div.ini', String(Math.floor(o.init)).padStart(2, '0')), h('div.nm', label));
      if (o.kind === 'monster') {
        el.addEventListener('mouseenter', () => {
          hoverMonsterType = o.who;
          showInspect(s, null);
        });
        el.addEventListener('mouseleave', () => {
          hoverMonsterType = null;
          showInspect(s, null);
        });
      }
      track.appendChild(el);
    });
  }

  function renderStrip(s: CombatState): void {
    clear(strip);
    const living = new Set(s.units.filter((u) => u.kind === 'monster' && !u.dead).map((u) => (u as { monster: string }).monster));
    for (const id of s.types) {
      if (!living.has(id)) continue;
      const d = monsterDef(id);
      const n = s.units.filter((u) => u.kind === 'monster' && !u.dead && u.monster === id).length;
      const ab = s.phase === 'turns' ? d.abilities[s.drawn[id] ?? -1] : undefined;
      const chip = h('div.monchip', h('b', `${d.name}`), ` ×${n}`, ab ? h('span.dim', ` · ${ab.init} ${ab.name}`) : '');
      chip.addEventListener('mouseenter', () => {
        hoverMonsterType = id;
        showInspect(s, null);
      });
      chip.addEventListener('mouseleave', () => {
        hoverMonsterType = null;
        showInspect(s, null);
      });
      strip.appendChild(chip);
    }
  }

  function renderLog(s: CombatState): void {
    if (s.log.length === logLen && logbox.childElementCount) return;
    logLen = s.log.length;
    clear(logbox);
    for (const l of s.log.slice(-60)) logbox.appendChild(h(`div.l-${l.kind ?? 'info'}`, l.t));
    logbox.scrollTop = logbox.scrollHeight;
  }

  function showInspect(s: CombatState, uid: string | null): void {
    clear(inspect);
    const u = uid ? s.units.find((x) => x.uid === uid) : null;
    if (!u && !hoverMonsterType) {
      inspect.style.display = 'none';
      return;
    }
    inspect.style.display = '';
    if (!u && hoverMonsterType) {
      const d = monsterDef(hoverMonsterType);
      inspect.append(h('div', h('b', d.name), h('span.dim', ` · ${d.role}`)), h('div.small.dim', d.flavor));
      const ab = d.abilities[s.drawn[hoverMonsterType] ?? -1];
      const any = s.units.find((x) => x.kind === 'monster' && x.monster === hoverMonsterType && !x.dead) as Extract<Unit, { kind: 'monster' }> | undefined;
      if (ab && s.phase === 'turns') inspect.appendChild(abilityEl(hoverMonsterType, ab, any?.stat ?? null));
      else inspect.appendChild(h('div.small.dim', 'Their ability card is revealed once everyone has picked.'));
      return;
    }
    if (!u) return;
    if (u.kind === 'monster') {
      const d = monsterDef(u.monster);
      const st = u.stat;
      inspect.append(
        h('div', h('b', nameOf(u)), h('span.dim', ` · ${d.boss ? 'BOSS' : d.role}`)),
        h('div', `HP ${u.hp}/${u.maxHp} · Move ${st.move} · Attack ${st.atk}${st.range ? ` · Range ${st.range}` : ' · melee'}${st.shield ? ` · Shield ${st.shield}` : ''}${st.retaliate ? ` · Retaliate ${st.retaliate}` : ''}`),
        h('div.small', h(`span.el-${d.elem}`, d.elem[0]!.toUpperCase() + d.elem.slice(1)), h('span.dim', ` — ${chartLine(d.elem)}`)),
        u.conds.length ? h('div.small', 'Conditions: ', u.conds.map(condName).join(', ')) : '',
        h('div.small.dim', d.flavor),
      );
      const ab = d.abilities[s.drawn[u.monster] ?? -1];
      if (ab && s.phase === 'turns') inspect.appendChild(abilityEl(u.monster, ab, st));
    } else if (u.kind === 'hero') {
      const def = CLASSES[u.cls]!;
      inspect.append(
        h('div', h('b', u.name), h('span.dim', ` · ${def.name} level ${u.level}`)),
        h('div', `HP ${u.hp}/${u.maxHp} · Hand ${u.hand.length} · Discard ${u.discard.length} · Lost ${u.lost.length}`),
        u.conds.length ? h('div.small', 'Conditions: ', u.conds.map(condName).join(', ')) : '',
        u.active.length ? h('div.small.good', u.active.map((a) => `◆ ${a.persist.text}${a.persist.uses ? ` (${a.left} left)` : ''}`).join(' ')) : '',
        h('div.small.dim', `XP this scenario ${u.xp} · Gold ${u.gold}`),
      );
    } else {
      const d = SUMMONS[u.summon];
      inspect.append(h('div', h('b', d?.name ?? 'Summon'), h('span.dim', ' · summon')), h('div', `HP ${u.hp}/${u.maxHp} · Move ${u.stat.move} · Attack ${u.stat.atk}${u.stat.range ? ` · Range ${u.stat.range}` : ''}`));
    }
  }

  // ---------------------------------------------------------------- hand / prompts
  function pileButton(label: string, cards: string[]): HTMLElement {
    return h(
      'button.tiny',
      {
        onclick: () => {
          if (!cards.length) return;
          modal(h('div.col', h('h3', label), h('div.row.wrap', cards.map((c) => cardEl(cardDef(c), { small: true })))));
        },
      },
      `${label} (${cards.length})`,
    );
  }

  function itemRow(s: CombatState, hero: HeroUnit): HTMLElement | null {
    const usable = hero.items.filter((i) => ITEMS[i.id]?.use !== 'passive');
    if (!hero.items.length) return null;
    return h(
      'div.row.wrap',
      { style: { gap: '4px' } },
      h('span.small.dim', 'Items:'),
      hero.items.map((it) => {
        const d = ITEMS[it.id]!;
        const myTurn = s.phase === 'turns' && s.heroTurn?.uid === hero.uid;
        return h('button.tiny', { disabled: d.use === 'passive' || it.state !== 'ready' || !myTurn, title: `${d.name}: ${d.text} (${d.use})`, onclick: () => send({ t: 'item', uid: hero.uid, item: it.id }) }, `${d.name}${it.state !== 'ready' ? ' ✓' : ''}`);
      }),
      usable.length ? null : null,
    );
  }

  function stepPrompt(st: Step, s: CombatState, hero: HeroUnit): string {
    const cur = s.heroTurn?.cur;
    switch (st.t) {
      case 'move':
        return `Move up to ${cur?.movesLeft ?? st.n}${cur?.jump ? ' (jump)' : ''}: drag ${hero.name} to a blue space, or click one.`;
      case 'teleport':
        return `Teleport up to ${st.n}: click or drag to a purple space.`;
      case 'attack':
        return st.aoe && st.aoe !== 'ring' ? `Attack ${st.n}: aim the ${st.aoe} — hover to preview, click to strike.` : `Attack ${st.n}${st.range ? ` (range ${st.range})` : ' (melee)'}: click a red-ringed enemy${(st.targets ?? 1) > 1 ? ` (up to ${st.targets})` : ''}.`;
      case 'heal':
        return `Heal ${st.n}: click an ally (green ring).`;
      case 'shield':
        return `Shield ${st.n}: click an ally (green ring).`;
      case 'buff':
        return `${st.cond.map(condName).join(', ')}: click an ally (green ring).`;
      case 'bless':
        return `Bless ${st.n}: click an ally.`;
      case 'curse':
        return `Curse ${st.n}: click an enemy in range.`;
      default:
        return 'Resolving…';
    }
  }

  function renderHand(s: CombatState): void {
    clear(handbar);
    const heroes = mine(s);
    if (!heroes.length) {
      handbar.appendChild(h('div.prompt', h('span.what', 'You are watching.')));
      return;
    }
    // follow the acting hero
    const acting = s.heroTurn && heroes.find((x) => x.uid === s.heroTurn!.uid);
    if (acting) viewHero = acting.uid;
    if (!viewHero || !heroes.some((x) => x.uid === viewHero)) viewHero = heroes.find((x) => !x.exhausted)?.uid ?? heroes[0]!.uid;
    if (s.phase === 'select') {
      const notReady = heroes.find((x) => !x.ready && !x.exhausted);
      if (notReady && heroes.find((x) => x.uid === viewHero)?.ready) viewHero = notReady.uid;
    }
    const hero = heroes.find((x) => x.uid === viewHero)!;
    if (heroes.length > 1)
      handbar.appendChild(
        h(
          'div.herotabs',
          heroes.map((x) =>
            h(`button.tiny${x.uid === hero.uid ? '.on' : ''}`, { onclick: () => ((viewHero = x.uid), (localPick = []), render(s)) }, `${x.name}${x.exhausted ? ' (exhausted)' : s.phase === 'select' && x.ready ? ' ✔' : ''}`),
          ),
        ),
      );
    const prompt = h('div.prompt');
    const row = h('div.handrow');
    handbar.append(prompt, row);
    const piles = h('span.row', { style: { gap: '4px' } }, pileButton('Discard', hero.discard), pileButton('Lost', hero.lost), hero.active.length ? pileButton('Active', hero.active.map((a) => a.card)) : null);

    if (hero.exhausted) {
      prompt.append(h('span.what', hero.escaped ? `${hero.name} escaped.` : `${hero.name} is exhausted.`), h('span.dim', 'The union fights on without them.'));
      return;
    }

    if (s.phase === 'select') {
      if (hero.ready) {
        prompt.append(
          h('span.what', hero.longRest ? `${hero.name} will take a long rest (initiative 99).` : `${hero.name} is ready: ${hero.picked.map((c) => cardDef(c).name).join(' + ')}.`),
          h('button', { onclick: () => send({ t: 'unready', uid: hero.uid }) }, 'Change'),
          waitingText(s),
        );
        for (const c of hero.picked) row.appendChild(cardEl(cardDef(c), { small: true }));
        return;
      }
      const canRest = hero.discard.length >= 2;
      if (hero.hand.length < 2) {
        prompt.append(h('span.what', `${hero.name} is out of cards: long rest (heal 2, refresh items, lose one discarded card of your choice).`), h('button.primary', { onclick: () => send({ t: 'longRest', uid: hero.uid }) }, 'Long rest'), piles);
        return;
      }
      localPick = localPick.filter((c) => hero.hand.includes(c));
      prompt.append(
        h('span.what', localPick.length === 0 ? `Pick two cards for ${hero.name}. The first sets initiative.` : localPick.length === 1 ? 'Pick one more card.' : 'Ready?'),
        h('button.primary', { disabled: localPick.length !== 2, onclick: () => (send({ t: 'pick', uid: hero.uid, cards: localPick }), (localPick = [])) }, localPick.length === 2 ? `Ready (initiative ${cardDef(localPick[0]!).init})` : 'Ready'),
        h('button', { disabled: !canRest, title: 'Spend the whole round resting: heal 2, refresh spent items, and choose one discarded card to lose.', onclick: () => send({ t: 'longRest', uid: hero.uid }) }, 'Long rest'),
        h(
          'button',
          {
            disabled: !canRest || hero.shortRested,
            title: 'Right now, for free: all discarded cards come back except one random card, which is lost.',
            onclick: () => send({ t: 'shortRest', uid: hero.uid }),
          },
          'Short rest',
        ),
        piles,
        h('span.pile', `HP ${hero.hp}/${hero.maxHp}`),
      );
      for (const c of hero.hand) {
        const el = cardEl(cardDef(c), { small: true });
        el.classList.add('pick');
        const idx = localPick.indexOf(c);
        if (idx >= 0) {
          el.classList.add('picked');
          el.appendChild(h('div.pickno', String(idx + 1)));
        }
        el.addEventListener('click', () => {
          if (localPick.includes(c)) localPick = localPick.filter((x) => x !== c);
          else if (localPick.length < 2) localPick.push(c);
          else localPick = [localPick[0]!, c];
          render(match.state);
        });
        row.appendChild(el);
      }
      const it = itemRow(s, hero);
      if (it) handbar.appendChild(it);
      return;
    }

    // turns
    const p = heroPrompt(s);
    const myTurn = p && p.uid === hero.uid;
    if (!myTurn) {
      const slot = s.order[s.turnIdx];
      let who = 'Monsters are acting…';
      if (slot?.kind === 'hero') who = `${(s.units.find((u) => u.uid === slot.who) as HeroUnit)?.name ?? 'Someone'}'s turn.`;
      else if (slot?.kind === 'summon') who = 'A summon is acting…';
      prompt.append(h('span.what', who), h('span.dim', hero.longRest ? `${hero.name} is resting this round.` : `${hero.name} plays: ${hero.picked.map((c) => cardDef(c).name).join(' + ')}`), piles);
      for (const c of hero.picked) row.appendChild(cardEl(cardDef(c), { small: true }));
      return;
    }
    if (p.kind === 'rest') {
      prompt.append(h('span.what', `Long rest: choose a discarded card to lose. ${hero.name} heals 2 and refreshes items.`));
      for (const c of hero.discard) {
        const el = cardEl(cardDef(c), { small: true });
        el.classList.add('pick');
        el.addEventListener('click', () => send({ t: 'restLose', uid: hero.uid, card: c }));
        row.appendChild(el);
      }
      return;
    }
    const t = s.heroTurn!;
    if (p.kind === 'choose') {
      const used = t.used[0];
      prompt.append(
        h('span.what', used ? `Now play the ${used.half === 'top' ? 'bottom' : 'top'} half of the other card.` : 'Your turn: play the top half of one card, then the bottom half of the other.'),
        h('span.dim', 'Or use a half as a basic Attack 2 / Move 2.'),
        piles,
      );
    } else if (p.step) {
      prompt.append(
        h('span.what', stepPrompt(p.step, s, hero)),
        h('button', { onclick: () => send({ t: 'skip', uid: hero.uid }) }, p.step.t === 'move' ? 'Done moving' : 'Skip'),
      );
    }
    for (const c of hero.picked) {
      const el = cardEl(cardDef(c), { small: true });
      const usedHalf = t.used.find((u) => u.card === c);
      const halves = el.querySelectorAll('.half');
      const topEl = halves[0] as HTMLElement;
      const botEl = halves[1] as HTMLElement;
      const canTop = p.kind === 'choose' && !usedHalf && !t.used.some((u) => u.half === 'top');
      const canBot = p.kind === 'choose' && !usedHalf && !t.used.some((u) => u.half === 'bot');
      if (usedHalf) (usedHalf.half === 'top' ? topEl : botEl).classList.add('used');
      if (t.cur?.card === c) (t.cur.half === 'top' ? topEl : botEl).classList.add('playing');
      if (canTop) {
        topEl.classList.add('clickable');
        topEl.addEventListener('click', () => send({ t: 'half', uid: hero.uid, card: c, half: 'top', basic: false }));
      }
      if (canBot) {
        botEl.classList.add('clickable');
        botEl.addEventListener('click', () => send({ t: 'half', uid: hero.uid, card: c, half: 'bot', basic: false }));
      }
      const wrap = h('div.col', { style: { gap: '4px', alignItems: 'center' } }, el);
      if (canTop || canBot)
        wrap.appendChild(
          h(
            'div.row',
            { style: { gap: '4px' } },
            canTop ? h('button.tiny', { onclick: () => send({ t: 'half', uid: hero.uid, card: c, half: 'top', basic: true }) }, 'Top as Attack 2') : null,
            canBot ? h('button.tiny', { onclick: () => send({ t: 'half', uid: hero.uid, card: c, half: 'bot', basic: true }) }, 'Bottom as Move 2') : null,
          ),
        );
      row.appendChild(wrap);
    }
    const it = itemRow(s, hero);
    if (it) handbar.appendChild(it);
  }

  function waitingText(s: CombatState): HTMLElement {
    const waiting = s.units.filter((u): u is HeroUnit => u.kind === 'hero' && !u.exhausted && !u.ready).map((u) => u.name);
    return h('span.dim', waiting.length ? `Waiting for ${waiting.join(', ')}.` : '');
  }

  // ---------------------------------------------------------------- questions and the end
  function renderPending(s: CombatState): void {
    const p = s.pending;
    if (!p || !isMine(s, p.heroUid)) {
      negateClose?.();
      negateClose = null;
      return;
    }
    if (negateClose) return;
    const hero = s.units.find((u) => u.uid === p.heroUid) as HeroUnit;
    const choices = hero.hand.filter((c) => !hero.picked.includes(c));
    const body = h(
      'div.col',
      h('h2', `${hero.name} is about to fall!`),
      h('div', `${p.by} hits for ${p.dmg} — enough to exhaust ${hero.name}. Lose a card to take no damage?`),
      h('div.small.dim', 'Lose one card from your hand, or two from your discard pile. Conditions from the hit still apply.'),
      h(
        'div.row.wrap',
        choices.map((c) => {
          const el = cardEl(cardDef(c), { small: true });
          el.classList.add('pick');
          el.addEventListener('click', () => answer(c));
          return el;
        }),
      ),
      h(
        'div.row',
        h('button', { disabled: hero.discard.length < 2, onclick: () => answer('discard2') }, 'Lose two discarded cards'),
        h('button.danger', { onclick: () => answer('take') }, `Take ${p.dmg} damage`),
      ),
    );
    const answer = (choice: string): void => {
      negateClose?.();
      negateClose = null;
      send({ t: 'negate', uid: hero.uid, choice });
    };
    negateClose = modal(body);
  }

  function renderEnd(s: CombatState): void {
    if ((s.phase !== 'won' && s.phase !== 'lost') || ended) return;
    ended = true;
    banner.innerHTML = '';
    const won = s.phase === 'won';
    const title = won ? 'VICTORY' : DEFEAT_TITLES[s.round % DEFEAT_TITLES.length]!;
    banner.appendChild(h('div', { style: { color: won ? '#ffd24a' : '#ff6a5a' } }, title));
    banner.appendChild(h('div', { style: { fontSize: '18px', fontWeight: '400' } }, s.result?.text ?? ''));
    if (!won) banner.appendChild(h('div', { style: { fontSize: '15px', fontWeight: '400', color: 'var(--dim)' } }, DEFEAT_QUIPS[s.round % DEFEAT_QUIPS.length]));
    setTimeout(() => onEnd(s), 2200);
  }

  function confirmLeave(): void {
    const close = modal(
      h(
        'div.col',
        h('h2', 'Leave the scenario?'),
        h('div', match.role === 'guest' ? 'You will leave your host’s game. Your heroes keep nothing from this scenario.' : 'The scenario ends as a loss: nobody keeps XP or gold from it.'),
        h('div.row', h('button.danger', { onclick: () => (close(), onLeave()) }, 'Leave'), h('button', { onclick: () => close() }, 'Keep playing')),
      ),
    );
  }

  function helpModal(): void {
    modal(
      h(
        'div.col',
        { style: { maxWidth: '720px' } },
        h('h2', 'How a round works'),
        h('div', '1. Everyone secretly picks two cards. The first card’s number is your initiative (lower acts first).'),
        h('div', '2. Monsters reveal one ability card per type. Everyone acts in initiative order.'),
        h('div', '3. On your turn, play the TOP half of one card and the BOTTOM half of the other, in either order. Any top can be a basic Attack 2, any bottom a basic Move 2.'),
        h('div', '4. Played cards go to your discard pile. Halves marked LOST remove the card for the scenario.'),
        h('div', '5. Short rest (between rounds): everything comes back except one random card, which is lost. Long rest (takes your turn): heal 2, refresh items, lose one card of your choice.'),
        h('div', 'Run out of cards and you are exhausted. If a hit would knock you out, you may lose a card instead.'),
        h('h3', 'Dungeon Joe rules, Shoallhell style'),
        h('div', h('span.redtag', { style: { color: '#ff4a3a', fontWeight: '800' } }, 'RED'), ' attacks ignore Shield. ', h('span', { style: { color: '#8fd3ff', fontWeight: '800' } }, 'BLUE'), ' attacks hit every hero in their area.'),
        h('div', 'Weakness chart: Magic beats Holy, Holy beats Void, Void beats Fire, Fire beats Magic (+1 damage when strong, −1 when weak). Infused elements are strong this round and waning the next; cards can spend them for bonuses.'),
        h('div.small.dim', 'Controls: drag your hero to move (or click a blue hex), click enemies to attack. Move the view by dragging empty ground or with WASD / arrow keys; zoom with the mouse wheel or + and −; F fits the map. Rooms stay dark and their monsters asleep until someone opens the door. Hover anything for details.'),
      ),
    );
  }

  // ---------------------------------------------------------------- main render
  function render(s: CombatState): void {
    board.setState(s);
    const tu = s.heroTurn?.uid ?? null;
    if (tu !== lastTurnUid) {
      lastTurnUid = tu;
      const hu = tu ? mine(s).find((x) => x.uid === tu) : undefined;
      if (hu) board.ensureVisible(hu.x, hu.y);
    }
    highlights(s);
    renderTop(s);
    renderTrack(s);
    renderStrip(s);
    renderLog(s);
    renderHand(s);
    renderPending(s);
    const pr = `${s.phase}:${s.round}`;
    if (pr !== lastPhaseRound) {
      lastPhaseRound = pr;
      if (s.phase === 'turns') {
        banner.innerHTML = '';
        banner.appendChild(h('div', { style: { fontSize: '30px' } }, `Round ${s.round}`));
        setTimeout(() => {
          if (!ended) banner.innerHTML = '';
        }, 900);
      }
    }
    renderEnd(s);
  }

  const off = match.onChange(render);
  render(match.state);
  match.start();
  return () => {
    off();
    board.destroy();
    negateClose?.();
  };
}
