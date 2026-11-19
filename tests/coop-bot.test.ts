// A co-op guest bot for manual testing: ROOM=1234 npx vitest run tests/coop-bot.test.ts
// Signs up (or in) a second test account on the dev server, joins the room, brings a Brute and plays it.
import { io } from 'socket.io-client';
import { it } from 'vitest';
import { CLASS_CARDS } from '../src/data/cards';
import { unkey } from '../src/game/grid';
import { attackOptions, moveOptions, type HeroSetup, type Intent } from '../src/game/rules';
import type { CombatState, HeroUnit } from '../src/game/types';

const ROOM = process.env.ROOM;
const SERVER = process.env.SERVER || 'http://localhost:3031';

it.skipIf(!ROOM)(
  'guest bot plays a co-op game',
  async () => {
    const creds = { email: 'bot@shoallhell.test', password: 'guest-bot-5521', name: 'Guest Bot' };
    let r = await fetch(`${SERVER}/games/shoallhell/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
    if (!r.ok) r = await fetch(`${SERVER}/games/shoallhell/api/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
    const { token, user } = (await r.json()) as { token: string; user: { id: string } };
    const sock = io(SERVER, { path: '/games/shoallhell/socket.io', auth: { token }, transports: ['websocket'] });
    await new Promise<void>((res) => sock.once('connect', () => res()));
    const setup: HeroSetup = {
      owner: user.id,
      charId: 'bot1',
      name: 'Bot Brute',
      cls: 'brute',
      level: 1,
      maxHp: 10,
      cards: CLASS_CARDS.brute!.filter((c) => c.level === 1).slice(0, 10).map((c) => c.id),
      items: [],
      perks: [],
    };
    const joined = await new Promise<{ ok?: boolean; error?: string }>((res) => sock.emit('room:join', { code: ROOM, chars: [{ charId: 'bot1', name: 'Bot Brute', cls: 'brute', level: 1 }] }, res));
    if (!joined.ok) throw new Error(joined.error);
    const send = (intent: Intent): void => void sock.emit('guest:msg', { type: 'intent', intent });
    sock.on('host:msg', (m: { type: string }) => {
      if (m.type === 'need-setups') sock.emit('guest:msg', { type: 'setups', setups: [setup] });
    });
    sock.emit('guest:msg', { type: 'setups', setups: [setup] });
    let last = '';
    let done = false;
    sock.on('host:msg', (m: { type: string; state?: CombatState }) => {
      if ((m.type !== 'state' && m.type !== 'start' && m.type !== 'rejoin') || !m.state) return;
      const s = m.state;
      if (s.phase === 'won' || s.phase === 'lost') {
        done = true;
        return;
      }
      const me = s.units.find((u): u is HeroUnit => u.kind === 'hero' && u.owner === user.id);
      if (!me || me.exhausted) return;
      const sig = `${s.phase}|${s.round}|${s.turnIdx}|${JSON.stringify(s.heroTurn)}|${s.pending?.heroUid}`;
      if (sig === last) return;
      last = sig;
      setTimeout(() => {
        if (s.pending?.heroUid === me.uid) return send({ t: 'negate', uid: me.uid, choice: 'take' });
        if (s.phase === 'select' && !me.ready) {
          if (me.hand.length < 2) return send({ t: 'longRest', uid: me.uid });
          return send({ t: 'pick', uid: me.uid, cards: [me.hand[0]!, me.hand[1]!] });
        }
        const t = s.heroTurn;
        if (s.phase !== 'turns' || !t || t.uid !== me.uid || !t.started) return;
        if (me.longRest) return send({ t: 'restLose', uid: me.uid, card: me.discard[0]! });
        if (!t.cur) {
          const used = t.used[0];
          const card = used ? me.picked.find((c) => c !== used.card)! : me.picked[0]!;
          return send({ t: 'half', uid: me.uid, card, half: used ? (used.half === 'top' ? 'bot' : 'top') : 'top', basic: false });
        }
        const st = t.cur.steps[t.cur.step]!;
        if (st.t === 'move') {
          const opts = moveOptions(s, me);
          const foe = s.units.find((u) => u.kind === 'monster' && !u.dead);
          if (!opts.length || !foe) return send({ t: 'skip', uid: me.uid });
          opts.sort((a, b) => {
            const [ax, ay] = unkey(a);
            const [bx, by] = unkey(b);
            return Math.hypot(ax - foe.x, ay - foe.y) - Math.hypot(bx - foe.x, by - foe.y);
          });
          const [x, y] = unkey(opts[0]!);
          return send({ t: 'move', uid: me.uid, x, y });
        }
        if (st.t === 'attack') {
          const o = attackOptions(s, me, st)[0];
          if (!o) return send({ t: 'skip', uid: me.uid });
          if (o.startsWith('t')) {
            const [x, y] = unkey(Number(o.slice(1)));
            return send({ t: 'target', uid: me.uid, x, y });
          }
          return send({ t: 'target', uid: me.uid, target: o });
        }
        send({ t: 'target', uid: me.uid, target: me.uid });
        setTimeout(() => send({ t: 'skip', uid: me.uid }), 150);
      }, 300);
    });
    const until = Date.now() + 10 * 60 * 1000;
    while (!done && Date.now() < until) await new Promise((res) => setTimeout(res, 500));
    sock.close();
  },
  11 * 60 * 1000,
);
