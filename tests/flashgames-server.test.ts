// FlashGames boards on the real server (throwaway data folder, test clock): plans uploaded with the admin key,
// runs and their 15-minute clock, you-and-your-friends boards, medals after midnight, and the encore day.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 3990 + Math.floor(Math.random() * 9);
const BASE = `http://localhost:${PORT}/games/shoallhell/api`;
const ADMIN = 'test-admin-key-123';
let proc: ChildProcess;
let dir: string;

type Res = { status: number; data: Record<string, any> };
async function call(method: string, p: string, body?: unknown, token?: string, admin?: string): Promise<Res> {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(admin ? { 'X-Flash-Admin': admin } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
/** set the server's clock to a US Central wall time, e.g. at('2026-11-24', 12) */
async function at(date: string, hour: number, minute = 0): Promise<void> {
  // late November is CST (UTC-6)
  const [y, m, d] = date.split('-').map(Number);
  const ms = Date.UTC(y!, m! - 1, d!, hour + 6, minute);
  const r = await call('POST', '/fg/admin/clock', { now: ms }, undefined, ADMIN);
  expect(r.status).toBe(200);
}

const plan = (date: string, game = 'dungeonjoe') => ({
  date,
  title: `Test day ${date}`,
  blurb: 'A test.',
  game: { id: game, name: 'Dungeon Joe', tagline: 'souls-like', goal: 'Go deep.', scoring: '100 a room.', path: `/games/${game}/`, maxScore: 100000 },
  mods: [
    { id: 'glass', name: 'Glass Joe', text: '1 HP, all stats maxed.' },
    { id: 'turbo', name: 'Turbo', text: 'Double speed.' },
  ],
  seed: 4242,
});

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-test-'));
  proc = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, FG_ADMIN_TOKEN: ADMIN, FG_TEST_CLOCK: '1' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/ping`)).ok) return;
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

describe('FlashGames', () => {
  const tok: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const runIds: Record<string, string> = {};

  it('needs the admin key to upload plans, and keeps past days closed', async () => {
    for (const n of ['ann', 'bob', 'cat', 'dan']) {
      const r = await call('POST', '/signup', { email: `${n}@fg.test`, password: 'password123', name: n });
      expect(r.status).toBe(200);
      tok[n] = r.data.token;
      ids[n] = r.data.user.id;
    }
    // ann is friends with bob and cat; bob and cat are not friends; dan has no friends
    const codes: Record<string, string> = {};
    for (const n of ['ann', 'bob', 'cat']) codes[n] = (await call('GET', '/friends', undefined, tok[n])).data.code;
    await call('POST', '/friends/add', { code: codes.bob }, tok.ann);
    await call('POST', '/friends/add', { code: codes.ann }, tok.bob);
    await call('POST', '/friends/add', { code: codes.cat }, tok.ann);
    await call('POST', '/friends/add', { code: codes.ann }, tok.cat);

    await at('2026-11-24', 12);
    expect((await call('PUT', '/fg/admin/plans', { plans: [plan('2026-11-24')] }, undefined, 'nope')).status).toBe(401);
    const up = await call('PUT', '/fg/admin/plans', { plans: [plan('2026-11-23'), plan('2026-11-24'), plan('2026-11-25'), { date: 'x' }] }, undefined, ADMIN);
    expect(up.data.stored).toEqual(['2026-11-24', '2026-11-25']);
    expect(up.data.refused.map((r: { date: string }) => r.date)).toEqual(['2026-11-23', 'x']);
  });

  it('shows today’s plan to anyone, and the board only when signed in', async () => {
    const anon = await call('GET', '/fg/today');
    expect(anon.data.date).toBe('2026-11-24');
    expect(anon.data.plan.mods.map((m: { id: string }) => m.id)).toEqual(['glass', 'turbo']);
    expect(anon.data.plan.seed).toBeUndefined();
    expect(anon.data.board).toBeUndefined();
    expect(anon.data.endsAt).toBe(Date.UTC(2026, 10, 25, 6));
  });

  it('runs a run: flash code, clock start, best score only goes up', async () => {
    const r = await call('POST', '/fg/runs', { date: '2026-11-24' }, tok.ann);
    expect(r.status).toBe(200);
    const flash = JSON.parse(Buffer.from(r.data.flash, 'base64url').toString('utf8'));
    expect(flash).toMatchObject({ v: 1, date: '2026-11-24', seed: 4242, mods: ['glass', 'turbo'], limit: 900 });
    expect(r.data.path).toBe('/games/dungeonjoe/');
    runIds.ann = r.data.run;
    expect((await call('POST', `/fg/runs/${runIds.ann}/score`, { score: 10 }, tok.ann)).status).toBe(409);
    expect((await call('POST', `/fg/runs/${runIds.ann}/go`, {}, tok.ann)).status).toBe(200);
    expect((await call('POST', `/fg/runs/${runIds.ann}/score`, { score: 500, detail: 'Zone 1' }, tok.ann)).data.best).toBe(500);
    expect((await call('POST', `/fg/runs/${runIds.ann}/score`, { score: 300 }, tok.ann)).data.best).toBe(500);
    expect((await call('POST', `/fg/runs/${runIds.ann}/score`, { score: 999999 }, tok.ann)).status).toBe(400);
    // someone else's run
    expect((await call('POST', `/fg/runs/${runIds.ann}/score`, { score: 1 }, tok.bob)).status).toBe(404);
    // an old day
    expect((await call('POST', '/fg/runs', { date: '2026-11-23' }, tok.ann)).status).toBe(409);

    for (const [n, s] of [
      ['bob', 800],
      ['cat', 200],
      ['dan', 50],
    ] as const) {
      const run = (await call('POST', '/fg/runs', {}, tok[n])).data.run;
      await call('POST', `/fg/runs/${run}/go`, {}, tok[n]);
      expect((await call('POST', `/fg/runs/${run}/score`, { score: s, detail: `${n} detail`, final: true }, tok[n])).data.best).toBe(s);
    }
  });

  it('ranks you and your friends only', async () => {
    const a = await call('GET', '/fg/today', undefined, tok.ann);
    expect(a.data.board.map((r: { name: string; place: number }) => [r.name, r.place])).toEqual([
      ['bob', 1],
      ['ann', 2],
      ['cat', 3],
    ]);
    expect(a.data.me.best).toBe(500);
    expect(a.data.players).toBe(4);
    const b = await call('GET', '/fg/today', undefined, tok.bob);
    expect(b.data.board.map((r: { name: string }) => r.name)).toEqual(['bob', 'ann']);
  });

  it('stops taking scores when the 15 minutes are up', async () => {
    await at('2026-11-24', 12, 17);
    expect((await call('POST', `/fg/runs/${runIds.ann}/score`, { score: 900 }, tok.ann)).status).toBe(410);
  });

  it('gives out medals after midnight, among each player’s friends', async () => {
    await at('2026-11-25', 1);
    const a = await call('GET', '/fg/today', undefined, tok.ann);
    expect(a.data.date).toBe('2026-11-25');
    expect(a.data.yesterday.board.map((r: { name: string; medal: string | null }) => [r.name, r.medal])).toEqual([
      ['bob', 'gold'],
      ['ann', 'silver'],
      ['cat', 'bronze'],
    ]);
    expect(a.data.stats.medals).toEqual({ gold: 0, silver: 1, bronze: 0 });
    // bob's circle is bob and ann: gold. cat's is cat and ann: 2nd of 2 is silver.
    expect((await call('GET', '/fg/today', undefined, tok.bob)).data.stats.medals).toEqual({ gold: 1, silver: 0, bronze: 0 });
    expect((await call('GET', '/fg/today', undefined, tok.cat)).data.stats.medals).toEqual({ gold: 0, silver: 1, bronze: 0 });
    // none of dan's friends played: alone is 1st, and a gold
    const d = await call('GET', '/fg/today', undefined, tok.dan);
    expect(d.data.yesterday.board.map((r: { name: string; place: number; medal: string | null }) => [r.name, r.place, r.medal])).toEqual([['dan', 1, 'gold']]);
    expect(d.data.stats.medals).toEqual({ gold: 1, silver: 0, bronze: 0 });
  });

  it('shows any day that is over, never today or a later one', async () => {
    const day = await call('GET', '/fg/day?date=2026-11-24', undefined, tok.ann);
    expect(day.status).toBe(200);
    expect(day.data.plan.title).toBe('Test day 2026-11-24');
    expect(day.data.plan.seed).toBeUndefined();
    expect(day.data.players).toBe(4);
    expect(day.data.board.map((r: { name: string; medal: string | null; me: boolean }) => [r.name, r.medal, r.me])).toEqual([
      ['bob', 'gold', false],
      ['ann', 'silver', true],
      ['cat', 'bronze', false],
    ]);
    expect((await call('GET', '/fg/day?date=2026-11-24', undefined, tok.dan)).data.board.map((r: { name: string }) => r.name)).toEqual(['dan']);
    // today, a later day (secret), a day with no run, nonsense, and nobody signed in
    expect((await call('GET', '/fg/day?date=2026-11-25', undefined, tok.ann)).status).toBe(400);
    expect((await call('GET', '/fg/day?date=2026-11-26', undefined, tok.ann)).status).toBe(400);
    expect((await call('GET', '/fg/day?date=2026-11-20', undefined, tok.ann)).status).toBe(404);
    expect((await call('GET', '/fg/day?date=yesterday', undefined, tok.ann)).status).toBe(400);
    expect((await call('GET', '/fg/day?date=2026-11-24')).status).toBe(401);
  });

  it('shows a year of daily bests to you and your friends', async () => {
    const p = await call('GET', `/fg/profile?user=${ids.bob}`, undefined, tok.ann);
    expect(p.status).toBe(200);
    expect(p.data.days[0]).toMatchObject({ date: '2026-11-24', score: 800, place: 1, of: 2, medal: 'gold', game: 'dungeonjoe' });
    expect(p.data.stats.played).toBe(1);
    expect((await call('GET', `/fg/profile?user=${ids.cat}`, undefined, tok.bob)).status).toBe(403);
  });

  it('won’t replace a plan people have played, and plays an encore when no plan was uploaded', async () => {
    const run = (await call('POST', '/fg/runs', {}, tok.ann)).data.run;
    expect(run).toBeTruthy();
    const up = await call('PUT', '/fg/admin/plans', { plans: [plan('2026-11-25', 'other')] }, undefined, ADMIN);
    expect(up.data.refused[0].error).toMatch(/already played/);
    await at('2026-11-27', 9);
    const t = await call('GET', '/fg/today');
    expect(t.data.plan.encore).toMatch(/^2026-11-2[45]$/);
    expect(t.data.plan.title).toMatch(/^Encore: /);
    const list = await call('GET', '/fg/admin/plans', undefined, undefined, ADMIN);
    expect(list.data.plans.map((p: { date: string }) => p.date)).toEqual(['2026-11-24', '2026-11-25', '2026-11-27']);
    expect(list.data.plans[0].players).toBe(4);
  });
});
