// FlashGames days settled under the first medal rule (1st and 2nd needed two players) get their medals again under
// today's (the top three, alone or not), once, when the server next looks at the boards.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const PORT = 3980 + Math.floor(Math.random() * 9);
const BASE = `http://localhost:${PORT}/games/shoallhell/api`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-remedal-'));
let proc: ChildProcess | undefined;

async function start(): Promise<void> {
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/ping`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
async function stop(): Promise<void> {
  const p = proc;
  proc = undefined;
  if (!p || p.exitCode != null) return;
  await new Promise((r) => {
    p.once('exit', r);
    p.kill();
  });
}
async function get(p: string, token: string): Promise<Record<string, any>> {
  return (await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } })).json();
}
const write = (name: string, obj: unknown): void => {
  const f = path.join(dir, name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj));
};

afterAll(async () => {
  await stop();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp */
  }
});

describe('FlashGames medals for days settled before the rule changed', () => {
  it('gives a solo 1st its gold, keeps the medals that were right, and only does it once', async () => {
    await start();
    const r = await fetch(`${BASE}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'solo@fg.test', password: 'password123', name: 'solo' }) });
    const { token, user } = (await r.json()) as { token: string; user: { id: string } };
    await new Promise((res) => setTimeout(res, 800)); // the account reaches the disk
    await stop();

    // what the first rule left: 1st of 1 with no medal, 2nd of 2 with a silver
    const day = (date: string) => ({ date, title: `Day ${date}`, game: { id: 'dungeonjoe', name: 'Dungeon Joe', path: '/games/dungeonjoe/' }, mods: [{ id: 'glass', name: 'Glass', text: '' }], seed: 1 });
    write('fg/meta.json', { plans: ['2026-11-20', '2026-11-21'], boards: ['2026-11-20', '2026-11-21'], settled: ['2026-11-20', '2026-11-21'] });
    write('fg/plans/2026-11-20.json', day('2026-11-20'));
    write('fg/plans/2026-11-21.json', day('2026-11-21'));
    write('fg/boards/2026-11-20.json', { [user.id]: { name: 'solo', score: 100, detail: '', runs: 1, at: 1 } });
    write('fg/boards/2026-11-21.json', { [user.id]: { name: 'solo', score: 50, detail: '', runs: 1, at: 1 } });
    write(`fg/users/${user.id}.json`, {
      medals: { gold: 0, silver: 1, bronze: 0 },
      played: 2,
      days: {
        '2026-11-20': { score: 100, detail: '', game: 'dungeonjoe', name: 'Dungeon Joe', title: 'Day 2026-11-20', place: 1, of: 1, medal: null },
        '2026-11-21': { score: 50, detail: '', game: 'dungeonjoe', name: 'Dungeon Joe', title: 'Day 2026-11-21', place: 2, of: 2, medal: 'silver' },
      },
    });

    await start();
    const t = await get('/fg/today', token);
    expect(t.stats.medals).toEqual({ gold: 1, silver: 1, bronze: 0 });
    const p = await get('/fg/profile', token);
    expect(p.days.map((d: { date: string; medal: string | null }) => [d.date, d.medal])).toEqual([
      ['2026-11-21', 'silver'],
      ['2026-11-20', 'gold'],
    ]);
    // looking again (and after a restart) gives nothing more
    expect((await get('/fg/today', token)).stats.medals).toEqual({ gold: 1, silver: 1, bronze: 0 });
    await new Promise((res) => setTimeout(res, 800));
    await stop();
    await start();
    expect((await get('/fg/today', token)).stats.medals).toEqual({ gold: 1, silver: 1, bronze: 0 });
  }, 30000);
});
