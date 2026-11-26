// Accounts: email + password (scrypt), bearer session tokens (hashed at rest), per-network slowdown on wrong
// passwords. Modelled on Roleplay20's server/auth.js, keyed by email instead of username.
import { load, save } from './store.js';
import { hashPassword, verifyPassword, randomId, randomToken, sha256, clientIp } from './security.js';

const USERS = 'users.json';
const SESSIONS = 'sessions.json';
const SESSION_DAYS = 90;

const users = () => load(USERS, { users: {}, byEmail: {} });
const sessions = () => load(SESSIONS, {});
const fails = new Map(); // ip -> { n, until }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function publicUser(u) {
  return u ? { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt } : null;
}

export function getUser(id) {
  return users().users[id] || null;
}

export function issueSession(userId) {
  const token = randomToken();
  sessions()[sha256(token)] = { userId, exp: Date.now() + SESSION_DAYS * 86400000 };
  save(SESSIONS);
  return token;
}

export function logout(token) {
  delete sessions()[sha256(token || '')];
  save(SESSIONS);
}

export function userForToken(token) {
  if (!token) return null;
  const s = sessions()[sha256(token)];
  if (!s || s.exp < Date.now()) return null;
  return getUser(s.userId);
}

function slowed(req) {
  const f = fails.get(clientIp(req));
  return !!f && f.until > Date.now();
}

function failed(req) {
  const ip = clientIp(req);
  const f = fails.get(ip);
  const n = (f?.n || 0) + 1;
  fails.set(ip, { n: n >= 8 ? 0 : n, until: n >= 8 ? Date.now() + 10 * 60000 : 0 });
}

export function signup(req, { email, password, name }) {
  if (slowed(req)) return { error: 'Too many tries. Wait a few minutes.', status: 429 };
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(e) || e.length > 120) return { error: 'That doesn’t look like an email address.', status: 400 };
  if (typeof password !== 'string' || password.length < 8) return { error: 'Passwords need at least 8 characters.', status: 400 };
  if (password.length > 200) return { error: 'That password is too long.', status: 400 };
  const db = users();
  if (db.byEmail[e]) {
    failed(req);
    return { error: 'An account with that email already exists. Sign in instead.', status: 409 };
  }
  const id = randomId('u_');
  const display = (typeof name === 'string' && name.trim().slice(0, 24)) || e.split('@')[0].slice(0, 24);
  db.users[id] = { id, email: e, name: display, pass: hashPassword(password), createdAt: Date.now() };
  db.byEmail[e] = id;
  save(USERS);
  return { user: db.users[id] };
}

export function login(req, { email, password }) {
  if (slowed(req)) return { error: 'Too many wrong passwords. Try again in a few minutes.', status: 429 };
  const db = users();
  const id = db.byEmail[String(email || '').trim().toLowerCase()];
  const u = id && db.users[id];
  if (!u || !verifyPassword(password || '', u.pass)) {
    failed(req);
    return { error: 'Wrong email or password.', status: 401 };
  }
  fails.delete(clientIp(req));
  return { user: u };
}

export function changePassword(u, oldPass, newPass) {
  if (!verifyPassword(oldPass || '', u.pass)) return { error: 'Your current password is wrong.', status: 401 };
  if (typeof newPass !== 'string' || newPass.length < 8) return { error: 'Passwords need at least 8 characters.', status: 400 };
  u.pass = hashPassword(newPass);
  save(USERS);
  return { ok: true };
}

export function rename(u, name) {
  if (typeof name !== 'string' || !name.trim()) return { error: 'Pick a name.', status: 400 };
  u.name = name.trim().slice(0, 24);
  save(USERS);
  return { ok: true };
}

/** Express middleware: requires `Authorization: Bearer <token>`. */
export function requireUser(req, res, next) {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const user = userForToken(token);
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  req.user = user;
  req.token = token;
  next();
}

/** The account for an email (any case), or null. */
export function userByEmail(email) {
  const db = users();
  const id = db.byEmail[String(email || '').trim().toLowerCase()];
  return (id && db.users[id]) || null;
}

/** Set a new password (password reset). */
export function setPassword(u, password) {
  u.pass = hashPassword(password);
  save(USERS);
}

/** Sign an account out everywhere (after a password reset). */
export function revokeSessions(userId) {
  const s = sessions();
  for (const k of Object.keys(s)) if (s[k].userId === userId) delete s[k];
  save(SESSIONS);
}
