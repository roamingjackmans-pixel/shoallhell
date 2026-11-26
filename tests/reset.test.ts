// Password reset by emailed code (shared accounts) and Relentless Tear's save routes. Starts the real server with
// EMAIL_PROVIDER=file, so each email lands in <data>/outbox instead of being sent.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 4000 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}/games/shoallhell`;
let proc: ChildProcess;
let dir: string;

async function call(p: string, body?: unknown, token?: string, method = 'POST'): Promise<{ status: number; data: Record<string, any> }> {
  const r = await fetch(`${BASE}/api${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}

function lastCode(): string {
  const out = path.join(dir, 'outbox');
  const files = fs.readdirSync(out).sort();
  const mail = JSON.parse(fs.readFileSync(path.join(out, files[files.length - 1]), 'utf8'));
  return /Your code: (\d{6})/.exec(mail.text)![1];
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoallhell-reset-'));
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, EMAIL_PROVIDER: 'file' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/ping`)).ok) return;
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

describe('password reset and Relentless Tear saves', () => {
  let token = '';

  it('keeps a Relentless Tear profile separate, with a revision check', async () => {
    const s = await call('/signup', { email: 'mender@example.test', password: 'needle1234', name: 'Ash' });
    token = s.data.token;
    const empty = await call('/rt/me', undefined, token, 'GET');
    expect(empty.data.profile).toBeNull();
    const put = await call('/rt/profile', { profile: { v: 1, slots: [] }, rev: 0 }, token, 'PUT');
    expect(put.data.rev).toBe(1);
    const stale = await call('/rt/profile', { profile: { v: 1, slots: [1] }, rev: 0 }, token, 'PUT');
    expect(stale.status).toBe(409);
    const me = await call('/rt/me', undefined, token, 'GET');
    expect(me.data.profile).toEqual({ v: 1, slots: [] });
    const shoal = await call('/me', undefined, token, 'GET');
    expect(shoal.data.profile).toBeNull();
  });

  it('resets a password with the emailed code and signs out old sessions', async () => {
    const unknown = await call('/password/forgot', { email: 'nobody@example.test' });
    expect(unknown.status).toBe(200);
    const f = await call('/password/forgot', { email: 'Mender@Example.test' });
    expect(f.data.ok).toBe(true);
    const code = lastCode();
    const wrong = await call('/password/reset', { email: 'mender@example.test', code: code === '000000' ? '111111' : '000000', password: 'newpass1234' });
    expect(wrong.status).toBe(400);
    expect(wrong.data.error).toMatch(/2 tries left/);
    const short = await call('/password/reset', { email: 'mender@example.test', code, password: 'short' });
    expect(short.status).toBe(400);
    const ok = await call('/password/reset', { email: 'mender@example.test', code, password: 'newpass1234' });
    expect(ok.status).toBe(200);
    expect(ok.data.token).toBeTruthy();
    const old = await call('/rt/me', undefined, token, 'GET');
    expect(old.status).toBe(401);
    const reused = await call('/password/reset', { email: 'mender@example.test', code, password: 'another1234' });
    expect(reused.status).toBe(400);
    const login = await call('/login', { email: 'mender@example.test', password: 'newpass1234' });
    expect(login.status).toBe(200);
  });
});
