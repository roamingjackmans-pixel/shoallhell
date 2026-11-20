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
import { aoeTiles, attackOptions, cardDef, heroCard, heroPrompt, placing, startOptions, moveOptions, nameOf, objectiveText, pushOptions } from '../game/rules';
import type { CombatState, Elem, HeroUnit, Mod, Step, Unit } from '../game/types';
import { modLabel } from '../game/mods';
import { ELEMS } from '../game/types';
import { Board } from '../render/board';
import { abilityEl, cardEl, condName, stepText } from './cardView';
import { clear, h, modal, toast } from './dom';
import { describeTile } from './tileInfo';
import { statsEl } from './stats';
import { playChime } from './sound';

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
  /** the last 'you need to act' moment we rang for */
  let lastNeed: string | null = null;
  /** lost cards chosen for a Recover step */
  let recoverPick: string[] = [];
  let localPick: string[] = [];
  /** the half each hero plans to play this round (right-click while picking): only on this screen, never sent */
  const plans: Record<string, { round: number; card: string; half: 'top' | 'bot' }> = {};

  /** Star the planned half on a card, or the opposite half of the other card of the pair. */
  function starPlan(el: HTMLElement, hero: HeroUnit, card: string, pair: string[], round: number): void {
    const plan = plans[hero.uid];
    if (!plan || plan.round !== round || !pair.includes(plan.card)) return;
    let half: 'top' | 'bot' | null = null;
    if (card === plan.card) half = plan.half;
    else if (pair.includes(card)) half = plan.half === 'top' ? 'bot' : 'top';
    if (!half) return;
    const hs = el.querySelectorAll('.half');
    const target = hs[half === 'top' ? 0 : 1] as HTMLElement | undefined;
    if (!target) return;
    target.classList.add('starred');
    target.appendChild(h('span.star', { title: card === plan.card ? 'You plan to play this half' : 'So this half of the other card' }, '★'));
  }
  let lastPhaseRound = '';
  let ended = false;
  let negateClose: (() => void) | null = null;
  let hoverMonsterType: string | null = null;
  let logLen = 0;
  let lastTurnUid: string | null = null;
  let hoverTile: [number, number] | null = null;

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
      // before the first round: drop your hero on a free start hex
      if (placing(s)) {
        if (isMine(s, uid) && board.hl.move?.has(key(x, y))) send({ t: 'place', uid, x, y });
        return;
      }
      const p = heroPrompt(s);
      if (!p || p.uid !== uid || p.kind !== 'step') return;
      if (p.step?.t === 'move' || p.step?.t === 'teleport') send({ t: 'move', uid, x, y });
    },
    onTile: (x, y) => {
      const s = match.state;
      if (placing(s)) {
        if (viewHero && isMine(s, viewHero) && board.hl.move?.has(key(x, y))) send({ t: 'place', uid: viewHero, x, y });
        return;
      }
      // choosing where a pushed enemy goes
      if (s.pushQ?.length && s.heroTurn && isMine(s, s.heroTurn.uid)) {
        if (board.hl.push?.has(key(x, y))) send({ t: 'push', uid: s.heroTurn.uid, x, y });
        return;
      }
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
    onHover: (uid, x, y) => {
      hoverTile = [x, y];
      showInspect(match.state, uid);
    },
    onPing: (x, y) => match.ping(x, y),
  };

  // Ctrl+Z takes back the card half you just chose (until you act on it)
  const onUndoKey = (e: KeyboardEvent): void => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    const s = match.state;
    const t = s.heroTurn;
    if (!s.undo || !t || !isMine(s, t.uid)) return;
    e.preventDefault();
    send({ t: 'undo', uid: t.uid });
  };
  window.addEventListener('keydown', onUndoKey);

  // pings: each player gets a colour, labelled with their hero's name
  const PING_COLORS = ['#ffd24a', '#7cc4ff', '#ff7a9a', '#9dffcf'];
  const offPing = match.onPing((p) => {
    const s = match.state;
    const owners = [...new Set(s.units.filter((u): u is HeroUnit => u.kind === 'hero').map((u) => u.owner))];
    const i = Math.max(0, owners.indexOf(p.from));
    const names = s.units.filter((u): u is HeroUnit => u.kind === 'hero' && u.owner === p.from).map((u) => u.name);
    const label = p.from === me ? 'You' : names.length ? names.join(' & ') : 'Someone';
    board.ping(p.x, p.y, PING_COLORS[i % PING_COLORS.length]!, label);
  });

  /** What this player has to do right now, as a key that changes when a new decision starts (null: nothing). */
  function needKey(s: CombatState): string | null {
    if (s.phase === 'won' || s.phase === 'lost') return null;
    if (s.pending && isMine(s, s.pending.heroUid)) return `hit:${s.round}:${s.turnIdx}:${s.pending.heroUid}:${s.pendQ.length}`;
    if (s.phase === 'select' && mine(s).some((h) => !h.exhausted && !h.ready)) return `pick:${s.round}`;
    if (s.phase === 'turns' && s.heroTurn?.started && isMine(s, s.heroTurn.uid)) return `turn:${s.round}:${s.heroTurn.uid}`;
    return null;
  }

  function isMine(s: CombatState, uid: string): boolean {
    return mine(s).some((h) => h.uid === uid);
  }

  // ---------------------------------------------------------------- highlights
  function highlights(s: CombatState): void {
    board.hl = {};
    const slot = s.order[s.turnIdx];
    board.focusUid = s.phase === 'turns' && slot ? slot.who : null;
    // before the first round: the free start hexes, for the hero you are looking at
    if (placing(s)) {
      const hero = viewHero ? s.units.find((u) => u.uid === viewHero) : undefined;
      if (hero && isMine(s, hero.uid)) {
        board.hl.move = new Set(startOptions(s).map(([x, y]) => key(x, y)));
        board.hl.draggable = hero.uid;
      }
      return;
    }
    const p = heroPrompt(s);
    if (!p || !isMine(s, p.uid) || s.pending) return;
    if (s.pushQ?.length) {
      board.hl.push = new Set(pushOptions(s).map(([x, y]) => key(x, y)));
      return;
    }
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
      h('button.tiny', { onclick: () => modal(h('div', { style: { width: 'min(1000px, 94vw)' } }, statsEl(match.state))), title: 'Everything each hero has done this scenario so far' }, '📊 Stats'),
      h('button.tiny', { onclick: () => helpModal() }, '? Rules'),
    );
  }

  function renderTrack(s: CombatState): void {
    clear(track);
    if (s.phase === 'select') {
      track.appendChild(h('div.slot', h('div.ini', '…'), h('div', h('div', 'Choosing cards'), h('div.tiny.dim', 'Initiative order appears when everyone is ready'))));
      for (const hu of s.units.filter((u): u is HeroUnit => u.kind === 'hero' && !u.exhausted))
        track.appendChild(h('div.slot.hero', h('div.ini', hu.ready ? '✔' : '…'), h('div.nm', hu.ready && hu.longRest ? h('span.resting-tag', `🛏 ${hu.name}: long rest`) : `${hu.name}${hu.ready ? ' — ready' : ''}`)));
      return;
    }
    s.order.forEach((o, i) => {
      let label = '';
      let cls = 'hero';
      if (o.kind === 'hero') {
        const hu = s.units.find((u) => u.uid === o.who) as HeroUnit | undefined;
        label = hu ? (hu.longRest ? `🛏 ${hu.name} (long rest)` : hu.name) : '?';
      }
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
    // redraw when the newest line changes (the log is capped, so its length alone stops changing)
    const last = s.log[s.log.length - 1];
    const sig = (last?.n ?? 0) * 100000 + s.log.length;
    if (sig === logLen && logbox.childElementCount) return;
    logLen = sig;
    clear(logbox);
    for (const l of s.log.slice(-60)) logbox.appendChild(h(`div.l-${l.kind ?? 'info'}`, l.t));
    logbox.scrollTop = logbox.scrollHeight;
  }

  /** The hover panel sits right under the log, and never runs down behind the hand. */
  function placeInspect(): void {
    const logShown = logbox.offsetParent !== null;
    const top = logShown ? logbox.offsetTop + logbox.offsetHeight + 8 : 64;
    inspect.style.top = `${top}px`;
    inspect.style.maxHeight = `${Math.max(120, screen.clientHeight - top - handbar.offsetHeight - 12)}px`;
  }

  function showInspect(s: CombatState, uid: string | null): void {
    clear(inspect);
    const u = uid ? s.units.find((x) => x.uid === uid) : null;
    const tiles = !hoverMonsterType && hoverTile ? describeTile(s, hoverTile[0], hoverTile[1]) : [];
    if (!u && !hoverMonsterType && !tiles.length) {
      inspect.style.display = 'none';
      return;
    }
    inspect.style.display = '';
    placeInspect();
    if (!u && hoverMonsterType) {
      const d = monsterDef(hoverMonsterType);
      inspect.append(h('div', h('b', d.name), h('span.dim', ` · ${d.role}`)), h('div.small.dim', d.flavor));
      const ab = d.abilities[s.drawn[hoverMonsterType] ?? -1];
      const any = s.units.find((x) => x.kind === 'monster' && x.monster === hoverMonsterType && !x.dead) as Extract<Unit, { kind: 'monster' }> | undefined;
      if (ab && s.phase === 'turns') inspect.appendChild(abilityEl(hoverMonsterType, ab, any?.stat ?? null));
      else inspect.appendChild(h('div.small.dim', 'Their ability card is revealed once everyone has picked.'));
      return;
    }
    if (u && u.kind === 'monster') {
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
    } else if (u && u.kind === 'hero') {
      const def = CLASSES[u.cls]!;
      inspect.append(
        h('div', h('b', u.name), h('span.dim', ` · ${def.name} level ${u.level}`)),
        h('div', `HP ${u.hp}/${u.maxHp} · Hand ${u.hand.length} · Discard ${u.discard.length} · Lost ${u.lost.length}`),
        u.conds.length ? h('div.small', 'Conditions: ', u.conds.map(condName).join(', ')) : '',
        u.active.length ? h('div.small.good', u.active.map((a) => `◆ ${a.persist.text}${a.persist.uses ? ` (${a.left} left)` : ''}`).join(' ')) : '',
        h('div.small.dim', `XP this scenario ${u.xp} · Gold ${u.gold}`),
      );
    } else if (u) {
      const d = SUMMONS[u.summon];
      inspect.append(h('div', h('b', d?.name ?? 'Summon'), h('span.dim', ' · summon')), h('div', `HP ${u.hp}/${u.maxHp} · Move ${u.stat.move} · Attack ${u.stat.atk}${u.stat.range ? ` · Range ${u.stat.range}` : ''}`));
    }
    // what the hex itself is: obstacle, hazard, rubble, trap, door, exit, loot
    tiles.forEach((t, i) => {
      inspect.appendChild(h(`div.tileinfo${u || i > 0 ? '.sep' : ''}`, h(`b.${t.kind === 'loot' ? 'gold' : 'accent'}`, t.name), h('div.small', t.text)));
    });
  }

  // ---------------------------------------------------------------- hand / prompts
  /** Items that return discards: the player picks which ones (up to the item's number), then confirms. */
  function chooseDiscards(hero: HeroUnit, itemId: string): void {
    const d = ITEMS[itemId]!;
    const n = d.fx.recover ?? 0;
    let pick: string[] = [];
    const grid = h('div.row.wrap', { style: { gap: '6px', justifyContent: 'center' } });
    const go = h('button.primary', {}, '') as HTMLButtonElement;
    const draw = (): void => {
      grid.replaceChildren(
        ...hero.discard.map((c) => {
          const el = cardEl(heroCard(hero, c), { small: true });
          el.classList.add('pick');
          if (pick.includes(c)) el.classList.add('picked');
          el.addEventListener('click', () => {
            pick = pick.includes(c) ? pick.filter((x) => x !== c) : pick.length < n ? [...pick, c] : pick;
            draw();
          });
          return el;
        }),
      );
      go.textContent = pick.length ? `Use ${d.name}: get back ${pick.length} card${pick.length > 1 ? 's' : ''}` : `Choose up to ${n}`;
      go.disabled = !pick.length;
    };
    go.onclick = () => {
      close();
      send({ t: 'item', uid: hero.uid, item: itemId, cards: pick });
    };
    draw();
    const close = modal(
      h(
        'div.col',
        { style: { width: 'min(860px, 92vw)', gap: '10px', alignItems: 'center' } },
        h('h2', { style: { margin: 0 } }, `${d.icon ?? ''} ${d.name}`),
        h('div.dim', `Choose up to ${n} card${n > 1 ? 's' : ''} from your discard pile to get back into your hand.`),
        grid,
        h('div.row', go, h('button', { onclick: () => close() }, 'Cancel')),
      ),
    );
  }

  /** The hero's attack modifier deck: cards left to draw and the discard, grouped and counted. */
  function modsModal(hero: HeroUnit): void {
    const modClass = (m: Mod): string =>
      m.temp === 'bless' ? 'bless' : m.temp === 'curse' ? 'curse' : m.mult === 'x2' ? 'crit' : m.mult === 'null' ? 'miss' : m.v > 0 ? 'plus' : m.v < 0 ? 'minus' : 'zero';
    const ORDER = ['bless', 'crit', 'plus', 'zero', 'minus', 'miss', 'curse'];
    const grid = (mods: Mod[], empty: string): HTMLElement => {
      if (!mods.length) return h('div.small.dim', empty);
      const groups = new Map<string, { m: Mod; n: number }>();
      for (const m of mods) {
        const k = modLabel(m);
        const g = groups.get(k);
        if (g) g.n++;
        else groups.set(k, { m, n: 1 });
      }
      const list = [...groups.entries()].sort((a, b) => ORDER.indexOf(modClass(a[1].m)) - ORDER.indexOf(modClass(b[1].m)) || b[1].m.v - a[1].m.v);
      return h(
        'div.modgrid',
        list.map(([label, g]) => h(`div.modcard.${modClass(g.m)}`, { title: g.m.roll ? 'Rolling: draw another card and add it' : '' }, h('div.modlabel', label), h('div.modcount', `${g.n} card${g.n === 1 ? '' : 's'}`))),
      );
    };
    const left = hero.mods;
    const pct = (n: number): string => (left.length ? `${Math.round((n / left.length) * 100)}%` : '—');
    const crits = left.filter((m) => m.mult === 'x2' || m.temp === 'bless').length;
    const misses = left.filter((m) => m.mult === 'null' || m.temp === 'curse').length;
    const reshuffle = hero.modDiscard.some((m) => m.mult);
    modal(
      h(
        'div.col',
        { style: { width: 'min(640px, 92vw)', gap: '10px' } },
        h('h2', { style: { margin: 0 } }, `${hero.name}'s modifier deck`),
        h('div.small.dim', `${left.length} left to draw · ${hero.modDiscard.length} drawn · chance of ×2 ${pct(crits)} · chance of ×0 ${pct(misses)}`),
        h('h3', { style: { margin: 0 } }, `Left to draw (${left.length})`),
        grid(left, 'Nothing left: the discard is shuffled back in on the next draw.'),
        h('h3', { style: { margin: 0 } }, `Drawn (${hero.modDiscard.length})`),
        grid(hero.modDiscard, 'Nothing drawn yet.'),
        reshuffle ? h('div.small.accent', 'A ×2 or ×0 has been drawn: the whole deck is shuffled at the end of this round.') : h('div.small.dim', 'The deck is shuffled at the end of a round in which a ×2 or ×0 was drawn.'),
        h('div.tiny.dim', 'Bless (×2) and Curse (×0) cards leave the game once drawn. Rolling cards (↻) draw another card and add it.'),
      ),
    );
  }

  function pileButton(hero: HeroUnit, label: string, cards: string[]): HTMLElement {
    return h(
      'button.tiny',
      {
        onclick: () => {
          if (!cards.length) return;
          modal(h('div.col', h('h3', label), h('div.row.wrap', cards.map((c) => cardEl(heroCard(hero, c), { small: true })))));
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
        const myTurn = s.phase === 'turns' && s.heroTurn?.uid === hero.uid && !!s.heroTurn.started;
        const cur = s.heroTurn?.cur;
        const moving = !!cur && cur.steps[cur.step]?.t === 'move';
        const notNow = d.when === 'move' && !moving;
        return h('button.tiny', { disabled: d.use === 'passive' || it.state !== 'ready' || !myTurn || notNow, title: `${d.name}: ${d.text} (${d.use})${notNow ? ' · use it while moving' : ''}`, onclick: () => (d.fx.recover && hero.discard.length ? chooseDiscards(hero, it.id) : send({ t: 'item', uid: hero.uid, item: it.id })) }, `${d.name}${it.state !== 'ready' ? ' ✓' : ''}`);
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
    const piles = h(
      'span.row',
      { style: { gap: '4px' } },
      pileButton(hero, 'Discard', hero.discard),
      pileButton(hero, 'Lost', hero.lost),
      hero.active.length ? pileButton(hero, 'Active', hero.active.map((a) => a.card)) : null,
      h('button.tiny', { title: 'Your attack modifier deck: what can still be drawn, and what has been drawn', onclick: () => modsModal(hero) }, `🂠 Modifiers (${hero.mods.length})`),
    );

    if (hero.exhausted) {
      prompt.append(h('span.what', hero.escaped ? `${hero.name} escaped.` : `${hero.name} is exhausted.`), h('span.dim', 'The union fights on without them.'));
      return;
    }

    if (s.phase === 'select') {
      if (hero.ready) {
        prompt.append(
          hero.longRest ? restBanner(`${hero.name} is LONG RESTING this round`, 'No cards this round. Initiative 99, so they go last: then heal 2, refresh spent items, and choose one discarded card to lose. The rest come back to the hand.') : h('span.what', `${hero.name} is ready: ${hero.picked.map((c) => cardDef(c).name).join(' + ')}.`),
          h('button', { onclick: () => send({ t: 'unready', uid: hero.uid }) }, 'Change'),
          waitingText(s),
          placing(s) ? h('span.small', { style: { color: '#7cc4ff' } }, 'You can still move to another blue start hex until the round begins.') : '',
        );
        for (const c of hero.picked) {
          const el = cardEl(heroCard(hero, c), { small: true });
          starPlan(el, hero, c, hero.picked, s.round);
          row.appendChild(el);
        }
        return;
      }
      const canRest = hero.discard.length >= 2;
      const shortRestBtn = (primary: boolean): HTMLElement =>
        h(
          `button${primary ? '.primary' : ''}`,
          {
            disabled: !canRest || hero.shortRested,
            title: hero.shortRested
              ? 'You already short rested this round.'
              : 'Right now, for free: a random discarded card is lost and the rest come back to your hand. You may pay 1 HP once to lose a different random card instead.',
            onclick: () => send({ t: 'shortRest', uid: hero.uid }),
          },
          'Short rest',
        );
      const longRestBtn = (primary: boolean): HTMLElement =>
        h(
          `button${primary ? '.primary' : ''}`,
          { disabled: !canRest, title: 'Spend the whole round resting (initiative 99): heal 2, refresh spent items, and choose which discarded card to lose.', onclick: () => send({ t: 'longRest', uid: hero.uid }) },
          'Long rest',
        );
      // a short rest in progress: accept the random loss, or pay 1 HP to lose a different random card instead
      if (hero.restDraw) {
        const d = hero.restDraw;
        const others = hero.discard.filter((c) => c !== d.card).length;
        prompt.append(
          h('span.what', `Short rest: ${cardDef(d.card).name} will be lost.`),
          h('button.primary', { onclick: () => send({ t: 'restKeep', uid: hero.uid }) }, `Lose ${cardDef(d.card).name}`),
          h(
            'button',
            {
              disabled: hero.hp <= 1 || others === 0,
              title: hero.hp <= 1 ? 'You need more than 1 HP to pay for it.' : 'Keep this card: suffer 1 damage and a different random discarded card is lost instead.',
              onclick: () => send({ t: 'restReroll', uid: hero.uid }),
            },
            'Pay 1 HP: lose a different random card',
          ),
          h('span.pile', `HP ${hero.hp}/${hero.maxHp}`),
        );
        const el = cardEl(heroCard(hero, d.card), { small: true });
        el.classList.add('picked');
        row.appendChild(el);
        for (const c of hero.discard) if (c !== d.card) row.appendChild(cardEl(heroCard(hero, c), { small: true }));
        return;
      }
      if (hero.hand.length < 2) {
        prompt.append(
          h('span.what', `${hero.name} has run out of cards in hand: rest to get them back.`),
          shortRestBtn(true),
          longRestBtn(false),
          piles,
          h('span.pile', `HP ${hero.hp}/${hero.maxHp}`),
        );
        for (const c of hero.hand) row.appendChild(cardEl(heroCard(hero, c), { small: true }));
        return;
      }
      localPick = localPick.filter((c) => hero.hand.includes(c));
      prompt.append(
        h('span.what', localPick.length === 0 ? `Pick two cards for ${hero.name}. The first sets initiative.` : localPick.length === 1 ? 'Pick one more card.' : 'Ready?'),
        h('span.small.dim', { title: 'The star stays on both cards this round, so you remember your plan on your turn.' }, '★ Right-click a top or bottom to plan which half you will play.'),
        placing(s) ? h('span.small', { style: { color: '#7cc4ff' } }, `Choose where ${hero.name} starts: drag them to a blue hex or click one. Locked in when the first round begins.`) : '',
        h('button.primary', { disabled: localPick.length !== 2, onclick: () => (send({ t: 'pick', uid: hero.uid, cards: localPick }), (localPick = [])) }, localPick.length === 2 ? `Ready (initiative ${cardDef(localPick[0]!).init})` : 'Ready'),
        longRestBtn(false),
        shortRestBtn(false),
        piles,
        h('span.pile', `HP ${hero.hp}/${hero.maxHp}`),
      );
      for (const c of hero.hand) {
        const el = cardEl(heroCard(hero, c), { small: true });
        el.classList.add('pick');
        const idx = localPick.indexOf(c);
        if (idx >= 0) {
          el.classList.add('picked');
          el.appendChild(h('div.pickno', String(idx + 1)));
        }
        el.addEventListener('click', () => {
          if (localPick.includes(c)) {
            localPick = localPick.filter((x) => x !== c);
            if (plans[hero.uid]?.card === c) delete plans[hero.uid];
          } else if (localPick.length < 2) localPick.push(c);
          else localPick = [localPick[0]!, c];
          render(match.state);
        });
        // right-click a half: star it as the half you plan to play (and the other card's opposite half)
        el.querySelectorAll('.half').forEach((hal, i) => {
          hal.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const half = i === 0 ? 'top' : 'bot';
            const cur = plans[hero.uid];
            if (cur && cur.round === s.round && cur.card === c && cur.half === half) delete plans[hero.uid];
            else {
              plans[hero.uid] = { round: s.round, card: c, half };
              if (!localPick.includes(c)) localPick = localPick.length < 2 ? [...localPick, c] : [localPick[0]!, c];
            }
            render(match.state);
          });
        });
        starPlan(el, hero, c, localPick, s.round);
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
      prompt.append(h('span.what', who), piles);
      if (hero.longRest) prompt.appendChild(restBanner(`${hero.name} is LONG RESTING this round`, 'No cards to play. At initiative 99 they heal 2, refresh items, and you choose a discarded card to lose.'));
      // what the one acting is using right now
      const label = (text: string): HTMLElement => h('div.small.dim', { style: { writingMode: 'vertical-rl', transform: 'rotate(180deg)', alignSelf: 'center' } }, text);
      if (slot?.kind === 'hero') {
        const actor = s.units.find((u) => u.uid === slot.who) as HeroUnit | undefined;
        if (actor && actor.uid !== hero.uid) {
          row.appendChild(label(actor.name));
          if (actor.longRest) row.appendChild(restBanner(`${actor.name} is long resting`, 'Healing 2, refreshing items and losing one discarded card.'));
          for (const c of actor.picked) {
            const el = cardEl(heroCard(actor, c), { small: true });
            const t = s.heroTurn;
            if (t?.uid === actor.uid) {
              const halves = el.querySelectorAll('.half');
              const used = t.used.find((u) => u.card === c);
              if (used) (halves[used.half === 'top' ? 0 : 1] as HTMLElement).classList.add('used');
              if (t.cur?.card === c) (halves[t.cur.half === 'top' ? 0 : 1] as HTMLElement).classList.add('playing');
            }
            row.appendChild(el);
          }
        }
      } else if (slot?.kind === 'monster') {
        const d = monsterDef(slot.who);
        const ab = d.abilities[s.drawn[slot.who] ?? -1];
        const any = s.units.find((u) => u.kind === 'monster' && u.monster === slot.who && !u.dead) as Extract<Unit, { kind: 'monster' }> | undefined;
        if (ab) {
          row.appendChild(label(d.name));
          row.appendChild(abilityEl(slot.who, ab, any?.stat ?? null));
        }
      }
      // and your own picks for this round
      if (row.childElementCount) row.appendChild(h('div', { style: { width: '2px', alignSelf: 'stretch', background: 'var(--line)', margin: '0 6px' } }));
      row.appendChild(label(hero.longRest ? `${hero.name}: resting` : `${hero.name}`));
      for (const c of hero.picked) {
        const el = cardEl(heroCard(hero, c), { small: true });
        el.style.opacity = '0.75';
        starPlan(el, hero, c, hero.picked, s.round);
        row.appendChild(el);
      }
      return;
    }
    if (p.kind === 'rest') {
      prompt.append(restBanner(`${hero.name} is LONG RESTING`, `Choose one discarded card to lose for the rest of the scenario. Then ${hero.name} heals 2, refreshes spent items, and the other discards return to the hand.`));
      for (const c of hero.discard) {
        const el = cardEl(heroCard(hero, c), { small: true });
        el.classList.add('pick');
        el.addEventListener('click', () => confirmRestLose(hero, c));
        row.appendChild(el);
      }
      if (!hero.discard.length) prompt.append(h('span.dim', 'Your discard pile is empty, so nothing is lost.'), h('button.primary', { onclick: () => send({ t: 'restLose', uid: hero.uid, card: '' }) }, 'Finish the rest'));
      // items can be used on a long rest turn too (spent ones refresh when the rest finishes)
      const it = itemRow(s, hero);
      if (it) handbar.appendChild(it);
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
    } else if (p.kind === 'element' && p.step && p.els?.length) {
      // the step can spend an element: spend it now or keep it for a later card
      const u = (p.step as { use?: { text?: string } }).use;
      const name = (e: string): string => e[0]!.toUpperCase() + e.slice(1);
      prompt.append(
        h('span.what', h('span', { html: stepText(p.step) }), ` · spend ${p.els.length > 1 ? 'an element' : name(p.els[0]!)} for ${u?.text ?? 'a bonus'}?`),
        ...p.els.map((e) => h(`button.primary.el-btn.el-${e}`, { onclick: () => send({ t: 'useEl', uid: hero.uid, el: e }) }, `Spend ${name(e)}${s.elements[e] === 1 ? ' (waning)' : ''}`)),
        h('button', { onclick: () => send({ t: 'useEl', uid: hero.uid, el: null }) }, 'Keep it'),
      );
    } else if (s.pushQ?.length) {
      // a push with more than one way to go: the player decides
      const q = s.pushQ[0]!;
      const target = s.units.find((u) => u.uid === q.uid);
      prompt.append(h('span.what', `Push ${target ? nameOf(target) : 'the enemy'}: click an orange hex to choose where it goes${q.left > 1 ? ` (${q.left} spaces left)` : ''}.`));
    } else if (p.step?.t === 'recover') {
      // Recover: choose up to N cards from the lost pile to take back into the hand
      const n = p.step.n;
      recoverPick = recoverPick.filter((c) => hero.lost.includes(c));
      prompt.append(
        h('span.what', `Recover up to ${n}: click lost cards to take them back into your hand (${recoverPick.length}/${n} chosen).`),
        h('button.primary', { onclick: () => { send({ t: 'recover', uid: hero.uid, cards: recoverPick }); recoverPick = []; } }, recoverPick.length ? `Recover ${recoverPick.length}` : 'Recover none'),
      );
      for (const c of hero.lost) {
        const el = cardEl(heroCard(hero, c), { small: true });
        el.classList.add('pick');
        if (recoverPick.includes(c)) el.classList.add('picked');
        el.addEventListener('click', () => {
          recoverPick = recoverPick.includes(c) ? recoverPick.filter((x) => x !== c) : recoverPick.length < n ? [...recoverPick, c] : recoverPick;
          render(match.state);
        });
        row.appendChild(el);
      }
      if (s.undo) prompt.appendChild(h('button', { onclick: () => send({ t: 'undo', uid: hero.uid }) }, '↶ Undo card'));
      return;
    } else if (p.step) {
      prompt.append(
        h('span.what', stepPrompt(p.step, s, hero)),
        h('button', { onclick: () => send({ t: 'skip', uid: hero.uid }) }, p.step.t === 'move' ? 'Done moving' : 'Skip'),
      );
    }
    // the half just chosen can be taken back until it is acted on
    if (s.undo) prompt.appendChild(h('button', { title: 'Take back the card half you just chose (Ctrl+Z). Only until you move, attack, skip or use an item.', onclick: () => send({ t: 'undo', uid: hero.uid }) }, '↶ Undo card'));
    for (const c of hero.picked) {
      const el = cardEl(heroCard(hero, c), { small: true });
      starPlan(el, hero, c, hero.picked, s.round);
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

  /** The unmissable "this hero is long resting" banner. */
  function restBanner(title: string, sub: string): HTMLElement {
    return h('div.rest-banner', h('span.rest-icon', '🛏'), h('div', h('div.rest-title', title), h('div.rest-sub', sub)));
  }

  /** Losing a card is permanent for the scenario: ask before sending it. */
  function confirmRestLose(hero: HeroUnit, c: string): void {
    const def = heroCard(hero, c);
    const close = modal(
      h(
        'div.col',
        { style: { alignItems: 'center', gap: '12px' } },
        h('h2', { style: { margin: 0 } }, `Lose ${def.name}?`),
        h('div.dim', { style: { maxWidth: '380px', textAlign: 'center' } }, 'It goes to the lost pile and stays there for the rest of the scenario. The other discarded cards come back to the hand.'),
        cardEl(def, { small: true }),
        h(
          'div.row',
          h('button.danger', { onclick: () => (close(), send({ t: 'restLose', uid: hero.uid, card: c })) }, `Lose ${def.name}`),
          h('button', { onclick: () => close() }, 'Pick a different card'),
        ),
      ),
    );
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
    let pair: string[] = [];
    const pairBtn = h('button', { disabled: true, onclick: () => answer(`discard:${pair.join(',')}`) }, 'Lose these two') as HTMLButtonElement;
    const discardRow = h('div.row.wrap');
    const drawDiscards = (): void => {
      clear(discardRow);
      for (const c of hero.discard) {
        const el = cardEl(heroCard(hero, c), { small: true });
        el.classList.add('pick');
        if (pair.includes(c)) {
          el.classList.add('picked');
          el.appendChild(h('div.pickno', String(pair.indexOf(c) + 1)));
        }
        el.addEventListener('click', () => {
          pair = pair.includes(c) ? pair.filter((x) => x !== c) : [...pair, c].slice(-2);
          pairBtn.disabled = pair.length !== 2;
          drawDiscards();
        });
        discardRow.appendChild(el);
      }
    };
    drawDiscards();
    const lethal = p.dmg >= hero.hp;
    const body = h(
      'div.col',
      h('h2', lethal ? `${hero.name} is about to fall!` : `A heavy hit on ${hero.name}!`),
      h('div', lethal ? `${p.by} hits for ${p.dmg}, enough to exhaust ${hero.name}. Lose cards to take no damage?` : `${p.by} hits for ${p.dmg} (half ${hero.name}'s max HP or more: HP ${hero.hp} → ${Math.max(0, hero.hp - p.dmg)}). Lose cards to take no damage?`),
      h('div.small.dim', 'Lose one card of your choice from your hand, or two of your choice from your discard pile. Conditions from the hit still apply.'),
      h('h3', choices.length ? 'From your hand: click one card to lose it' : 'No cards in hand you can lose'),
      h(
        'div.row.wrap',
        choices.map((c) => {
          const el = cardEl(heroCard(hero, c), { small: true });
          el.classList.add('pick');
          el.addEventListener('click', () => answer(c));
          return el;
        }),
      ),
      hero.discard.length >= 2 ? h('h3', 'Or from your discard pile: pick two') : '',
      hero.discard.length >= 2 ? discardRow : '',
      h('div.row', hero.discard.length >= 2 ? pairBtn : '', h('button.danger', { onclick: () => answer('take') }, `Take ${p.dmg} damage`)),
    );
    let answered = false;
    const wrap = h('div', body);
    // nothing happens until the choice is confirmed
    const answer = (choice: string): void => {
      const names = choice === 'take' ? [] : choice.startsWith('discard:') ? choice.slice(8).split(',') : [choice];
      const what =
        choice === 'take'
          ? `Take ${p.dmg} damage? ${hero.name} goes from ${hero.hp} to ${Math.max(0, hero.hp - p.dmg)} HP${p.dmg >= hero.hp ? ' and is exhausted' : ''}.`
          : `Lose ${names.map((c) => heroCard(hero, c).name).join(' and ')} for the rest of the scenario and take no damage?`;
      wrap.replaceChildren(
        h(
          'div.col',
          { style: { alignItems: 'center', gap: '12px' } },
          h('h2', { style: { margin: 0 } }, choice === 'take' ? 'Take the hit?' : 'Avoid the damage?'),
          h('div', { style: { maxWidth: '440px', textAlign: 'center' } }, what),
          names.length ? h('div.row', names.map((c) => cardEl(heroCard(hero, c), { small: true }))) : null,
          h(
            'div.row',
            h(`button.${choice === 'take' ? 'danger' : 'primary'}`, {
              onclick: () => {
                answered = true;
                negateClose?.();
                negateClose = null;
                send({ t: 'negate', uid: hero.uid, choice });
              },
            }, choice === 'take' ? `Take ${p.dmg} damage` : names.length > 1 ? 'Lose both cards' : 'Lose the card'),
            h('button', { onclick: () => wrap.replaceChildren(body) }, 'Back'),
          ),
        ),
      );
    };
    // clicking outside the dialog must not leave the question unanswered: it comes straight back
    negateClose = modal(wrap, () => {
      if (answered) return;
      negateClose = null;
      setTimeout(() => renderPending(match.state), 0);
    });
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
        h('div', '3. On your turn, play the TOP half of one card and the BOTTOM half of the other, in either order. Any top can be a basic Attack 2, any bottom a basic Move 2. Picked the wrong half? Undo (Ctrl+Z) takes it back until you move, attack, skip or use an item.'),
        h('div', '4. Played cards go to your discard pile. Halves marked LOST remove the card for the scenario.'),
        h('div', '5. Short rest (between rounds): everything comes back except one random card, which is lost. Long rest (takes your turn): heal 2, refresh items, lose one card of your choice.'),
        h('div', 'Run out of cards and you are exhausted. If a hit would knock you out, you may lose a card instead.'),
        h('h3', 'Dungeon Joe rules, Shoallhell style'),
        h('div', h('span.redtag', { style: { color: '#ff4a3a', fontWeight: '800' } }, 'RED'), ' attacks ignore Shield. ', h('span', { style: { color: '#8fd3ff', fontWeight: '800' } }, 'BLUE'), ' attacks hit every hero in their area.'),
        h('div', 'Weakness chart: Magic beats Holy, Holy beats Void, Void beats Fire, Fire beats Magic (+1 damage when strong, −1 when weak). Infused elements are strong this round and waning the next; cards can spend them for bonuses.'),
        h('div.small.dim', 'Controls: drag your hero to move (or click a blue hex), click enemies to attack. Right-click a hex to ping it for everyone in the game. Move the view by dragging empty ground or with WASD / arrow keys; zoom with the mouse wheel or + and −; F fits the map. Rooms stay dark and their monsters asleep until someone opens the door. Hover anything for details.'),
      ),
    );
  }

  // ---------------------------------------------------------------- main render
  function render(s: CombatState): void {
    board.setState(s);
    const tu = s.heroTurn?.uid ? `${s.round}:${s.heroTurn.uid}` : null;
    if (tu !== lastTurnUid) {
      lastTurnUid = tu;
      const hu = s.heroTurn ? mine(s).find((x) => x.uid === s.heroTurn!.uid) : undefined;
      if (hu) board.ensureVisible(hu.x, hu.y);
    }
    // ring at the start of anything you need to do: picking cards or resting, your turn, an avoid-damage question
    // (the sound is chosen in the hall's ⚙ Settings)
    const need = needKey(s);
    if (need !== lastNeed) {
      lastNeed = need;
      if (need) playChime();
    }
    highlights(s);
    renderTop(s);
    renderTrack(s);
    renderStrip(s);
    renderLog(s);
    renderHand(s);
    // keep the hover panel in the corner just above the hand, however tall the hand is
    placeInspect();
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
    offPing();
    window.removeEventListener('keydown', onUndoKey);
    board.destroy();
    negateClose?.();
  };
}
