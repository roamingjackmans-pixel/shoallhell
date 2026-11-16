// The co-op lobby: host a room (six-digit code) or join one, see who is bringing which heroes, and (host) pick a
// scenario and start. Guests send the host their heroes' full setups; the host runs the fight.
import { session } from '../app';
import { CLASSES } from '../data/classes';
import { scenarioById, type ScenarioDef } from '../data/story';
import { heroSetup, makeDelve, scenarioLevel, scenarioList, type Character } from '../game/campaign';
import type { HeroSetup } from '../game/rules';
import { Coop, type RoomView } from '../net/coop';
import { heroPortrait } from '../render/hero';
import { clear, h, toast } from './dom';

export interface LobbyNav {
  /** host: start the fight with every player's setups */
  hostStart(coop: Coop, sc: ScenarioDef, setups: HeroSetup[], level: number): void;
  /** guest: the host started */
  guestStart(coop: Coop, sc: ScenarioDef, state: unknown): void;
  back(): void;
}

export function lobbyScreen(root: HTMLElement, chars: Character[], nav: LobbyNav, existing?: Coop): () => void {
  const s = session!;
  clear(root);
  const screen = h('div.screen.bgwater');
  root.appendChild(screen);
  const panel = h('div.panel.col', { style: { width: 'min(900px, 94vw)', margin: '4vh auto', gap: '12px' } });
  screen.appendChild(panel);
  let coop: Coop | null = existing ?? null;
  let room: RoomView | null = existing?.room ?? null;
  const setups = new Map<string, HeroSetup[]>();
  const offs: (() => void)[] = [];
  let chosen: ScenarioDef | null = null;
  const myChars = chars.slice(0, 4);
  const roomChars = myChars.map((c) => ({ charId: c.id, name: c.name, cls: c.cls, level: c.level }));
  const mySetups = (): HeroSetup[] => myChars.map((c) => heroSetup(c, s.user.id));

  const wire = (c: Coop): void => {
    offs.push(
      c.on('room', (r: RoomView) => {
        room = r;
        draw();
      }),
      c.on('closed', (m: { reason: string }) => {
        toast(m.reason || 'The room closed.');
        room = null;
        draw();
      }),
      c.on('guestmsg', (m: { from: string; msg: { type: string; setups?: HeroSetup[] } }) => {
        if (m.msg?.type === 'setups' && Array.isArray(m.msg.setups)) {
          setups.set(
            m.from,
            m.msg.setups.slice(0, 4).map((x) => ({ ...x, owner: m.from })),
          );
          draw();
        }
      }),
      c.on('guestleft', (m: { userId: string }) => {
        setups.delete(m.userId);
        draw();
      }),
      c.on('hostmsg', (m: { type: string; sc?: ScenarioDef; state?: unknown; pick?: ScenarioDef | null }) => {
        if (m.type === 'start' && m.sc && m.state) {
          cleanup(false);
          nav.guestStart(c, m.sc, m.state);
        } else if (m.type === 'pick') {
          chosen = m.pick ?? null;
          draw();
        } else if (m.type === 'need-setups') c.toHost({ type: 'setups', setups: mySetups() });
      }),
    );
  };

  const connect = async (): Promise<Coop> => {
    if (coop) return coop;
    coop = await Coop.connect();
    wire(coop);
    return coop;
  };
  if (existing) {
    wire(existing);
    if (existing.isHost) {
      setups.set(s.user.id, mySetups());
      existing.toGuests({ type: 'need-setups' });
    } else existing.toHost({ type: 'setups', setups: mySetups() });
  }

  const codeIn = h('input', { placeholder: '6-digit code', maxlength: '6', inputmode: 'numeric', style: { width: '140px', fontSize: '20px', letterSpacing: '4px' } }) as HTMLInputElement;

  function draw(): void {
    clear(panel);
    panel.append(h('div.row', h('h2', { style: { margin: 0 } }, 'Co-op'), h('div.grow'), h('button', { onclick: () => (cleanup(true), nav.back()) }, '← Back to the hall')));
    panel.appendChild(h('div.small.dim', `You bring: ${myChars.map((c) => `${c.name} (${CLASSES[c.cls]!.name} ${c.level})`).join(', ')}. Change your party in the hall.`));
    if (!room) {
      panel.append(
        h(
          'div.row.wrap',
          { style: { gap: '18px', alignItems: 'flex-start' } },
          h(
            'div.depth.col',
            { style: { flex: '1', minWidth: '260px' } },
            h('h3', 'Host a game'),
            h('div.small', 'You pick the scenario from your campaign. Friends join with your code.'),
            h(
              'button.primary',
              {
                onclick: async () => {
                  try {
                    const c = await connect();
                    room = await c.host(roomChars);
                    setups.set(s.user.id, mySetups());
                    draw();
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'Could not host.');
                  }
                },
              },
              'Host',
            ),
          ),
          h(
            'div.depth.col',
            { style: { flex: '1', minWidth: '260px' } },
            h('h3', 'Join a game'),
            h('div.row', codeIn, h('button.primary', { onclick: () => join() }, 'Join')),
          ),
        ),
      );
      return;
    }
    const isHost = !!coop?.isHost;
    panel.appendChild(h('div', { style: { fontSize: '22px' } }, 'Room code: ', h('b', { style: { letterSpacing: '6px', color: 'var(--glowen)' } }, room.code), h('span.small.dim', isHost ? '  — share it with up to three friends' : '')));
    const totalHeroes = room.players.reduce((n, p) => n + p.chars.length, 0);
    panel.appendChild(
      h(
        'div.col',
        room.players.map((p) =>
          h(
            'div.depth.row.wrap',
            h('b', { style: { minWidth: '140px' } }, p.name, p.userId === room!.host ? h('span.badge', ' host') : null),
            p.chars.map((c) => h('div.row', { style: { gap: '4px' } }, heroPortrait(c.cls, 40), h('span.small', `${c.name} · ${CLASSES[c.cls]?.name ?? c.cls} ${c.level}`))),
            isHost && p.userId !== s.user.id && !setups.has(p.userId) ? h('span.small.dim', 'getting their heroes…') : null,
          ),
        ),
      ),
    );
    if (totalHeroes > 4) panel.appendChild(h('div.bad', `That is ${totalHeroes} heroes; the table holds four. Somebody bring fewer (choose your party in the hall).`));
    if (isHost) {
      const prof = s.profile;
      const list = scenarioList(prof).filter((x) => x.open);
      const sel = h(
        'select',
        { style: { minWidth: '320px' } },
        h('option', { value: '' }, 'Choose a scenario…'),
        list.map((x) => h('option', { value: x.sc.id, selected: chosen?.id === x.sc.id }, `Depth ${x.sc.depth} · ${x.sc.name}${x.done ? ' (done)' : ''}`)),
        h('option', { value: 'delve', selected: chosen?.id.startsWith('delve') }, 'Riptide Delve (random)'),
      ) as HTMLSelectElement;
      sel.addEventListener('change', () => {
        chosen = sel.value === 'delve' ? makeDelve(prof, Math.floor(Math.random() * 1e6)) : sel.value ? scenarioById(sel.value) ?? null : null;
        coop?.toGuests({ type: 'pick', pick: chosen });
        draw();
      });
      const all = [...setups.values()].flat();
      const ready = chosen && all.length > 0 && all.length <= 4 && room.players.every((p) => setups.has(p.userId));
      const level = scenarioLevel(
        all.map((x) => x.level),
        chosen?.depth ?? 1,
        prof.difficulty,
      );
      panel.append(
        h('div.row.wrap', sel, chosen ? h('span.small.dim', `Scenario level ${level}`) : null),
        chosen ? h('div.small.dim', chosen.intro[0] ?? '') : '',
        h('button.primary.big', { disabled: !ready, onclick: () => start(level) }, 'Start the scenario'),
      );
    } else {
      panel.append(h('div', chosen ? `The host picked: ${chosen.name}` : 'Waiting for the host to pick a scenario…'));
    }
  }

  async function join(): Promise<void> {
    const code = codeIn.value.trim();
    if (!/^\d{6}$/.test(code)) {
      toast('Codes are six digits.');
      return;
    }
    try {
      const c = await connect();
      room = await c.join(code, roomChars);
      c.toHost({ type: 'setups', setups: mySetups() });
      draw();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not join.');
    }
  }

  function start(level: number): void {
    if (!coop || !chosen) return;
    const all = [...setups.values()].flat().slice(0, 4);
    cleanup(false);
    nav.hostStart(coop, chosen, all, level);
  }

  function cleanup(closeSocket: boolean): void {
    for (const o of offs) o();
    offs.length = 0;
    if (closeSocket && coop) {
      coop.leave();
      coop.close();
      coop = null;
    }
  }

  draw();
  return () => cleanup(false);
}
