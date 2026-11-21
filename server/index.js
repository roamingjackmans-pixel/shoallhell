// Shoallhell server: email + password accounts, cloud saves (one profile per account) and the co-op relay.
// The game itself runs in the browser: in co-op the host's browser runs the rules and this server only passes
// messages between the host and up to three guests in a room with a 4-digit code. Friends (4-digit friend codes,
// presence, invites without a code) live here too.
//
//   node server/index.js            (PORT, default 3031; DATA_DIR, default ./data)
//
// It also serves the built game (dist/) at /games/shoallhell/ so one machine can host everything.
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { changePassword, issueSession, login, logout, publicUser, rename, requireUser, signup, userForToken } from './auth.js';
import { accept as acceptFriend, addByCode, areFriends, drop as dropFriend, friendIds, friendsView } from './friends.js';
import { flush, load, put } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3031);
const BASE = '/games/shoallhell';
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://josephjackman.com,https://www.josephjackman.com,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_PROFILE = 400_000;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);
app.use((req, res, next) => {
  const o = req.get('origin');
  if (o && ORIGINS.includes(o)) {
    res.set('Access-Control-Allow-Origin', o);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '600kb' }));

const api = express.Router();
const profileName = (id) => `profiles/${id}.json`;
// Smash Your Bros (josephjackman.com/games/smashyourbros/) shares these accounts and friends; its save is separate.
const sybProfileName = (id) => `profiles/syb/${id}.json`;
/** the games that use this server; sockets say which one they are (handshake auth.game) */
const GAMES = new Set(['shoallhell', 'syb']);
const GAME_NAMES = { shoallhell: 'Shoallhell', syb: 'Smash Your Bros' };

api.get('/ping', (_req, res) => res.json({ ok: true, name: 'shoallhell' }));

api.post('/signup', (req, res) => {
  const r = signup(req, req.body || {});
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json({ token: issueSession(r.user.id), user: publicUser(r.user) });
});

api.post('/login', (req, res) => {
  const r = login(req, req.body || {});
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json({ token: issueSession(r.user.id), user: publicUser(r.user) });
});

api.post('/logout', requireUser, (req, res) => {
  logout(req.token);
  res.json({ ok: true });
});

api.get('/me', requireUser, (req, res) => {
  const doc = load(profileName(req.user.id), { rev: 0, profile: null });
  res.json({ user: publicUser(req.user), profile: doc.profile, rev: doc.rev });
});

/** Save the profile. `rev` must match the stored revision (another tab saving in between gets a 409). */
api.put('/profile', requireUser, (req, res) => {
  const { profile, rev } = req.body || {};
  if (!profile || typeof profile !== 'object') return res.status(400).json({ error: 'No profile.' });
  const size = JSON.stringify(profile).length;
  if (size > MAX_PROFILE) return res.status(413).json({ error: 'Save is too large.' });
  const doc = load(profileName(req.user.id), { rev: 0, profile: null });
  if (typeof rev === 'number' && doc.profile && rev !== doc.rev) return res.status(409).json({ error: 'Your save changed on another device. Reload to get the newest one.', rev: doc.rev, profile: doc.profile });
  const next = { rev: doc.rev + 1, profile, savedAt: Date.now() };
  put(profileName(req.user.id), next);
  res.json({ rev: next.rev });
});

api.get('/syb/me', requireUser, (req, res) => {
  const doc = load(sybProfileName(req.user.id), { rev: 0, profile: null });
  res.json({ user: publicUser(req.user), profile: doc.profile, rev: doc.rev });
});

/** Smash Your Bros save, same revision check as Shoallhell's */
api.put('/syb/profile', requireUser, (req, res) => {
  const { profile, rev } = req.body || {};
  if (!profile || typeof profile !== 'object') return res.status(400).json({ error: 'No profile.' });
  if (JSON.stringify(profile).length > MAX_PROFILE) return res.status(413).json({ error: 'Save is too large.' });
  const doc = load(sybProfileName(req.user.id), { rev: 0, profile: null });
  if (typeof rev === 'number' && doc.profile && rev !== doc.rev) return res.status(409).json({ error: 'Your save changed on another device. Reload to get the newest one.', rev: doc.rev, profile: doc.profile });
  const next = { rev: doc.rev + 1, profile, savedAt: Date.now() };
  put(sybProfileName(req.user.id), next);
  res.json({ rev: next.rev });
});

api.post('/password', requireUser, (req, res) => {
  const r = changePassword(req.user, req.body?.old, req.body?.new);
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json({ ok: true });
});

api.post('/name', requireUser, (req, res) => {
  const r = rename(req.user, req.body?.name);
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json({ ok: true, user: publicUser(req.user) });
});

// ------------------------------------------------------------------ friends

api.get('/friends', requireUser, (req, res) => res.json(friendsView(req.user.id, presenceOf)));

api.post('/friends/add', requireUser, (req, res) => {
  const r = addByCode(req.user.id, req.body?.code);
  if (r.error) return res.status(r.status).json({ error: r.error });
  friendsChanged(req.user.id, r.other);
  res.json({ ok: true, friends: r.friends, view: friendsView(req.user.id, presenceOf) });
});

api.post('/friends/accept', requireUser, (req, res) => {
  const r = acceptFriend(req.user.id, String(req.body?.id || ''));
  if (r.error) return res.status(r.status).json({ error: r.error });
  friendsChanged(req.user.id, r.other);
  res.json({ ok: true, view: friendsView(req.user.id, presenceOf) });
});

/** decline a request, cancel your own, or unfriend */
api.post('/friends/remove', requireUser, (req, res) => {
  const r = dropFriend(req.user.id, String(req.body?.id || ''));
  friendsChanged(req.user.id, r.other);
  res.json({ ok: true, view: friendsView(req.user.id, presenceOf) });
});

app.use(`${BASE}/api`, api);
app.use('/api', api);

// the built game, when present
const dist = path.join(here, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(BASE, express.static(dist, { index: 'index.html', maxAge: '1h' }));
  app.get('/', (_req, res) => res.redirect(`${BASE}/`));
}

// ------------------------------------------------------------------ co-op relay

const server = http.createServer(app);
const io = new Server(server, {
  path: `${BASE}/socket.io`,
  cors: { origin: ORIGINS, credentials: false },
  maxHttpBufferSize: 2e6,
});

/**
 * code -> { code, host: socketId | null, hostUser, hostAway: timeout | null,
 *           players: Map(userId -> { userId, name, socketId | null, chars }) }
 *
 * Rooms survive people refreshing their browser: a guest who drops keeps their seat (shown offline) and gets it back
 * by joining again with the same code; a host who drops has HOST_GRACE_MS to reclaim the room before it closes.
 */
const rooms = new Map();
const HOST_GRACE_MS = 3 * 60 * 1000;

function roomView(r) {
  return {
    code: r.code,
    game: r.game,
    host: r.hostUser,
    hostOnline: !!r.host,
    players: [...r.players.values()].map((p) => ({ userId: p.userId, name: p.name, chars: p.chars, online: !!p.socketId })),
  };
}

function newCode() {
  for (let i = 0; i < 100; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(c)) return c;
  }
  // thousands of open rooms at once: fall back to five digits
  for (let i = 0; i < 1000; i++) {
    const c = String(Math.floor(10000 + Math.random() * 90000));
    if (!rooms.has(c)) return c;
  }
  return String(Date.now()).slice(-6);
}

// ------------------------------------------------------------------ presence (who is online, and in which lobby)

/** userId -> the sockets that account has open (a person can have several tabs) */
const online = new Map();

function presenceOf(userId) {
  const set = online.get(userId);
  if (!set || !set.size) return { online: false, lobby: null, game: null };
  let lobby = null;
  let game = null;
  for (const s of set) {
    game = game || s.data.game;
    if (s.data.room && rooms.has(s.data.room)) {
      lobby = s.data.room;
      game = rooms.get(s.data.room).game;
    }
  }
  return { online: true, lobby, game };
}

function emitToUser(userId, ev, data) {
  for (const s of online.get(userId) ?? []) s.emit(ev, data);
}

/** tell someone's friends that their status changed (online, offline, joined or left a lobby) */
function presenceChanged(userId) {
  for (const f of friendIds(userId)) emitToUser(f, 'friends:update', {});
}

/** tell both people that their friendship or request changed */
function friendsChanged(a, b) {
  if (a) emitToUser(a, 'friends:update', {});
  if (b) emitToUser(b, 'friends:update', {});
}

function cleanChars(chars) {
  if (!Array.isArray(chars)) return [];
  return chars.slice(0, 4).map((c) => ({ charId: String(c.charId || '').slice(0, 40), name: String(c.name || '').slice(0, 24), cls: String(c.cls || '').slice(0, 20), level: Number(c.level) || 1 }));
}

function closeRoom(r, reason) {
  if (r.hostAway) clearTimeout(r.hostAway);
  rooms.delete(r.code);
  io.to(r.code).emit('room:closed', { reason });
  io.in(r.code).socketsLeave(r.code);
}

io.use((socket, next) => {
  const user = userForToken(socket.handshake.auth?.token);
  if (!user) return next(new Error('Please sign in.'));
  socket.data.user = { id: user.id, name: user.name };
  const g = String(socket.handshake.auth?.game || 'shoallhell');
  socket.data.game = GAMES.has(g) ? g : 'shoallhell';
  next();
});

io.on('connection', (socket) => {
  const me = socket.data.user;
  if (!online.has(me.id)) online.set(me.id, new Set());
  online.get(me.id).add(socket);
  if (online.get(me.id).size === 1) presenceChanged(me.id);

  /** invite a friend to the lobby you are in: they get a pop-up and can join without the code */
  socket.on('friend:invite', (msg, ack) => {
    const to = String(msg?.userId || '');
    const r = rooms.get(socket.data.room);
    if (!r) return ack?.({ error: 'Open a co-op lobby first.' });
    if (!areFriends(me.id, to)) return ack?.({ error: 'You can only invite friends.' });
    if (!presenceOf(to).online) return ack?.({ error: 'They are offline.' });
    emitToUser(to, 'friend:invite', { fromId: me.id, fromName: me.name, code: r.code, game: r.game, gameName: GAME_NAMES[r.game] });
    ack?.({ ok: true });
  });

  /** join a friend's lobby straight from the friends list */
  socket.on('friend:lobby', (msg, ack) => {
    const to = String(msg?.userId || '');
    if (!areFriends(me.id, to)) return ack?.({ error: 'You can only join friends.' });
    const p = presenceOf(to);
    if (p.lobby && p.game !== socket.data.game) return ack?.({ error: `They are in a ${GAME_NAMES[p.game] || p.game} lobby.`, game: p.game, code: p.lobby });
    ack?.(p.lobby ? { ok: true, code: p.lobby, game: p.game } : { error: 'They are not in a lobby right now.' });
  });

  /** on purpose (Leave) the seat or room goes; on a dropped connection it is held for a comeback */
  const leave = (onPurpose) => {
    const code = socket.data.room;
    if (!code) return;
    const r = rooms.get(code);
    socket.leave(code);
    socket.data.room = null;
    presenceChanged(me.id);
    if (!r) return;
    if (r.host === socket.id) {
      if (onPurpose) return closeRoom(r, 'The host closed the game.');
      r.host = null;
      const p = r.players.get(me.id);
      if (p) p.socketId = null;
      io.to(code).emit('host:away', { until: Date.now() + HOST_GRACE_MS });
      io.to(code).emit('room:update', roomView(r));
      r.hostAway = setTimeout(() => {
        if (!r.host) closeRoom(r, 'The host did not come back.');
      }, HOST_GRACE_MS);
      return;
    }
    const p = r.players.get(me.id);
    if (!p || p.socketId !== socket.id) return;
    if (onPurpose) {
      r.players.delete(me.id);
      if (r.host) io.to(r.host).emit('guest:left', { userId: me.id });
    } else p.socketId = null;
    io.to(code).emit('room:update', roomView(r));
  };

  socket.on('host:create', (msg, ack) => {
    leave(true);
    const code = newCode();
    const r = { code, game: socket.data.game, host: socket.id, hostUser: me.id, hostAway: null, players: new Map() };
    r.players.set(me.id, { userId: me.id, name: me.name, socketId: socket.id, chars: cleanChars(msg?.chars) });
    rooms.set(code, r);
    socket.join(code);
    socket.data.room = code;
    presenceChanged(me.id);
    ack?.({ ok: true, room: roomView(r) });
  });

  /** the host comes back (after a refresh or a dropped connection) and takes the room over again */
  socket.on('host:reclaim', (msg, ack) => {
    const r = rooms.get(String(msg?.code || '').trim());
    if (!r || r.hostUser !== me.id) return ack?.({ error: 'That game has closed.' });
    if (r.hostAway) clearTimeout(r.hostAway);
    r.hostAway = null;
    if (r.host && r.host !== socket.id) io.sockets.sockets.get(r.host)?.leave(r.code);
    r.host = socket.id;
    const p = r.players.get(me.id);
    if (p) p.socketId = socket.id;
    socket.join(r.code);
    socket.data.room = r.code;
    presenceChanged(me.id);
    socket.to(r.code).emit('host:back', {});
    io.to(r.code).emit('room:update', roomView(r));
    ack?.({ ok: true, room: roomView(r) });
  });

  socket.on('room:join', (msg, ack) => {
    const code = String(msg?.code || '').trim();
    const r = rooms.get(code);
    if (!r) return ack?.({ error: 'No game with that code. Check the four digits with your host.' });
    if (r.game !== socket.data.game) return ack?.({ error: `That code is a ${GAME_NAMES[r.game] || r.game} lobby. Open ${GAME_NAMES[r.game] || r.game} to join it.` });
    if (r.hostUser === me.id) return ack?.({ error: 'That is your own game.' });
    const seat = r.players.get(me.id);
    if (!seat && r.players.size >= 4) return ack?.({ error: 'That game is full (four players).' });
    if (socket.data.room !== code) leave(true);
    // a returning player keeps their seat (and the heroes they brought)
    const chars = cleanChars(msg?.chars);
    r.players.set(me.id, { userId: me.id, name: me.name, socketId: socket.id, chars: seat && !chars.length ? seat.chars : chars.length ? chars : seat?.chars ?? [] });
    socket.join(code);
    socket.data.room = code;
    presenceChanged(me.id);
    io.to(code).emit('room:update', roomView(r));
    if (r.host) io.to(r.host).emit('guest:joined', { userId: me.id, name: me.name, back: !!seat });
    ack?.({ ok: true, room: roomView(r), back: !!seat });
  });

  socket.on('room:chars', (msg) => {
    const r = rooms.get(socket.data.room);
    const p = r?.players.get(me.id);
    if (!p) return;
    p.chars = cleanChars(msg?.chars);
    io.to(r.code).emit('room:update', roomView(r));
  });

  socket.on('room:leave', () => leave(true));

  // host -> everyone else in the room (state snapshots, scenario start, results)
  socket.on('host:msg', (msg) => {
    const r = rooms.get(socket.data.room);
    if (!r || r.host !== socket.id) return;
    socket.to(r.code).emit('host:msg', msg);
  });

  // guest -> host (intents); dropped while the host is away
  socket.on('guest:msg', (msg) => {
    const r = rooms.get(socket.data.room);
    if (!r || !r.host || r.host === socket.id) return;
    io.to(r.host).emit('guest:msg', { from: me.id, msg });
  });

  // ---- Smash Your Bros: each player's inputs go to everyone else in the room (rollback netcode), and
  // WebRTC offers/answers/candidates pass between two players so they can connect directly.
  socket.on('syb:in', (msg) => {
    const r = rooms.get(socket.data.room);
    if (!r || r.game !== 'syb') return;
    socket.to(r.code).emit('syb:in', { from: me.id, d: msg });
  });

  socket.on('rtc:signal', (msg) => {
    const r = rooms.get(socket.data.room);
    if (!r) return;
    const p = r.players.get(String(msg?.to || ''));
    if (!p?.socketId) return;
    io.to(p.socketId).emit('rtc:signal', { from: me.id, data: msg?.data });
  });

  socket.on('disconnect', () => {
    leave(false);
    const set = online.get(me.id);
    set?.delete(socket);
    if (set && !set.size) {
      online.delete(me.id);
      presenceChanged(me.id);
    }
  });
});

server.listen(PORT, () => console.log(`[shoallhell] listening on http://localhost:${PORT}${BASE}/ (data: ${process.env.DATA_DIR || 'data'})`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    process.exit(0);
  });
}
