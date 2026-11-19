// Friends: every account gets a permanent 4-number friend code. Adding a code sends a request (it waits if they are
// offline); when they add you back or accept, you are friends both ways. Friends see each other online, see who is in
// a co-op lobby, and can invite each other without a room code (the invite itself is a socket event, see index.js).
import { getUser } from './auth.js';
import { load, save } from './store.js';

const FILE = 'friends.json';
const MAX_FRIENDS = 60;
const db = () => load(FILE, { codes: {}, users: {} });

function rec(userId) {
  const d = db();
  let r = d.users[userId];
  if (!r) {
    let code = '';
    for (let i = 0; i < 2000 && (!code || d.codes[code]); i++) code = String(Math.floor(1000 + Math.random() * 9000));
    if (d.codes[code]) code = String(Object.keys(d.codes).length + 10000); // 9,000 accounts in: codes grow a digit
    r = d.users[userId] = { code, friends: [], incoming: [], outgoing: [] };
    d.codes[code] = userId;
    save(FILE);
  }
  return r;
}

export function friendCode(userId) {
  return rec(userId).code;
}

export function friendIds(userId) {
  return [...rec(userId).friends];
}

export function areFriends(a, b) {
  return rec(a).friends.includes(b);
}

const pub = (id) => {
  const u = getUser(id);
  return u ? { id, name: u.name, code: rec(id).code } : null;
};

/**
 * Everything the Friends tab shows. `presence(id)` says whether they are online and which lobby they are in.
 */
export function friendsView(userId, presence) {
  const r = rec(userId);
  return {
    code: r.code,
    friends: r.friends.map((id) => ({ ...pub(id), ...presence(id) })).filter((f) => f.id),
    incoming: r.incoming.map(pub).filter(Boolean),
    outgoing: r.outgoing.map(pub).filter(Boolean),
  };
}

/** Add by friend code. Returns { error } or { ok, friends: bool } (true when this made you friends both ways). */
export function addByCode(userId, code) {
  const c = String(code || '').replace(/\D/g, '');
  const d = db();
  const other = d.codes[c];
  if (!other || !getUser(other)) return { error: 'Nobody has that friend code.', status: 404 };
  if (other === userId) return { error: 'That is your own friend code.', status: 400 };
  const me = rec(userId);
  const them = rec(other);
  if (me.friends.includes(other)) return { ok: true, friends: true, other };
  if (me.friends.length >= MAX_FRIENDS) return { error: `You can have up to ${MAX_FRIENDS} friends.`, status: 400 };
  // they already asked: this is a yes
  if (me.incoming.includes(other)) return accept(userId, other);
  if (!me.outgoing.includes(other)) me.outgoing.push(other);
  if (!them.incoming.includes(userId)) them.incoming.push(userId);
  save(FILE);
  return { ok: true, friends: false, other };
}

export function accept(userId, other) {
  const me = rec(userId);
  const them = rec(other);
  if (!me.incoming.includes(other)) return { error: 'No request from them.', status: 404 };
  me.incoming = me.incoming.filter((x) => x !== other);
  them.outgoing = them.outgoing.filter((x) => x !== userId);
  if (!me.friends.includes(other)) me.friends.push(other);
  if (!them.friends.includes(userId)) them.friends.push(userId);
  save(FILE);
  return { ok: true, friends: true, other };
}

/** Decline a request, cancel your own request, or unfriend: all the same "drop the link" action. */
export function drop(userId, other) {
  const me = rec(userId);
  const them = rec(other);
  me.incoming = me.incoming.filter((x) => x !== other);
  me.outgoing = me.outgoing.filter((x) => x !== other);
  me.friends = me.friends.filter((x) => x !== other);
  them.incoming = them.incoming.filter((x) => x !== userId);
  them.outgoing = them.outgoing.filter((x) => x !== userId);
  them.friends = them.friends.filter((x) => x !== userId);
  save(FILE);
  return { ok: true, other };
}
