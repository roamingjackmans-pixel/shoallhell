// Pings travel host -> guests and guest -> host -> other guests, and never touch the rules state.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/data/story';
import { Match, type PingMsg } from '../src/game/match';
import { createCombat, type HeroSetup } from '../src/game/rules';
import type { Coop } from '../src/net/coop';

type Handler = (d: unknown) => void;

/** A tiny in-memory stand-in for the server relay: one host, any number of guests. */
function relay(): { host: Coop; guest: (id: string) => Coop } {
  const hostH = new Map<string, Set<Handler>>();
  const guests: { id: string; h: Map<string, Set<Handler>> }[] = [];
  const on = (m: Map<string, Set<Handler>>) => (ev: string, fn: Handler) => {
    if (!m.has(ev)) m.set(ev, new Set());
    m.get(ev)!.add(fn);
    return () => m.get(ev)!.delete(fn);
  };
  const fire = (m: Map<string, Set<Handler>>, ev: string, d: unknown): void => m.get(ev)?.forEach((f) => f(d));
  const host = { on: on(hostH), toGuests: (msg: unknown) => guests.forEach((g) => fire(g.h, 'hostmsg', msg)), toHost: () => undefined } as unknown as Coop;
  const guest = (id: string): Coop => {
    const h = new Map<string, Set<Handler>>();
    guests.push({ id, h });
    return { on: on(h), toHost: (msg: unknown) => fire(hostH, 'guestmsg', { from: id, msg }), toGuests: () => undefined } as unknown as Coop;
  };
  return { host, guest };
}

const setup = (owner: string, cls: string): HeroSetup => ({ owner, charId: owner, name: owner, cls, level: 1, maxHp: 10, cards: [], items: [], perks: [] });

describe('pings', () => {
  it('reach everyone in the game', () => {
    const r = relay();
    const sc = SCENARIOS[0]!;
    const state = createCombat(sc, [setup('ann', 'knight'), setup('bob', 'scholar'), setup('cat', 'brute')], 1, 5);
    const seen: Record<string, PingMsg[]> = { ann: [], bob: [], cat: [] };
    const host = new Match(sc, state, 'ann', 'host', r.host);
    const bob = new Match(sc, structuredClone(state), 'bob', 'guest', r.guest('bob'));
    const cat = new Match(sc, structuredClone(state), 'cat', 'guest', r.guest('cat'));
    host.onPing((p) => seen.ann!.push(p));
    bob.onPing((p) => seen.bob!.push(p));
    cat.onPing((p) => seen.cat!.push(p));
    const before = JSON.stringify(state);

    host.ping(3, 4);
    expect(seen.ann).toEqual([{ x: 3, y: 4, from: 'ann' }]);
    expect(seen.bob).toEqual([{ x: 3, y: 4, from: 'ann' }]);
    expect(seen.cat).toEqual([{ x: 3, y: 4, from: 'ann' }]);

    bob.ping(5, 6);
    // bob sees his own ping once (not echoed back), the host and cat see it too
    expect(seen.bob!.filter((p) => p.from === 'bob')).toEqual([{ x: 5, y: 6, from: 'bob' }]);
    expect(seen.ann!.at(-1)).toEqual({ x: 5, y: 6, from: 'bob' });
    expect(seen.cat!.at(-1)).toEqual({ x: 5, y: 6, from: 'bob' });

    // an off-map ping from a guest is dropped by the host
    const n = seen.ann!.length;
    r.guest('dan').toHost({ type: 'ping', ping: { x: 999, y: -1 } });
    expect(seen.ann!.length).toBe(n);
    // pings never change the game state
    expect(JSON.stringify(host.state)).toBe(before);
    host.destroy();
    bob.destroy();
    cat.destroy();
  });
});
