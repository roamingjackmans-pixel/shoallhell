// Friends: your 4-number friend code, adding friends by code, requests, who is online and in which co-op lobby,
// and one-tap Invite / Join. Invites from friends pop up wherever you are in the game.
import { api, type FriendInfo, type FriendsView } from '../net/api';
import { Coop } from '../net/coop';
import { clear, h, modal, toast } from './dom';

let cached: FriendsView | null = null;
const listeners = new Set<() => void>();

/** The last friends view fetched (for badges); refreshed whenever the server says something changed. */
export function friendsCache(): FriendsView | null {
  return cached;
}

export async function refreshFriends(): Promise<FriendsView | null> {
  try {
    cached = await api.friends();
  } catch {
    /* offline: keep what we had */
  }
  for (const f of listeners) f();
  return cached;
}

export function onFriendsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface FriendsNav {
  /** join a co-op lobby by its code (from an invite or the friends list) */
  joinLobby(code: string): void;
}

let wired = false;

/** Start listening for friend updates and invites on the shared connection (once per sign-in). */
export async function startFriends(nav: FriendsNav): Promise<void> {
  void refreshFriends();
  if (wired) return;
  wired = true;
  try {
    const coop = await Coop.shared();
    coop.on('friends', () => void refreshFriends());
    coop.on('invite', (m: { fromName: string; code: string; game?: string }) => showInvite(m, nav));
    coop.on('reattached', () => void refreshFriends());
  } catch {
    wired = false;
  }
}

export function stopFriends(): void {
  wired = false;
  cached = null;
}

/** Smash Your Bros shares these accounts and friends; its lobbies open in that game */
const SYB_URL = 'https://josephjackman.com/games/smashyourbros/';

function showInvite(m: { fromName: string; code: string; game?: string }, nav: FriendsNav): void {
  if (m.game === 'syb') {
    const close2 = modal(
      h(
        'div.col',
        { style: { width: 'min(420px, 90vw)' } },
        h('h2', '🥊 Smash Your Bros invite'),
        h('div', h('b', m.fromName), ` invites you to their Smash Your Bros lobby (${m.code}).`),
        h(
          'div.row',
          h('button.primary', { onclick: () => (close2(), window.open(`${SYB_URL}?join=${m.code}`, '_blank')) }, 'Open Smash Your Bros'),
          h('button', { onclick: () => close2() }, 'Not now'),
        ),
      ),
    );
    return;
  }
  const close = modal(
    h(
      'div.col',
      { style: { width: 'min(420px, 90vw)' } },
      h('h2', '👥 Co-op invite'),
      h('div', h('b', m.fromName), ' invites you to their co-op lobby.'),
      h(
        'div.row',
        h('button.primary', { onclick: () => (close(), nav.joinLobby(m.code)) }, 'Join'),
        h('button', { onclick: () => close() }, 'Not now'),
      ),
    ),
  );
}

/** Pending friend requests, for the badge on the Friends button. */
export function friendBadge(): HTMLElement | string {
  const n = cached?.incoming.length ?? 0;
  return n ? h('span.badge.alert', ` ${n}`) : '';
}

/**
 * The Friends window. `inLobby` adds Invite buttons (you are in a co-op lobby and can bring friends in).
 */
export function friendsModal(nav: FriendsNav, inLobby = false): void {
  const body = h('div.col', { style: { width: 'min(560px, 92vw)', gap: '10px' } });
  const codeIn = h('input', { placeholder: 'Friend code', maxlength: '4', inputmode: 'numeric', style: { width: '120px', fontSize: '18px', letterSpacing: '4px' } }) as HTMLInputElement;
  const err = h('div.err');
  const draw = (v: FriendsView | null): void => {
    clear(body);
    body.append(
      h('h2', { style: { margin: 0 } }, '👥 Friends'),
      v ? h('div', 'Your friend code: ', h('b', { style: { fontSize: '22px', letterSpacing: '6px', color: 'var(--glowen)' } }, v.code), h('span.small.dim', '  — give it to a friend so they can add you')) : h('div.dim', 'Loading…'),
      h(
        'form.row',
        { onsubmit: (e: Event) => (e.preventDefault(), void add()) },
        codeIn,
        h('button.primary', { type: 'submit' }, 'Add friend'),
      ),
      err,
    );
    if (!v) return;
    if (v.incoming.length) {
      body.appendChild(h('h3', 'Friend requests'));
      for (const f of v.incoming)
        body.appendChild(
          h(
            'div.depth.row',
            h('div.grow', h('b', f.name), h('span.small.dim', ` · ${f.code}`)),
            h('button.primary.tiny', { onclick: () => void act(() => api.acceptFriend(f.id)) }, 'Accept'),
            h('button.tiny', { onclick: () => void act(() => api.removeFriend(f.id)) }, 'Decline'),
          ),
        );
    }
    body.appendChild(h('h3', `Friends (${v.friends.length})`));
    if (!v.friends.length) body.appendChild(h('div.small.dim', 'No friends yet. Swap friend codes with someone you play with.'));
    const sorted = [...v.friends].sort((a, b) => Number(!!b.online) - Number(!!a.online) || a.name.localeCompare(b.name));
    for (const f of sorted) body.appendChild(friendRow(f));
    if (v.outgoing.length) {
      body.appendChild(h('h3', 'Waiting for them to add you back'));
      for (const f of v.outgoing)
        body.appendChild(h('div.depth.row', h('div.grow', h('b', f.name), h('span.small.dim', ` · ${f.code}`)), h('button.tiny', { onclick: () => void act(() => api.removeFriend(f.id)) }, 'Cancel')));
    }
  };
  const friendRow = (f: FriendInfo): HTMLElement => {
    const syb = f.game === 'syb';
    const status = syb ? (f.lobby ? `in a Smash Your Bros lobby (${f.lobby})` : 'playing Smash Your Bros') : f.lobby ? `in a co-op lobby (${f.lobby})` : f.online ? 'online' : 'offline';
    return h(
      'div.depth.row',
      h('span', { style: { color: f.online ? 'var(--good)' : 'var(--dim)', fontSize: '18px' } }, '●'),
      h('div.grow', h('b', f.name), h('div.small.dim', status)),
      inLobby && f.online && !f.lobby ? h('button.primary.tiny', { onclick: () => void invite(f) }, 'Invite') : '',
      f.lobby && !inLobby && !syb ? h('button.primary.tiny', { onclick: () => (close(), nav.joinLobby(f.lobby!)) }, 'Join') : '',
      f.lobby && syb ? h('button.tiny', { onclick: () => window.open(`${SYB_URL}?join=${f.lobby}`, '_blank') }, 'Open') : '',
      h('button.tiny', { title: 'Unfriend', onclick: () => confirm(`Remove ${f.name} from your friends?`) && void act(() => api.removeFriend(f.id)) }, '✕'),
    );
  };
  const act = async (fn: () => Promise<{ view: FriendsView }>): Promise<void> => {
    try {
      cached = (await fn()).view;
      draw(cached);
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'Something went wrong.';
    }
  };
  const add = async (): Promise<void> => {
    err.textContent = '';
    const code = codeIn.value.replace(/\D/g, '');
    if (code.length !== 4) {
      err.textContent = 'Friend codes are 4 numbers.';
      return;
    }
    try {
      const r = await api.addFriend(code);
      cached = r.view;
      toast(r.friends ? 'You are now friends.' : 'Request sent. They will see it next time they play.');
      codeIn.value = '';
      draw(cached);
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'Could not add them.';
    }
  };
  const invite = async (f: FriendInfo): Promise<void> => {
    try {
      await (await Coop.shared()).invite(f.id);
      toast(`Invite sent to ${f.name}.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not invite.');
    }
  };
  draw(cached);
  const off = onFriendsChange(() => draw(cached));
  const close = modal(body, off);
  void refreshFriends();
}
