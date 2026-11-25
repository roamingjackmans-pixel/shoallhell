// FlashGames mode: the page was opened with ?flash=… (see C:\dev\FlashGames\docs\PROTOCOL.md and flash-run.js). No
// sign-in, hall, lobby or server, and nothing is read from or written to any save: the day's party plays the day's
// chain of seeded scenarios (src/flash/run.ts) until the party falls or the 15 minutes are up. Winning a scenario
// goes straight into the next one, a Depth deeper; the score keeps adding up.
import { CLASSES } from '../data/classes';
import { Match } from '../game/match';
import type { CombatState } from '../game/types';
import { combatScreen } from '../ui/combat';
import { h, toast } from '../ui/dom';
import { FLASH_MODS } from './mods';
import { FLASH_OWNER, FlashScore, flashCombat, partyPlan, type FlashCfg } from './run';

/** Monster beats about three times as fast as normal play (0.5 s instead of 1.5 s), and quicker walking. */
const SPEED = 3;
const ENEMY_STEP = 0.09;
/** how long VICTORY shows before the next scenario starts (ms) */
const NEXT_DELAY = 1400;

const fmt = (n: number): string => n.toLocaleString('en-US');

export async function flashBoot(root: HTMLElement): Promise<void> {
  const F = window.FlashRun;
  const cfg: FlashCfg = { mods: F.mods, rng: (salt) => F.rng(salt) };
  const run = new FlashScore();
  const plan = partyPlan(cfg);
  const mods = FLASH_MODS.filter((m) => F.has(m.id));
  let k = 0;
  let match: Match | null = null;
  let stop: (() => void) | null = null;
  let over = false;
  /** the clock is running (FlashRun.ready() resolved): scores are reported from then on */
  let started = false;

  const report = (s: CombatState): void => {
    const { score, detail } = run.now(k, s);
    if (started) F.score(score, detail);
  };

  /** In the top bar: the run's score and the day's modifiers (hover one for what it does). */
  const topExtra = (): HTMLElement =>
    h(
      'div.flash-bar',
      h('div.flash-score', { title: 'FlashGames score' }, `★ ${fmt(run.best)}`),
      h('div.flash-sc', `Scenario ${k + 1}`),
      ...mods.map((m) => h('span.flash-mod', { title: m.text }, m.name)),
    );

  const party = plan.classes.map((c) => `${CLASSES[c]?.name ?? c}`).join(' & ');

  function overlay(...kids: HTMLElement[]): HTMLElement {
    const o = h('div.flash-over', h('div.panel.flash-panel', ...kids));
    // nothing underneath can be clicked
    o.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.appendChild(o);
    return o;
  }

  function endRun(reason: 'dead' | 'time'): void {
    if (over) return;
    over = true;
    const s = match?.state;
    // the goal was met and only the rest of the round was left: a met goal always ends in a win, so it counts
    if (s?.goalMet && s.phase === 'turns') run.bankWin(s);
    const { score, detail } = s ? run.now(k, s) : { score: run.best, detail: '' };
    if (match) match.frozen = true;
    F.over(score, detail, reason);
    const show = (): void => {
      overlay(
        h('div.flash-kicker', reason === 'time' ? 'Time’s up!' : 'The union is washed up'),
        h('div.flash-final', fmt(score)),
        h('div.dim', detail),
        h('div.small.dim', `${party}, level ${plan.level}${mods.length ? ` · ${mods.map((m) => m.name).join(' · ')}` : ''}`),
      );
    };
    // a fallen party gets a moment for the defeat banner first
    if (reason === 'dead') setTimeout(show, NEXT_DELAY);
    else show();
  }

  function play(): void {
    const { sc, state } = flashCombat(k, cfg);
    const m = new Match(sc, state, FLASH_OWNER, 'solo', null);
    m.speed = SPEED;
    match = m;
    // development only: the running match, for checking things from the console (and the browser checks)
    if (import.meta.env.DEV) (window as unknown as { __match: Match }).__match = m;
    m.onChange((st) => {
      if (over) return;
      if (st.phase === 'won') {
        const bonus = run.bankWin(st);
        if (bonus) toast(`Scenario won: +${fmt(bonus)} bonus. Next one, a Depth deeper…`, NEXT_DELAY + 600);
      }
      report(st);
      if (st.phase === 'lost') endRun('dead');
    });
    stop?.();
    stop = combatScreen(root, m, () => next(m), () => undefined, { noLeave: true, topExtra, endDelay: NEXT_DELAY, enemyStep: ENEMY_STEP });
    report(state);
  }

  /** A scenario is over (after its banner): won, the next one while time remains. */
  function next(m: Match): void {
    if (over || m !== match || m.state.phase !== 'won') return;
    m.destroy();
    k++;
    play();
  }

  root.classList.add('flash-mode');
  F.onEnd(() => endRun('time'));
  if (import.meta.env.DEV) (window as unknown as { __flash: unknown }).__flash = { run, cfg, k: () => k, over: () => over };
  try {
    play();
  } catch (e) {
    console.error('[Shoallhell] could not set up the FlashGames run', e);
    overlay(h('div.flash-kicker', 'This run could not start'), h('div.dim', e instanceof Error ? e.message : String(e)));
    return;
  }
  // paused until FlashGames starts the clock: the board shows, nothing can be clicked
  const gate = overlay(
    h('div.flash-kicker', 'FlashGames · Shoallhell'),
    h('div', { style: { fontSize: '20px', fontWeight: '700' } }, `${party}, level ${plan.level}`),
    h('div.small.dim', 'Win a scenario and the next one starts at once, a Depth deeper. The score keeps adding up.'),
    ...mods.map((m) => h('div.small', h('b.accent', m.name), ` — ${m.text}`)),
    h('div.dim', 'Get ready…'),
  );
  await F.ready();
  gate.remove();
  started = true;
  // (set inside play(); TypeScript cannot see that through the await)
  const now = match as Match | null;
  if (now && !over) report(now.state);
}
