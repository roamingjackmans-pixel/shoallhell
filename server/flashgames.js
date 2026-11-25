// FlashGames (josephjackman.com/games/flashgames/): a daily 15-minute speedrun of one of the owner's games with a
// few crazy modifiers. Same accounts and friends as Shoallhell.
//
// The days are planned on the owner's PC (a Claude task every Monday writes the next week) and uploaded with the
// admin key (FG_ADMIN_TOKEN); this server never invents a plan, except an "encore" of an earlier day when nothing
// was uploaded for today. It keeps:
//   fg/plans/<date>.json    the day's plan (game, modifiers, seed, title)
//   fg/boards/<date>.json   each account's best score that day
//   fg/runs/<date>.json     every run started that day (so a run's clock is the server's, not the browser's)
//   fg/users/<id>.json      a year of daily bests, and medals forever
//   fg/meta.json            which days have plans and boards, and which boards are settled (medals given out)
//
// Days roll over at midnight US Central. Places are among you and your friends who played that day, and the top
// three get medals: playing alone (none of your friends played) is 1st and a gold.
import crypto from 'node:crypto';
import { randomId } from './security.js';
import { load, put, save } from './store.js';

export const TZ = 'America/Chicago';
export const LIMIT_S = 900;
const GRACE_MS = 60_000; // scores may arrive this long after the clock ends (slow connections)
const GO_WITHIN_MS = 5 * 60_000; // a run must start its clock this soon after it was made
const SETTLE_AFTER_MS = 30 * 60_000; // a day's medals are given out this long after midnight
const KEEP_DAYS = 366;
const MAX_RUNS_PER_DAY = 300;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------------ clock and calendar (US Central)

let clockOffset = 0;
export const now = () => Date.now() + clockOffset;

const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function central(ms) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}
export const dayOf = (ms) => central(ms).date;
function shift(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
export const nextDay = (date) => shift(date, 1);
export const prevDay = (date) => shift(date, -1);
/** the moment `date` begins in Central time */
export function dayStart(date) {
  const [y, m, d] = date.split('-').map(Number);
  for (const h of [5, 6, 4, 7]) {
    const t = Date.UTC(y, m - 1, d, h);
    const c = central(t);
    if (c.date === date && c.hour === 0 && c.minute === 0) return t;
  }
  return Date.UTC(y, m - 1, d, 6);
}
export const dayEnd = (date) => dayStart(nextDay(date));
const today = () => dayOf(now());

// ------------------------------------------------------------------ documents

const planDoc = (date) => `fg/plans/${date}.json`;
const boardDoc = (date) => `fg/boards/${date}.json`;
const runsDoc = (date) => `fg/runs/${date}.json`;
const userDoc = (id) => `fg/users/${id}.json`;
const META = 'fg/meta.json';

const meta = () => load(META, { plans: [], boards: [], settled: [] });
const getPlan = (date) => {
  const p = load(planDoc(date), null);
  return p && p.date ? p : null;
};
const board = (date) => load(boardDoc(date), {});
const runs = (date) => load(runsDoc(date), {});
const userRec = (id) => {
  const u = load(userDoc(id), null);
  if (u && u.days) return u;
  const fresh = { medals: { gold: 0, silver: 0, bronze: 0 }, played: 0, days: {} };
  put(userDoc(id), fresh);
  return fresh;
};

function addTo(list, date) {
  const m = meta();
  if (!m[list].includes(date)) {
    m[list].push(date);
    m[list].sort();
    save(META);
  }
}

// ------------------------------------------------------------------ plans

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** check an uploaded plan; returns { plan } or { error } */
export function cleanPlan(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Not a plan.' };
  const date = String(raw.date || '');
  if (!DAY.test(date)) return { error: 'Bad date.' };
  const g = raw.game || {};
  const id = String(g.id || '');
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) return { error: 'Bad game id.' };
  const path = String(g.path || `/games/${id}/`);
  if (!/^\/games\/[A-Za-z0-9_\-/]+\/$/.test(path)) return { error: 'Bad game path.' };
  const mods = Array.isArray(raw.mods) ? raw.mods : [];
  if (mods.length < 1 || mods.length > 6) return { error: 'A plan needs 1 to 6 modifiers.' };
  const cleanMods = [];
  for (const m of mods) {
    const mid = String(m?.id || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(mid)) return { error: `Bad modifier id "${mid}".` };
    if (cleanMods.some((x) => x.id === mid)) return { error: `Modifier "${mid}" twice.` };
    cleanMods.push({ id: mid, name: str(m.name, 48) || mid, text: str(m.text, 240) });
  }
  let params;
  if (raw.params != null) {
    if (typeof raw.params !== 'object' || JSON.stringify(raw.params).length > 2000) return { error: 'Bad params.' };
    params = raw.params;
  }
  const maxScore = Math.floor(Number(g.maxScore));
  const seed = raw.seed == null ? crypto.randomBytes(4).readUInt32BE(0) : Number(raw.seed) >>> 0;
  return {
    plan: {
      date,
      title: str(raw.title, 80) || `${str(g.name, 40) || id} Day`,
      blurb: str(raw.blurb, 400),
      game: {
        id,
        name: str(g.name, 40) || id,
        tagline: str(g.tagline, 120),
        goal: str(g.goal, 240),
        scoring: str(g.scoring, 480),
        path,
        maxScore: Number.isFinite(maxScore) && maxScore > 0 ? Math.min(maxScore, 1e12) : 1e9,
      },
      mods: cleanMods,
      ...(params ? { params } : {}),
      seed,
    },
  };
}

/** today's plan; when nothing was uploaded for today, an encore of an earlier day (same game and modifiers, new seed) */
function planFor(date) {
  const p = getPlan(date);
  if (p) return p;
  if (date !== today()) return null;
  const earlier = meta().plans.filter((d) => d < date && !getPlan(d)?.encore);
  if (!earlier.length) return null;
  const h = crypto.createHash('sha256').update(date).digest().readUInt32BE(0);
  const from = getPlan(earlier[h % earlier.length]);
  if (!from) return null;
  const encore = { ...from, date, title: `Encore: ${from.title}`, encore: from.date, seed: crypto.randomBytes(4).readUInt32BE(0), madeAt: now() };
  put(planDoc(date), encore);
  addTo('plans', date);
  return encore;
}

const publicPlan = (p) =>
  p && {
    date: p.date,
    title: p.title,
    blurb: p.blurb,
    game: { id: p.game.id, name: p.game.name, tagline: p.game.tagline, goal: p.game.goal, scoring: p.game.scoring, path: p.game.path },
    mods: p.mods,
    encore: p.encore || null,
  };

// ------------------------------------------------------------------ boards, places and medals

/** rows for `ids` on a day's board, best first, with places (equal scores share a place) */
function ranked(date, ids) {
  const b = board(date);
  const rows = [...new Set(ids)].filter((id) => b[id]).map((id) => ({ userId: id, ...b[id] }));
  rows.sort((a, z) => z.score - a.score || a.at - z.at);
  for (const r of rows) r.place = 1 + rows.filter((x) => x.score > r.score).length;
  return rows;
}

const medalFor = (place) => (place >= 1 && place <= 3 ? ['gold', 'silver', 'bronze'][place - 1] : null);
const MEDAL_RULE = 2; // 1: 1st and 2nd needed two players, 3rd three (2026-11-23 to 11-25); 2: the top three, alone or not

/** days settled under an older medal rule get their medals again under today's (once) */
function remedal() {
  const m = meta();
  if ((m.medalRule ?? 1) >= MEDAL_RULE) return;
  for (const date of m.settled) {
    for (const id of Object.keys(board(date))) {
      const u = userRec(id);
      const day = u.days[date];
      if (!day || day.place == null) continue;
      const want = medalFor(day.place);
      if ((day.medal ?? null) === want) continue;
      if (day.medal) u.medals[day.medal] = Math.max(0, u.medals[day.medal] - 1);
      if (want) u.medals[want]++;
      day.medal = want;
      save(userDoc(id));
    }
  }
  m.medalRule = MEDAL_RULE;
  save(META);
}

/** give out the medals for every day that has closed and isn't settled yet */
export function settleDue(friendIds) {
  remedal();
  const m = meta();
  const t = now();
  for (const date of m.boards) {
    if (m.settled.includes(date) || t < dayEnd(date) + SETTLE_AFTER_MS) continue;
    const b = board(date);
    for (const id of Object.keys(b)) {
      const rows = ranked(date, [id, ...friendIds(id)]);
      const me = rows.find((r) => r.userId === id);
      if (!me) continue;
      const medal = medalFor(me.place);
      const u = userRec(id);
      const day = u.days[date];
      if (day) {
        day.place = me.place;
        day.of = rows.length;
        day.medal = medal;
      }
      if (medal) u.medals[medal]++;
      save(userDoc(id));
    }
    m.settled.push(date);
    save(META);
    // a day's runs only matter while scores can still arrive
    put(runsDoc(date), {});
  }
}

function streakOf(u) {
  let d = u.days[today()] ? today() : prevDay(today());
  let n = 0;
  while (u.days[d]) {
    n++;
    d = prevDay(d);
  }
  return n;
}

const statsOf = (u) => ({ medals: u.medals, played: u.played, streak: streakOf(u) });

// ------------------------------------------------------------------ routes

const adminHash = () => (process.env.FG_ADMIN_TOKEN ? crypto.createHash('sha256').update(process.env.FG_ADMIN_TOKEN).digest() : null);
function requireAdmin(req, res, next) {
  const want = adminHash();
  if (!want) return res.status(503).json({ error: 'No admin key is set on this server.' });
  const got = crypto.createHash('sha256').update(String(req.get('x-flash-admin') || '')).digest();
  if (!crypto.timingSafeEqual(want, got)) return res.status(401).json({ error: 'Wrong admin key.' });
  next();
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

/**
 * Mount FlashGames under /fg on Shoallhell's api router.
 * deps: { requireUser, userForToken, friendIds, getUser }
 */
export function mountFlashGames(api, { requireUser, userForToken, friendIds, getUser }) {
  const settle = () => settleDue(friendIds);
  const optionalUser = (req) => {
    const h = req.get('authorization') || '';
    return h.startsWith('Bearer ') ? userForToken(h.slice(7)) : null;
  };

  /** `user` and their friends on a day's board, best first; `medals` for a day that is over */
  const boardFor = (date, user, medals) =>
    ranked(date, [user.id, ...friendIds(user.id)]).map((r) => ({
      userId: r.userId,
      name: getUser(r.userId)?.name || r.name,
      score: r.score,
      detail: r.detail,
      runs: r.runs,
      place: r.place,
      me: r.userId === user.id,
      ...(medals ? { medal: medalFor(r.place) } : {}),
    }));
  /** a day that is over: its plan, and you and your friends on its board */
  const pastDay = (date, user) => {
    const p = getPlan(date);
    return p && { date, plan: publicPlan(p), players: Object.keys(board(date)).length, board: boardFor(date, user, true) };
  };

  /** today's run, and (signed in) you and your friends on today's and yesterday's boards, and your medals */
  api.get('/fg/today', (req, res) => {
    settle();
    const date = today();
    const plan = planFor(date);
    const user = optionalUser(req);
    const out = { date, serverNow: now(), endsAt: dayEnd(date), limit: LIMIT_S, plan: publicPlan(plan), players: Object.keys(board(date)).length };
    if (user) {
      out.board = boardFor(date, user, false);
      const mine = board(date)[user.id];
      out.me = { id: user.id, name: user.name, best: mine?.score ?? null, detail: mine?.detail ?? '', runs: mine?.runs ?? 0 };
      const y = pastDay(prevDay(date), user);
      if (y) out.yesterday = y;
      out.stats = statsOf(userRec(user.id));
    }
    res.json(out);
  });

  /** any day that is over (never today or later: plans are secret until their day) */
  api.get('/fg/day', requireUser, (req, res) => {
    settle();
    const date = String(req.query.date || '');
    if (!DAY.test(date) || date >= today()) return res.status(400).json({ error: 'Pick a day that is over.' });
    const d = pastDay(date, req.user);
    if (!d) return res.status(404).json({ error: 'There was no run that day.' });
    res.json(d);
  });

  /** start a run of today's plan; the answer has the ?flash= code for the game */
  api.post('/fg/runs', requireUser, (req, res) => {
    settle();
    const date = today();
    if (req.body?.date && req.body.date !== date) return res.status(409).json({ error: 'That day is over. Here is today’s run.', date });
    const plan = planFor(date);
    if (!plan) return res.status(404).json({ error: 'There is no run today.' });
    const r = runs(date);
    const mine = Object.values(r).filter((x) => x.userId === req.user.id).length;
    if (mine >= MAX_RUNS_PER_DAY) return res.status(429).json({ error: 'That’s a lot of runs for one day. Come back tomorrow.' });
    const id = randomId('r_');
    r[id] = { userId: req.user.id, created: now(), startedAt: 0, score: 0, detail: '', final: false };
    save(runsDoc(date));
    const flash = { v: 1, date, seed: plan.seed, mods: plan.mods.map((m) => m.id), limit: LIMIT_S, run: id, ...(plan.params ? { params: plan.params } : {}) };
    res.json({ run: id, date, limit: LIMIT_S, path: plan.game.path, flash: b64url(flash) });
  });

  const findRun = (req, res) => {
    const id = String(req.params.id || '');
    for (const date of [today(), prevDay(today())]) {
      const r = runs(date)[id];
      if (r) {
        if (r.userId !== req.user.id) break;
        return { date, run: r };
      }
    }
    res.status(404).json({ error: 'That run is over.' });
    return null;
  };

  /** the game is loaded and the countdown finished: the 15 minutes start now */
  api.post('/fg/runs/:id/go', requireUser, (req, res) => {
    const f = findRun(req, res);
    if (!f) return;
    if (!f.run.startedAt) {
      if (now() - f.run.created > GO_WITHIN_MS) return res.status(410).json({ error: 'That run took too long to start. Start a new one.' });
      f.run.startedAt = now();
      save(runsDoc(f.date));
    }
    res.json({ ok: true, startedAt: f.run.startedAt, endsAt: f.run.startedAt + LIMIT_S * 1000 });
  });

  /** a run's score so far (sent every few seconds while playing, and once at the end with final: true) */
  api.post('/fg/runs/:id/score', requireUser, (req, res) => {
    const f = findRun(req, res);
    if (!f) return;
    const { date, run } = f;
    const plan = getPlan(date);
    if (!run.startedAt) return res.status(409).json({ error: 'That run hasn’t started.' });
    if (now() > run.startedAt + LIMIT_S * 1000 + GRACE_MS) return res.status(410).json({ error: 'Time was up for that run.', best: board(date)[req.user.id]?.score ?? 0 });
    if (run.final) return res.json({ ok: true, best: board(date)[req.user.id]?.score ?? 0 });
    const score = Math.floor(Number(req.body?.score));
    if (!Number.isFinite(score) || score < 0 || score > (plan?.game.maxScore ?? 1e9)) return res.status(400).json({ error: 'Bad score.' });
    const detail = str(req.body?.detail, 120);
    if (score >= run.score) {
      run.score = score;
      run.detail = detail;
    }
    if (req.body?.final) run.final = true;
    save(runsDoc(date));
    const b = board(date);
    const prev = b[req.user.id];
    const runCount = Object.values(runs(date)).filter((x) => x.userId === req.user.id && x.startedAt).length;
    if (!prev || run.score > prev.score) {
      b[req.user.id] = { name: req.user.name, score: run.score, detail: run.detail, runs: runCount, at: now() };
      addTo('boards', date);
      const u = userRec(req.user.id);
      if (!u.days[date]) u.played++;
      u.days[date] = { score: run.score, detail: run.detail, game: plan?.game.id, name: plan?.game.name, title: plan?.title };
      const cutoff = shift(today(), -KEEP_DAYS);
      for (const d of Object.keys(u.days)) if (d < cutoff) delete u.days[d];
      save(userDoc(req.user.id));
    } else if (prev.runs !== runCount) prev.runs = runCount;
    save(boardDoc(date));
    res.json({ ok: true, best: b[req.user.id].score });
  });

  /** a year of someone's daily bests and their medals (yourself or a friend) */
  api.get('/fg/profile', requireUser, (req, res) => {
    settle();
    const id = String(req.query.user || req.user.id);
    if (id !== req.user.id && !friendIds(req.user.id).includes(id)) return res.status(403).json({ error: 'You can only see your friends.' });
    const who = getUser(id);
    if (!who) return res.status(404).json({ error: 'No such player.' });
    const u = userRec(id);
    const days = Object.entries(u.days)
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, z) => (a.date < z.date ? 1 : -1));
    res.json({ user: { id, name: who.name }, stats: statsOf(u), days, today: today() });
  });

  // ---- the owner's PC (the Monday planning task) uploads plans with the admin key

  /** what is planned from two weeks ago on, with how many played each day */
  api.get('/fg/admin/plans', requireAdmin, (_req, res) => {
    settle();
    const from = shift(today(), -14);
    const plans = meta()
      .plans.filter((d) => d >= from)
      .map((d) => {
        const p = getPlan(d);
        const b = board(d);
        const scores = Object.values(b).map((x) => x.score);
        return { date: d, title: p?.title, game: p?.game.id, mods: p?.mods.map((m) => m.id), encore: p?.encore || null, players: scores.length, runs: Object.values(runs(d)).filter((x) => x.startedAt).length, top: scores.length ? Math.max(...scores) : null };
      });
    res.json({ today: today(), plans });
  });

  /** add or replace plans for today (only before anyone has played it) and later days */
  api.put('/fg/admin/plans', requireAdmin, (req, res) => {
    const list = Array.isArray(req.body?.plans) ? req.body.plans : [];
    if (!list.length || list.length > 60) return res.status(400).json({ error: 'Send 1 to 60 plans.' });
    const stored = [];
    const refused = [];
    const t = today();
    for (const raw of list) {
      const r = cleanPlan(raw);
      if (r.error) {
        refused.push({ date: raw?.date, error: r.error });
        continue;
      }
      const d = r.plan.date;
      if (d < t) {
        refused.push({ date: d, error: 'That day is over.' });
        continue;
      }
      if (d === t && Object.values(runs(d)).length) {
        refused.push({ date: d, error: 'People have already played today.' });
        continue;
      }
      put(planDoc(d), { ...r.plan, uploadedAt: now() });
      addTo('plans', d);
      stored.push(d);
    }
    res.json({ stored, refused });
  });

  if (process.env.FG_TEST_CLOCK === '1') {
    /** tests only: move this server's clock */
    api.post('/fg/admin/clock', requireAdmin, (req, res) => {
      clockOffset = Number(req.body?.now) - Date.now();
      res.json({ now: now(), today: today() });
    });
  }
}
