// Shoallhell server: email + password accounts, cloud saves (one profile per account) and the co-op relay.
// The game itself runs in the browser: in co-op the host's browser runs the rules and this server only passes
// messages between the host and up to three guests in a room with a 6-digit code.
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
import { flush, load, put } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3031);
const BASE = '/games/shoallhell';
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://josephjackman.com,https://www.josephjackman.com,http://localhost:5174,http://127.0.0.1:5174')
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

/** code -> { code, host: socketId, hostUser, players: Map(userId -> { userId, name, socketId, chars }) } */
const rooms = new Map();

function roomView(r) {
  return { code: r.code, host: r.hostUser, players: [...r.players.values()].map((p) => ({ userId: p.userId, name: p.name, chars: p.chars, online: !!p.socketId })) };
}

function newCode() {
  for (let i = 0; i < 100; i++) {
    const c = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(c)) return c;
  }
  return String(Date.now()).slice(-6);
}

function cleanChars(chars) {
  if (!Array.isArray(chars)) return [];
  return chars.slice(0, 4).map((c) => ({ charId: String(c.charId || '').slice(0, 40), name: String(c.name || '').slice(0, 24), cls: String(c.cls || '').slice(0, 20), level: Number(c.level) || 1 }));
}

io.use((socket, next) => {
  const user = userForToken(socket.handshake.auth?.token);
  if (!user) return next(new Error('Please sign in.'));
  socket.data.user = { id: user.id, name: user.name };
  next();
});

io.on('connection', (socket) => {
  const me = socket.data.user;
  const leave = () => {
    const code = socket.data.room;
    if (!code) return;
    const r = rooms.get(code);
    socket.leave(code);
    socket.data.room = null;
    if (!r) return;
    if (r.host === socket.id) {
      rooms.delete(code);
      io.to(code).emit('room:closed', { reason: 'The host left.' });
      io.in(code).socketsLeave(code);
      return;
    }
    r.players.delete(me.id);
    io.to(code).emit('room:update', roomView(r));
    io.to(r.host).emit('guest:left', { userId: me.id });
  };

  socket.on('host:create', (msg, ack) => {
    leave();
    const code = newCode();
    const r = { code, host: socket.id, hostUser: me.id, players: new Map() };
    r.players.set(me.id, { userId: me.id, name: me.name, socketId: socket.id, chars: cleanChars(msg?.chars) });
    rooms.set(code, r);
    socket.join(code);
    socket.data.room = code;
    ack?.({ ok: true, room: roomView(r) });
  });

  socket.on('room:join', (msg, ack) => {
    const code = String(msg?.code || '').trim();
    const r = rooms.get(code);
    if (!r) return ack?.({ error: 'No game with that code. Check the six digits with your host.' });
    if (r.players.size >= 4 && !r.players.has(me.id)) return ack?.({ error: 'That game is full (four players).' });
    if (r.hostUser === me.id) return ack?.({ error: 'That is your own game.' });
    leave();
    r.players.set(me.id, { userId: me.id, name: me.name, socketId: socket.id, chars: cleanChars(msg?.chars) });
    socket.join(code);
    socket.data.room = code;
    io.to(code).emit('room:update', roomView(r));
    io.to(r.host).emit('guest:joined', { userId: me.id, name: me.name });
    ack?.({ ok: true, room: roomView(r) });
  });

  socket.on('room:chars', (msg) => {
    const r = rooms.get(socket.data.room);
    const p = r?.players.get(me.id);
    if (!p) return;
    p.chars = cleanChars(msg?.chars);
    io.to(r.code).emit('room:update', roomView(r));
  });

  socket.on('room:leave', () => leave());

  // host -> everyone else in the room (state snapshots, scenario start, results)
  socket.on('host:msg', (msg) => {
    const r = rooms.get(socket.data.room);
    if (!r || r.host !== socket.id) return;
    socket.to(r.code).emit('host:msg', msg);
  });

  // guest -> host (intents)
  socket.on('guest:msg', (msg) => {
    const r = rooms.get(socket.data.room);
    if (!r || r.host === socket.id) return;
    io.to(r.host).emit('guest:msg', { from: me.id, msg });
  });

  socket.on('disconnect', () => leave());
});

server.listen(PORT, () => console.log(`[shoallhell] listening on http://localhost:${PORT}${BASE}/ (data: ${process.env.DATA_DIR || 'data'})`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    process.exit(0);
  });
}
