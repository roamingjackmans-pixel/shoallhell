// One scenario being played. Solo and co-op hosts own the CombatState and run the rules (act + tick); a co-op guest
// sends intents to the host and draws whatever state comes back.
import type { ScenarioDef } from '../data/story';
import type { Coop } from '../net/coop';
import { act, dropPlayer, tick, type Intent } from './rules';
import type { CombatState } from './types';

export type Role = 'solo' | 'host' | 'guest';

/** A ping on a hex, shared with everyone in the game (it never touches the rules state). */
export interface PingMsg {
  x: number;
  y: number;
  from: string;
}

export class Match {
  state: CombatState;
  private listeners = new Set<(s: CombatState) => void>();
  private pumping = false;
  private timer = 0;
  private destroyed = false;
  private offs: (() => void)[] = [];
  private pingListeners = new Set<(p: PingMsg) => void>();
  private lastPing = -Infinity;
  /** speed multiplier for monster turns (settings) */
  speed = 1;
  /** a FlashGames run whose time is up: nothing runs and every action is ignored */
  frozen = false;

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
          } else if (m.msg?.type === 'hello' || m.msg?.type === 'setups') {
            // a guest (re)joined mid-fight, e.g. after refreshing their browser: send them the whole game
            this.sendRejoin();
          }
          else if (m.msg?.type === 'ping') {
            const p = this.cleanPing((m.msg as { ping?: unknown }).ping, m.from);
            if (p) {
              this.showPing(p);
              coop.toGuests({ type: 'ping', ping: p });
            }
          }
        }),
        // the host's own connection came back: everyone gets the current state again
        coop.on('reattached', () => this.sendRejoin()),
        // a guest left on purpose: their heroes drop out so nobody waits on them
        coop.on('guestleft', (g: { userId: string }) => {
          if (dropPlayer(this.state, g.userId)) this.changed();
        }),
      );
    }
    if (role === 'guest' && coop) {
      this.offs.push(
        coop.on('hostmsg', (m: { type: string; state?: CombatState; to?: string; error?: string; ping?: PingMsg }) => {
          if (m.type === 'ping' && m.ping && m.ping.from !== this.me) {
            const p = this.cleanPing(m.ping, m.ping.from);
            if (p) this.showPing(p);
          } else if ((m.type === 'state' || m.type === 'rejoin') && m.state) {
            this.state = m.state;
            this.notify();
          }
        }),
      );
      // our connection came back: ask the host for the current state
      this.offs.push(coop.on('reattached', () => coop.toHost({ type: 'hello' })));
      coop.toHost({ type: 'hello' });
    }
  }

  onPing(fn: (p: PingMsg) => void): () => void {
    this.pingListeners.add(fn);
    return () => this.pingListeners.delete(fn);
  }

  /** Ping a hex for everyone (at most about three a second). */
  ping(x: number, y: number): void {
    const now = performance.now();
    if (now - this.lastPing < 300) return;
    this.lastPing = now;
    const p: PingMsg = { x, y, from: this.me };
    this.showPing(p);
    if (this.role === 'host') this.coop?.toGuests({ type: 'ping', ping: p });
    else if (this.role === 'guest') this.coop?.toHost({ type: 'ping', ping: p });
  }

  private showPing(p: PingMsg): void {
    for (const f of this.pingListeners) f(p);
  }

  private cleanPing(raw: unknown, from: string): PingMsg | null {
    const r = raw as { x?: unknown; y?: unknown } | null;
    const x = Number(r?.x);
    const y = Number(r?.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.state.map.w || y >= this.state.map.h) return null;
    return { x, y, from };
  }

  onChange(fn: (s: CombatState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const f of this.listeners) f(this.state);
  }

  /** Send the scenario and the full current state to every guest (for players coming back mid-fight). */
  sendRejoin(): void {
    if (this.role !== 'host' || !this.coop) return;
    this.coop.toGuests({ type: 'rejoin', sc: this.sc, state: this.state.undo ? { ...this.state, undo: '1' } : this.state });
  }

  private broadcast(): void {
    if (this.role !== 'host' || !this.coop) return;
    // guests only need to know that an undo exists; the snapshot itself stays with the host
    const st = this.state.undo ? { ...this.state, undo: '1' } : this.state;
    this.coop.toGuests({ type: 'state', state: st });
  }

  private changed(): void {
    this.notify();
    this.broadcast();
    this.pump();
  }

  /** Send a player action. Returns an error message for solo/host; guests hear back through the state. */
  intent(i: Intent): string | null {
    if (this.frozen) return null;
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
      if (this.destroyed || this.frozen) return;
      const before = this.state.order[this.state.turnIdx];
      const did = tick(this.state);
      if (!did) {
        this.pumping = false;
        return;
      }
      this.notify();
      this.broadcast();
      const slow = before?.kind === 'monster' || before?.kind === 'summon';
      // enemy turns run at half speed (1.5 s a beat) so you can see what they do
      this.timer = window.setTimeout(beat, (slow ? 1500 : 220) / this.speed);
    };
    this.timer = window.setTimeout(beat, 120);
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
    for (const o of this.offs) o();
    this.listeners.clear();
    this.pingListeners.clear();
  }
}
