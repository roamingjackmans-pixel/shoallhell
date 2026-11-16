// Starts the real server on a spare port with a throwaway data folder, then checks accounts, saves and the co-op relay.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}/games/shoallhell`;
let proc: ChildProcess;
let dir: string;

async function post(p: string, body: unknown, token?: string, method = 'POST'): Promise<{ status: number; data: Record<string, any> }> {
  const r = await fetch(`${BASE}/api${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoallhell-test-'));
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/ping`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}, 15000);

afterAll(() => {
  proc?.kill();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp */
  }
});

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(`http://localhost:${PORT}`, { path: '/games/shoallhell/socket.io', auth: { token }, transports: ['websocket'] });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

describe('server', () => {
  let tokA = '';
  let tokB = '';

  it('signs up and signs in with email and password', async () => {
    const a = await post('/signup', { email: 'Host@Example.test', password: 'hostpass123', name: 'Host' });
    expect(a.status).toBe(200);
    tokA = a.data.token;
    expect(a.data.user.email).toBe('host@example.test');
    const dup = await post('/signup', { email: 'host@example.test', password: 'whatever123' });
    expect(dup.status).toBe(409);
    const short = await post('/signup', { email: 'x@example.test', password: 'short' });
    expect(short.status).toBe(400);
    const bad = await post('/login', { email: 'host@example.test', password: 'wrongpass' });
    expect(bad.status).toBe(401);
    const ok = await post('/login', { email: 'HOST@example.test', password: 'hostpass123' });
    expect(ok.status).toBe(200);
    const b = await post('/signup', { email: 'guest@example.test', password: 'guestpass123', name: 'Guest' });
    tokB = b.data.token;
  });

  it('saves the profile with a revision check', async () => {
    const r1 = await post('/profile', { profile: { v: 1, name: 'Host', characters: [] }, rev: 0 }, tokA, 'PUT');
    expect(r1.status).toBe(200);
    expect(r1.data.rev).toBe(1);
    const stale = await post('/profile', { profile: { v: 1, name: 'Old' }, rev: 0 }, tokA, 'PUT');
    expect(stale.status).toBe(409);
    const me = await fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${tokA}` } }).then((r) => r.json());
    expect(me.profile.name).toBe('Host');
    const anon = await fetch(`${BASE}/api/me`);
    expect(anon.status).toBe(401);
  });

  it('relays co-op messages between a host and a guest', async () => {
    const host = await connect(tokA);
    const guest = await connect(tokB);
    const room = await new Promise<{ code: string }>((res) => host.emit('host:create', { chars: [{ charId: 'c1', name: 'Ser Colin', cls: 'knight', level: 1 }] }, (r: { room: { code: string } }) => res(r.room)));
    expect(room.code).toMatch(/^\d{6}$/);
    const joined = await new Promise<{ ok?: boolean; room?: { players: unknown[] } }>((res) => guest.emit('room:join', { code: room.code, chars: [] }, res));
    expect(joined.ok).toBe(true);
    expect(joined.room?.players.length).toBe(2);
    const toHost = new Promise<{ msg: { type: string } }>((res) => host.once('guest:msg', res));
    guest.emit('guest:msg', { type: 'intent', intent: { t: 'skip', uid: 'h1' } });
    expect((await toHost).msg.type).toBe('intent');
    const toGuest = new Promise<{ type: string }>((res) => guest.once('host:msg', res));
    host.emit('host:msg', { type: 'state', state: { round: 1 } });
    expect((await toGuest).type).toBe('state');
    const closed = new Promise((res) => guest.once('room:closed', res));
    host.disconnect();
    await closed;
    guest.disconnect();
  });

  it('refuses sockets without a session', async () => {
    await expect(connect('nope')).rejects.toBeTruthy();
  });
});
