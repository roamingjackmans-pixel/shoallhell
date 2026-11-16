// Shoallhell: boot, sign-in, and the flow between the hall, story cards, scenarios, co-op and results.
import './ui/theme.css';
import { save, saveNow, session, signOut, startOnline } from './app';
import { EPILOGUE, PREMISE, SUBTITLE, TITLE, scenarioById, type ScenarioDef } from './data/story';
import { applyResult, heroSetup, makeCharacter, scenarioLevel, type Character } from './game/campaign';
import { Match } from './game/match';
import { createCombat, type HeroSetup } from './game/rules';
import type { CombatState } from './game/types';
import { api, getToken } from './net/api';
import type { Coop } from './net/coop';
import { authScreen } from './ui/auth';
import { combatScreen } from './ui/combat';
import { h, toast } from './ui/dom';
import { hallScreen } from './ui/hall';
import { lobbyScreen } from './ui/lobby';
import { resultsScreen } from './ui/results';
import { storyScreen } from './ui/story';
import { clearResume, getResume, saveResume } from './resume';

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
  const p = session!.profile;
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
      coop: (chars) => coopLobby(chars),
      signOut: async () => {
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
    s.profile.difficulty,
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

/** Play a match to its end, apply the results to this account, then show them. */
function runMatch(match: Match, after: () => void, label?: string): void {
  const s = session!;
  let done = false;
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
        clearResume();
        const campaign = match.role !== 'guest' || s.profile.unlocked.includes(match.sc.id);
        const outcome = applyResult(s.profile, st, s.user.id, match.sc, campaign);
        void saveNow();
        const results = (): void => show(() => resultsScreen(root, match.sc.name, outcome, after, label));
        if (outcome.won && match.sc.outro.length) {
          const lines = outcome.ending ? [...match.sc.outro, ...EPILOGUE] : match.sc.outro;
          show(() => storyScreen(root, outcome.ending ? 'The End (of the lease)' : match.sc.name, lines, results));
        } else results();
      },
      () => {
        done = true;
        match.destroy();
        clearResume();
        if (match.coop && match.role === 'guest') match.coop.leave();
        after();
      },
    );
    return () => {
      stop();
    };
  });
}

// ---------------------------------------------------------------- co-op

function coopLobby(chars: Character[], existing?: Coop): void {
  const s = session!;
  if (s.mode !== 'online') {
    toast('Co-op needs an account.');
    return;
  }
  show(() =>
    lobbyScreen(
      root,
      chars,
      {
        hostStart: (coop, sc, setups: HeroSetup[], level) => {
          const state = createCombat(sc, setups, level, seed());
          coop.toGuests({ type: 'start', sc, state });
          const match = new Match(sc, state, s.user.id, 'host', coop);
          runMatch(match, () => coopLobby(chars, coop), 'Back to the lobby');
        },
        guestStart: (coop, sc, state) => {
          const match = new Match(sc, state as CombatState, s.user.id, 'guest', coop);
          const off = coop.on('closed', () => {
            off();
            toast('The host closed the game.');
            match.destroy();
            hall();
          });
          runMatch(
            match,
            () => {
              off();
              coopLobby(chars, coop);
            },
            'Back to the lobby',
          );
        },
        back: () => hall(),
      },
      existing,
    ),
  );
}

void boot();
