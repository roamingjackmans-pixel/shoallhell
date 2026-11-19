// Shoallhell: boot, sign-in, and the flow between the hall, story cards, scenarios, co-op and results.
//
// Co-op is one session from opening (or joining) a lobby until leaving it: the host starts missions from the lobby,
// guests are pulled into each one automatically, and everyone comes back to the lobby afterwards. The room is
// remembered in the browser, so a refresh (host or guest) puts you straight back in the lobby or the fight.
import './ui/theme.css';
import { save, saveNow, session, signOut, startOnline } from './app';
import { EPILOGUE, PREMISE, SUBTITLE, TITLE, scenarioById, type ScenarioDef } from './data/story';
import { applyResult, camp, heroSetup, makeCharacter, scenarioLevel, type Character } from './game/campaign';
import { Match } from './game/match';
import { createCombat, type HeroSetup } from './game/rules';
import type { CombatState } from './game/types';
import { api, getToken } from './net/api';
import { clearCoopRecord, Coop, getCoopRecord, saveCoopRecord } from './net/coop';
import { clearResume, getResume, saveResume } from './resume';
import { authScreen } from './ui/auth';
import { combatScreen } from './ui/combat';
import { clear, h, toast } from './ui/dom';
import { startFriends, stopFriends } from './ui/friends';
import { hallScreen, partyIds } from './ui/hall';
import { lobbyScreen, myChars, roomChars, setupsFor, type CoopSession } from './ui/lobby';
import { resultsScreen } from './ui/results';
import { storyScreen } from './ui/story';

const root = document.getElementById('app')!;
let teardown: (() => void) | null = null;

function show(fn: () => (() => void) | void): void {
  teardown?.();
  teardown = null;
  const t = fn();
  if (t) teardown = t;
}

/** Development only: ?test=9c&classes=knight,lamplighter&level=3 jumps straight into a scenario (nothing is saved). */
function devTest(): boolean {
  if (!import.meta.env.DEV) return false;
  const q = new URLSearchParams(location.search);
  const id = q.get('test');
  const sc = id ? scenarioById(id) : undefined;
  if (!sc) return false;
  const classes = (q.get('classes') || 'knight,scholar').split(',');
  const level = Number(q.get('level') || 1);
  const setups = classes.map((cls, i) => {
    const c = makeCharacter(`${cls} ${i + 1}`, cls);
    c.level = level;
    return heroSetup(c, 'dev');
  });
  const state = createCombat(sc, setups, Number(q.get('slevel') || Math.ceil(level / 2)), seed());
  const match = new Match(sc, state, 'dev', 'solo', null);
  (window as unknown as { __match: Match }).__match = match;
  show(() => combatScreen(root, match, () => undefined, () => location.assign(location.pathname)));
  return true;
}

async function boot(): Promise<void> {
  if (devTest()) return;
  root.appendChild(h('div.screen.bgwater', h('div.center', { style: { paddingTop: '30vh', color: 'var(--dim)' } }, 'Wading in…')));
  if (getToken()) {
    try {
      const me = await api.me();
      startOnline(me.user, me.profile, me.rev);
      return enter();
    } catch {
      /* signed out, or the server is away */
    }
  }
  show(() => authScreen(root, () => enter()));
}

function enter(): void {
  const s = session!;
  const p = s.profile;
  if (s.mode === 'online') void startFriends({ joinLobby: (code) => void joinCoop(code, defaultIds()) });
  // came back from a refresh in the middle of a co-op game: straight back in
  const rec = s.mode === 'online' ? getCoopRecord(s.user.id) : null;
  if (rec) {
    void rejoinCoop();
    return;
  }
  if (!p.seenPremise) {
    show(() =>
      storyScreen(
        root,
        TITLE,
        PREMISE,
        () => {
          p.seenPremise = true;
          save();
          hall();
        },
        SUBTITLE,
      ),
    );
  } else hall();
}

function hall(): void {
  show(() =>
    hallScreen(root, {
      play: (sc, chars) => playSolo(sc, chars),
      resume: () => {
        const r = getResume(session!.user.id);
        if (r) runMatch(new Match(r.sc, r.state, session!.user.id, 'solo', null), () => hall());
      },
      coop: (chars) => (cs ? lobby() : coopHome(chars.map((c) => c.id))),
      joinLobby: (code) => void joinCoop(code, defaultIds()),
      inCoop: () => (cs?.coop.room ? cs.coop.room.code : null),
      signOut: async () => {
        await leaveCoop(false);
        stopFriends();
        await Coop.dropShared();
        await signOut();
        show(() => authScreen(root, () => enter()));
      },
      story: (title, lines, after, sub) => show(() => storyScreen(root, title, lines, after, sub)),
    }),
  );
}

function seed(): number {
  return (Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9);
}

// ---------------------------------------------------------------- solo

function playSolo(sc: ScenarioDef, chars: Character[]): void {
  const s = session!;
  if (!chars.length) {
    toast('Pick at least one tenant for the party.');
    return;
  }
  const level = scenarioLevel(
    chars.map((c) => c.level),
    sc.depth,
    camp(s.profile).difficulty,
  );
  show(() =>
    storyScreen(
      root,
      sc.name,
      sc.intro,
      () => {
        const setups = chars.map((c) => heroSetup(c, s.user.id));
        const state = createCombat(sc, setups, level, seed());
        const match = new Match(sc, state, s.user.id, 'solo', null);
        runMatch(match, () => hall());
      },
      `Scenario level ${level}`,
    ),
  );
}

let currentMatch: Match | null = null;

/**
 * Play a match to its end, apply the results to this account, then show them. `onOver` runs the moment the fight
 * ends (before the results), `onLeave` when the player leaves mid-fight.
 */
function runMatch(match: Match, after: () => void, label?: string, onOver?: () => void, onLeave?: () => void): void {
  const s = session!;
  let done = false;
  currentMatch = match;
  if (match.role === 'solo') {
    let t = 0;
    match.onChange((st) => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        if (!done) saveResume({ userId: s.user.id, sc: match.sc, state: st, at: Date.now() });
      }, 400);
    });
  }
  show(() => {
    const stop = combatScreen(
      root,
      match,
      (st: CombatState) => {
        if (done) return;
        done = true;
        match.destroy();
        if (currentMatch === match) currentMatch = null;
        clearResume();
        onOver?.();
        const outcome = applyResult(s.profile, st, s.user.id, match.sc, match.role === 'guest');
        void saveNow();
        if (cs && !cs.coop.isHost) cs.coop.toHost({ type: 'setups', setups: setupsFor(cs.charIds) }); // levels may have changed
        const results = (): void => show(() => resultsScreen(root, match.sc.name, outcome, after, label, st));
        if (outcome.won && match.sc.outro.length) {
          const lines = outcome.ending ? [...match.sc.outro, ...EPILOGUE] : match.sc.outro;
          show(() => storyScreen(root, outcome.ending ? 'The End (of the lease)' : match.sc.name, lines, results));
        } else results();
      },
      () => {
        done = true;
        match.destroy();
        if (currentMatch === match) currentMatch = null;
        clearResume();
        if (onLeave) onLeave();
        else after();
      },
    );
    return () => {
      stop();
    };
  });
}

// ---------------------------------------------------------------- co-op

/** The co-op session this tab is in, if any. */
let cs: CoopSession | null = null;
/** host: the mission being played, so a refreshed host can carry on from it */
let hostMission: { sc: ScenarioDef; state: CombatState } | null = null;

function defaultIds(): string[] {
  const live = myChars();
  const ids = partyIds().filter((id) => live.some((c) => c.id === id));
  return ids.length ? ids : live.slice(0, 1).map((c) => c.id);
}

function record(): void {
  if (!cs?.coop.room) return;
  saveCoopRecord({
    userId: session!.user.id,
    code: cs.coop.room.code,
    role: cs.coop.isHost ? 'host' : 'guest',
    charIds: cs.charIds,
    sc: cs.coop.isHost ? hostMission?.sc ?? null : null,
    state: cs.coop.isHost ? hostMission?.state ?? null : null,
  });
}

/** The co-op screen before a room is open: host or join. */
function coopHome(ids: string[]): void {
  if (session!.mode !== 'online') {
    toast('Co-op needs an account.');
    return;
  }
  show(() => lobbyScreen(root, lobbyNav(), null, ids));
}

function lobby(): void {
  if (!cs) return hall();
  show(() => lobbyScreen(root, lobbyNav(), cs, cs!.charIds));
}

function lobbyNav() {
  return {
    host: (ids: string[]) => void hostCoop(ids),
    join: (code: string, ids: string[]) => void joinCoop(code, ids),
    start: (sc: ScenarioDef, setups: HeroSetup[], level: number) => hostStart(sc, setups, level),
    leave: () => void leaveCoop(true),
    back: () => hall(),
  };
}

async function hostCoop(ids: string[]): Promise<void> {
  try {
    const coop = await Coop.shared();
    if (cs) await leaveCoop(false);
    await coop.host(roomChars(ids));
    openSession(coop, ids);
    lobby();
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not open a lobby.');
  }
}

async function joinCoop(code: string, ids: string[]): Promise<void> {
  if (session!.mode !== 'online') {
    toast('Co-op needs an account.');
    return;
  }
  if (cs?.coop.room?.code === code) return lobby();
  if (cs?.inMatch && !confirm('You are in the middle of a co-op mission. Leave it and join the other lobby?')) return;
  try {
    const coop = await Coop.shared();
    if (cs) await leaveCoop(false);
    await coop.join(code, roomChars(ids));
    openSession(coop, ids);
    coop.toHost({ type: 'setups', setups: setupsFor(ids) });
    lobby();
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not join.');
  }
}

/** Leave the co-op game on purpose (the room closes if you host it). */
async function leaveCoop(toHall: boolean): Promise<void> {
  const c = cs;
  if (!c) {
    if (toHall) hall();
    return;
  }
  cs = null;
  hostMission = null;
  for (const o of c.offs) o();
  if (currentMatch?.coop) {
    currentMatch.destroy();
    currentMatch = null;
  }
  c.coop.leave();
  clearCoopRecord();
  if (toHall) hall();
}

/** Start listening for everything that happens in the room, for as long as we are in it. */
function openSession(coop: Coop, ids: string[]): CoopSession {
  const me = session!.user.id;
  const c: CoopSession = { coop, charIds: ids, setups: new Map(), chosen: null, inMatch: false, hostBusy: null, offs: [] };
  cs = c;
  if (coop.isHost) c.setups.set(me, setupsFor(ids));
  const mine = (): boolean => cs === c;
  c.offs.push(
    coop.on('closed', (m: { reason?: string }) => {
      if (!mine()) return;
      toast(m.reason || 'The co-op game closed.', 4000);
      cs = null;
      hostMission = null;
      for (const o of c.offs) o();
      currentMatch?.destroy();
      currentMatch = null;
      hall();
    }),
    coop.on('reattached', () => mine() && record()),
    coop.on('room', () => mine() && record()),
  );
  if (coop.isHost) {
    c.offs.push(
      coop.on('guestmsg', (m: { from: string; msg: { type: string; setups?: HeroSetup[] } }) => {
        if (!mine()) return;
        if (m.msg?.type === 'setups' && Array.isArray(m.msg.setups)) c.setups.set(m.from, m.msg.setups.slice(0, 4).map((x) => ({ ...x, owner: m.from })));
        // someone (re)joined the lobby: tell them what is picked
        if ((m.msg?.type === 'setups' || m.msg?.type === 'hello') && !c.inMatch) coop.toGuests({ type: 'pick', pick: c.chosen });
      }),
      coop.on('guestleft', (m: { userId: string }) => mine() && c.setups.delete(m.userId)),
    );
  } else {
    c.offs.push(
      coop.on('hostmsg', (m: { type: string; pick?: ScenarioDef | null; sc?: ScenarioDef; state?: CombatState }) => {
        if (!mine()) return;
        if (m.type === 'pick') {
          c.chosen = m.pick ?? null;
          c.hostBusy = null;
        } else if (m.type === 'need-setups') coop.toHost({ type: 'setups', setups: setupsFor(c.charIds) });
        else if ((m.type === 'start' || m.type === 'rejoin') && m.sc && m.state && !c.inMatch) {
          // a mission we are part of: go straight in, from the lobby or the results screen
          const inIt = m.state.units.some((u) => u.kind === 'hero' && u.owner === me && !u.escaped);
          if (inIt || m.type === 'start') guestMatch(m.sc, m.state);
          else c.hostBusy = m.sc.name;
        } else if (m.type === 'abort' && c.inMatch) {
          currentMatch?.destroy();
          currentMatch = null;
          c.inMatch = false;
          toast('The host ended the mission.');
          lobby();
        }
      }),
      coop.on('hostaway', () => mine() && toast('The host lost their connection. Waiting a few minutes for them to come back…', 6000)),
      coop.on('hostback', () => mine() && toast('The host is back.')),
    );
  }
  // a host (re)opening the session asks everyone already in the room for their heroes (after a refresh it has none)
  if (coop.isHost) coop.toGuests({ type: 'need-setups' });
  record();
  return c;
}

function hostStart(sc: ScenarioDef, setups: HeroSetup[], level: number): void {
  const c = cs;
  if (!c) return;
  const s = session!;
  const state = createCombat(sc, setups.slice(0, 4), level, seed());
  c.inMatch = true;
  c.coop.toGuests({ type: 'start', sc, state });
  const match = new Match(sc, state, s.user.id, 'host', c.coop);
  trackHostMission(match);
  runMatch(
    match,
    () => lobby(),
    'Back to the lobby',
    () => {
      c.inMatch = false;
      hostMission = null;
      record();
    },
    () => {
      // the host abandons the mission: everyone goes back to the lobby
      c.coop.toGuests({ type: 'abort' });
      c.inMatch = false;
      hostMission = null;
      record();
      lobby();
    },
  );
}

/** Keep the host's mission in the room record so a refresh can carry on from it. */
function trackHostMission(match: Match): void {
  hostMission = { sc: match.sc, state: match.state };
  let t = 0;
  match.onChange((st) => {
    if (!hostMission) return;
    hostMission.state = st;
    clearTimeout(t);
    t = window.setTimeout(record, 500);
  });
  record();
}

function guestMatch(sc: ScenarioDef, state: CombatState): void {
  const c = cs;
  if (!c) return;
  c.inMatch = true;
  c.hostBusy = null;
  const match = new Match(sc, state, session!.user.id, 'guest', c.coop);
  runMatch(
    match,
    () => lobby(),
    'Back to the lobby',
    () => {
      c.inMatch = false;
    },
    () => void leaveCoop(true),
  );
}

/** After a refresh: back into the room (and, for the host, the mission in progress). */
async function rejoinCoop(): Promise<void> {
  const s = session!;
  const rec = getCoopRecord(s.user.id);
  if (!rec) return hall();
  let cancelled = false;
  show(() => {
    clear(root);
    const screen = h(
      'div.screen.bgwater',
      h(
        'div.col',
        { style: { alignItems: 'center', paddingTop: '28vh', gap: '14px' } },
        h('div', { style: { fontSize: '20px' } }, `Rejoining your co-op game (room ${rec.code})…`),
        h('button', { onclick: () => ((cancelled = true), clearCoopRecord(), hall()) }, 'Cancel'),
      ),
    );
    root.appendChild(screen);
  });
  try {
    const coop = await Coop.shared();
    if (cancelled) return;
    const ids = rec.charIds.filter((id) => myChars().some((c) => c.id === id));
    if (rec.role === 'host') await coop.reclaim(rec.code);
    else await coop.join(rec.code, roomChars(ids));
    if (cancelled) return;
    const c = openSession(coop, ids);
    if (rec.role === 'host' && rec.sc && rec.state && rec.state.phase !== 'won' && rec.state.phase !== 'lost') {
      // carry on with the mission: guests get the whole state again
      c.inMatch = true;
      const match = new Match(rec.sc, rec.state, s.user.id, 'host', coop);
      match.sendRejoin();
      trackHostMission(match);
      runMatch(
        match,
        () => lobby(),
        'Back to the lobby',
        () => {
          c.inMatch = false;
          hostMission = null;
          record();
        },
        () => {
          coop.toGuests({ type: 'abort' });
          c.inMatch = false;
          hostMission = null;
          record();
          lobby();
        },
      );
      toast('Back in your co-op game.');
      return;
    }
    if (rec.role === 'guest') {
      coop.toHost({ type: 'setups', setups: setupsFor(ids) });
      coop.toHost({ type: 'hello' });
    }
    lobby();
    toast('Back in your co-op game.');
  } catch (e) {
    clearCoopRecord();
    if (cancelled) return;
    toast(e instanceof Error ? `${e.message}` : 'That co-op game has closed.', 4000);
    hall();
  }
}

void boot();
