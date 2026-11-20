// The co-op lobby. Everyone joins the lobby (a 4-digit room code, a friend's invite, or Join from the friends list),
// not a single mission: the host picks a scenario and starts it, everyone plays it, and afterwards everyone is back
// here for the next one — guests are pulled into each new mission automatically. Each player chooses here which of
// their own heroes to bring (from their current campaign) and keeps everything those heroes earn.
import { session } from '../app';
import { CLASSES } from '../data/classes';
import { scenarioById, type ScenarioDef } from '../data/story';
import { camp, heroSetup, makeDelve, scenarioLevel, scenarioList, type Character } from '../game/campaign';
import type { HeroSetup } from '../game/rules';
import type { Coop, RoomChar } from '../net/coop';
import { heroPortrait } from '../render/hero';
import { clear, h, toast } from './dom';
import { friendsModal } from './friends';

/** One co-op session: from opening/joining a room until leaving it, across any number of missions. */
export interface CoopSession {
  coop: Coop;
  /** the heroes this player brings (ids in their current campaign) */
  charIds: string[];
  /** host: every player's hero setups, by user id */
  setups: Map<string, HeroSetup[]>;
  /** the scenario the host has picked */
  chosen: ScenarioDef | null;
  /** a mission is being played right now (by us) */
  inMatch: boolean;
  /** guest: the host is busy with a mission we are not part of */
  hostBusy: string | null;
  offs: (() => void)[];
}

export interface LobbyNav {
  /** host a new room */
  host(charIds: string[]): void;
  /** join a room by its code */
  join(code: string, charIds: string[]): void;
  /** host: start the picked scenario with everyone's heroes */
  start(sc: ScenarioDef, setups: HeroSetup[], level: number): void;
  /** leave the co-op game (back to the hall) */
  leave(): void;
  /** back to the hall without opening a room */
  back(): void;
}

export function myChars(): Character[] {
  return camp(session!.profile).characters.filter((c) => !c.retired);
}

export function roomChars(ids: string[]): RoomChar[] {
  return myChars()
    .filter((c) => ids.includes(c.id))
    .map((c) => ({ charId: c.id, name: c.name, cls: c.cls, level: c.level }));
}

export function setupsFor(ids: string[]): HeroSetup[] {
  const me = session!.user.id;
  return myChars()
    .filter((c) => ids.includes(c.id))
    .map((c) => heroSetup(c, me));
}

export function lobbyScreen(root: HTMLElement, nav: LobbyNav, cs: CoopSession | null, defaultIds: string[]): () => void {
  const s = session!;
  clear(root);
  const screen = h('div.screen.bgwater');
  root.appendChild(screen);
  const panel = h('div.panel.col', { style: { width: 'min(920px, 94vw)', margin: '4vh auto', gap: '12px' } });
  screen.appendChild(panel);
  const offs: (() => void)[] = [];
  let pickIds = cs ? [...cs.charIds] : defaultIds.filter((id) => myChars().some((c) => c.id === id)).slice(0, 4);
  if (!pickIds.length) pickIds = myChars().slice(0, 1).map((c) => c.id);

  const codeIn = h('input', { placeholder: '4-digit code', maxlength: '4', inputmode: 'numeric', style: { width: '130px', fontSize: '20px', letterSpacing: '6px' } }) as HTMLInputElement;

  if (cs) {
    const redraw = (): void => draw();
    offs.push(cs.coop.on('room', redraw), cs.coop.on('guestmsg', redraw), cs.coop.on('hostmsg', redraw), cs.coop.on('guestleft', redraw), cs.coop.on('hostaway', redraw), cs.coop.on('hostback', redraw));
  }

  /** change which heroes this player brings; tell the room */
  const setPicks = (ids: string[]): void => {
    pickIds = ids;
    if (!cs) return draw();
    cs.charIds = ids;
    cs.coop.setChars(roomChars(ids));
    if (cs.coop.isHost) cs.setups.set(s.user.id, setupsFor(ids));
    else cs.coop.toHost({ type: 'setups', setups: setupsFor(ids) });
    draw();
  };

  function heroPicker(): HTMLElement {
    const chars = myChars();
    if (!chars.length) return h('div.bad', 'Your current campaign has no tenants yet. Recruit one in the hall first.');
    return h(
      'div.col',
      h('h3', { style: { margin: 0 } }, 'Your heroes', h('span.small.dim', ` (from “${camp(s.profile).name}”, up to 4 at the table in total)`)),
      h(
        'div.row.wrap',
        chars.map((c) => {
          const on = pickIds.includes(c.id);
          return h(
            `div.charcard${on ? '.sel' : ''}`,
            { style: { gridTemplateColumns: '44px 1fr', minWidth: '190px' }, onclick: () => setPicks(on ? pickIds.filter((x) => x !== c.id) : [...pickIds, c.id].slice(-4)) },
            heroPortrait(c.cls, 44),
            h('div', h('div.name', c.name), h('div.small.dim', `${CLASSES[c.cls]!.name} ${c.level}`), h('div.tiny', on ? h('span.good', 'Bringing') : h('span.dim', 'Click to bring'))),
          );
        }),
      ),
    );
  }

  function draw(): void {
    clear(panel);
    panel.append(
      h(
        'div.row',
        h('h2', { style: { margin: 0 } }, 'Co-op'),
        h('div.grow'),
        h('button', { onclick: () => friendsModal({ joinLobby: (code) => nav.join(code, pickIds) }, !!cs) }, cs ? '👥 Invite friends' : '👥 Friends'),
        cs ? h('button.danger', { onclick: () => nav.leave() }, 'Leave co-op') : h('button', { onclick: () => (cleanup(), nav.back()) }, '← Back to the hall'),
      ),
    );
    if (!cs) {
      panel.append(
        heroPicker(),
        h(
          'div.row.wrap',
          { style: { gap: '18px', alignItems: 'flex-start' } },
          h(
            'div.depth.col',
            { style: { flex: '1', minWidth: '260px' } },
            h('h3', 'Host a game'),
            h('div.small', 'Open a lobby. Friends join with the 4-digit code or from your invites, and stay for as many missions as you like.'),
            h('button.primary', { disabled: !pickIds.length, onclick: () => nav.host(pickIds) }, 'Open a lobby'),
          ),
          h(
            'div.depth.col',
            { style: { flex: '1', minWidth: '260px' } },
            h('h3', 'Join a game'),
            h(
              'form.row',
              {
                onsubmit: (e: Event) => {
                  e.preventDefault();
                  const code = codeIn.value.trim();
                  if (!/^\d{4,5}$/.test(code)) return toast('Room codes are 4 digits.');
                  nav.join(code, pickIds);
                },
              },
              codeIn,
              h('button.primary', { type: 'submit', disabled: !pickIds.length }, 'Join'),
            ),
            h('div.small.dim', 'Or open 👥 Friends and press Join next to a friend who is in a lobby.'),
          ),
        ),
      );
      return;
    }
    const room = cs.coop.room;
    if (!room) {
      panel.appendChild(h('div.dim', 'Reconnecting…'));
      return;
    }
    const isHost = cs.coop.isHost;
    panel.appendChild(
      h(
        'div',
        { style: { fontSize: '22px' } },
        'Room code: ',
        h('b', { style: { letterSpacing: '8px', color: 'var(--glowen)' } }, room.code),
        h('span.small.dim', isHost ? '  — friends can join with this code, or invite them' : ''),
      ),
    );
    if (room.hostOnline === false) panel.appendChild(h('div.bad', 'The host lost their connection. Waiting a few minutes for them to come back…'));
    const total = room.players.reduce((n, p) => n + p.chars.length, 0);
    panel.appendChild(
      h(
        'div.col',
        room.players.map((p) =>
          h(
            'div.depth.row.wrap',
            h('span', { style: { color: p.online ? 'var(--good)' : 'var(--dim)', fontSize: '18px' }, title: p.online ? 'Connected' : 'Disconnected (their seat is kept)' }, '●'),
            h('b', { style: { minWidth: '140px' } }, p.name, p.userId === room.host ? h('span.badge', ' host') : '', p.online ? '' : h('span.small.dim', ' (reconnecting)')),
            p.chars.length
              ? p.chars.map((c) => h('div.row', { style: { gap: '4px' } }, heroPortrait(c.cls, 40), h('span.small', `${c.name} · ${CLASSES[c.cls]?.name ?? c.cls} ${c.level}`)))
              : h('span.small.dim', 'no heroes picked'),
          ),
        ),
      ),
    );
    if (total > 4) panel.appendChild(h('div.bad', `That is ${total} heroes; the table holds four. Somebody bring fewer.`));
    panel.appendChild(heroPicker());
    if (isHost) {
      const k = camp(s.profile);
      const list = scenarioList(k).filter((x) => x.open);
      const sel = h(
        'select',
        { style: { minWidth: '320px' } },
        h('option', { value: '' }, 'Choose a scenario…'),
        list.map((x) => h('option', { value: x.sc.id, selected: cs.chosen?.id === x.sc.id }, `Depth ${x.sc.depth} · ${x.sc.name}${x.done ? ' (done)' : ''}`)),
        h('option', { value: 'delve', selected: !!cs.chosen?.id.startsWith('delve') }, 'Riptide Delve (random)'),
      ) as HTMLSelectElement;
      sel.addEventListener('change', () => {
        cs.chosen = sel.value === 'delve' ? makeDelve(k, Math.floor(Math.random() * 1e6)) : sel.value ? scenarioById(sel.value) ?? null : null;
        cs.coop.toGuests({ type: 'pick', pick: cs.chosen });
        draw();
      });
      cs.setups.set(s.user.id, setupsFor(cs.charIds));
      const present = room.players.filter((p) => p.online);
      const all = present.flatMap((p) => cs.setups.get(p.userId) ?? []);
      const missing = present.filter((p) => p.chars.length && !cs.setups.has(p.userId)).map((p) => p.name);
      const level = scenarioLevel(
        all.map((x) => x.level),
        cs.chosen?.depth ?? 1,
      );
      const ready = !!cs.chosen && all.length > 0 && all.length <= 4 && !missing.length;
      panel.append(
        h('h3', { style: { margin: 0 } }, 'Next mission', h('span.small.dim', ` (from your campaign “${k.name}”)`)),
        h('div.row.wrap', sel, cs.chosen ? h('span.small.dim', `Scenario level ${level} · ${k.difficulty === 'hardcore' ? 'Hardcore' : 'Normal'}`) : ''),
        cs.chosen ? h('div.small.dim', cs.chosen.intro[0] ?? '') : '',
        missing.length ? h('div.small.dim', `Waiting for ${missing.join(', ')} to send their heroes…`) : '',
        h('button.primary.big', { disabled: !ready, onclick: () => nav.start(cs.chosen!, all, level) }, 'Start the mission'),
        h('div.small.dim', 'Everyone in the lobby comes along. After the mission you all come back here for the next one.'),
      );
    } else {
      panel.append(
        h('h3', { style: { margin: 0 } }, 'Next mission'),
        cs.hostBusy
          ? h('div', `The host is on a mission (${cs.hostBusy}). You will come along on the next one.`)
          : h('div', cs.chosen ? `The host picked: ${cs.chosen.name}. Waiting for them to start…` : 'Waiting for the host to pick a scenario…'),
        h('div.small.dim', 'You will be taken into each mission the host starts. Nothing else to do here.'),
      );
    }
  }

  function cleanup(): void {
    for (const o of offs) o();
    offs.length = 0;
  }

  draw();
  return cleanup;
}
