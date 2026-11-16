// One scenario being played. Solo and co-op hosts own the CombatState and run the rules (act + tick); a co-op guest
// sends intents to the host and draws whatever state comes back.
import type { ScenarioDef } from '../data/story';
import type { Coop } from '../net/coop';
import { act, tick, type Intent } from './rules';
import type { CombatState } from './types';

export type Role = 'solo' | 'host' | 'guest';

export class Match {
  state: CombatState;
  private listeners = new Set<(s: CombatState) => void>();
  private pumping = false;
  private timer = 0;
  private destroyed = false;
  private offs: (() => void)[] = [];
  /** speed multiplier for monster turns (settings) */
  speed = 1;

  constructor(
    public sc: ScenarioDef,
    state: CombatState,
    public me: string,
    public role: Role,
    public coop: Coop | null,
  ) {
    this.state = state;
    if (role === 'host' && coop) {
      this.offs.push(
        coop.on('guestmsg', (m: { from: string; msg: { type: string; intent?: Intent } }) => {
          if (m.msg?.type === 'intent' && m.msg.intent) {
            const err = act(this.state, m.from, m.msg.intent);
            if (err) coop.toGuests({ type: 'error', to: m.from, error: err });
            this.changed();
          } else if (m.msg?.type === 'hello') this.broadcast();
        }),
      );
    }
    if (role === 'guest' && coop) {
      this.offs.push(
        coop.on('hostmsg', (m: { type: string; state?: CombatState; to?: string; error?: string }) => {
          if (m.type === 'state' && m.state) {
            this.state = m.state;
            this.notify();
          }
        }),
      );
      coop.toHost({ type: 'hello' });
    }
  }

  onChange(fn: (s: CombatState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const f of this.listeners) f(this.state);
  }

  private broadcast(): void {
    if (this.role === 'host' && this.coop) this.coop.toGuests({ type: 'state', state: this.state });
  }

  private changed(): void {
    this.notify();
    this.broadcast();
    this.pump();
  }

  /** Send a player action. Returns an error message for solo/host; guests hear back through the state. */
  intent(i: Intent): string | null {
    if (this.role === 'guest') {
      this.coop?.toHost({ type: 'intent', intent: i });
      return null;
    }
    const err = act(this.state, this.me, i);
    this.changed();
    return err;
  }

  /** Solo/host: run the automatic parts (monster turns) with a pause between beats so they can be watched. */
  start(): void {
    this.changed();
  }

  private pump(): void {
    if (this.role === 'guest' || this.pumping || this.destroyed) return;
    this.pumping = true;
    const beat = (): void => {
      if (this.destroyed) return;
      const before = this.state.order[this.state.turnIdx];
      const did = tick(this.state);
      if (!did) {
        this.pumping = false;
        return;
      }
      this.notify();
      this.broadcast();
      const slow = before?.kind === 'monster' || before?.kind === 'summon';
      this.timer = window.setTimeout(beat, (slow ? 750 : 220) / this.speed);
    };
    this.timer = window.setTimeout(beat, 120);
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
    for (const o of this.offs) o();
    this.listeners.clear();
  }
}
