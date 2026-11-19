// Online co-op through the Shoallhell server's relay: a room with a 6-digit code, one host and up to three guests.
// The host's browser runs the rules; guests send intents and draw the state the host sends back.
//
// Refresh-proof: the room you are in is remembered in this browser (CoopRecord), so after a reload the game
// reconnects you — a host reclaims the room (the server holds it for a few minutes) and picks the fight back up from
// its saved state; a guest takes their seat back and the host sends them the current state. A dropped connection
// without a reload re-attaches by itself when the socket reconnects.
import { io, type Socket } from 'socket.io-client';
import type { ScenarioDef } from '../data/story';
import type { CombatState } from '../game/types';
import { apiRoot, getToken, serverBase } from './api';

export interface RoomChar {
  charId: string;
  name: string;
  cls: string;
  level: number;
}
export interface RoomPlayer {
  userId: string;
  name: string;
  chars: RoomChar[];
  online: boolean;
}
export interface RoomView {
  code: string;
  host: string;
  hostOnline?: boolean;
  players: RoomPlayer[];
}

type Handler = (data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

export class Coop {
  private socket: Socket;
  room: RoomView | null = null;
  isHost = false;
  private lastChars: RoomChar[] = [];
  private handlers = new Map<string, Set<Handler>>();

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.on('room:update', (r: RoomView) => {
      this.room = r;
      this.emit('room', r);
    });
    socket.on('room:closed', (m: { reason: string }) => {
      this.room = null;
      clearCoopRecord();
      this.emit('closed', m);
    });
    socket.on('host:msg', (m: unknown) => this.emit('hostmsg', m));
    socket.on('guest:msg', (m: { from: string; msg: unknown }) => this.emit('guestmsg', m));
    socket.on('guest:left', (m: { userId: string }) => this.emit('guestleft', m));
    socket.on('guest:joined', (m: { userId: string; name: string; back?: boolean }) => this.emit('guestjoined', m));
    socket.on('host:away', (m: { until: number }) => this.emit('hostaway', m));
    socket.on('host:back', () => this.emit('hostback', {}));
    socket.on('friends:update', () => this.emit('friends', {}));
    socket.on('friend:invite', (m: { fromId: string; fromName: string; code: string }) => this.emit('invite', m));
    socket.on('disconnect', () => this.emit('disconnect', {}));
    // the socket came back after a drop: take our place in the room again
    socket.on('connect', () => void this.reattach());
  }

  private static sharedP: Promise<Coop> | null = null;

  /**
   * The one connection this tab keeps open while signed in: it shows you online to your friends, carries invites,
   * and is the co-op link when you are in a lobby.
   */
  static shared(): Promise<Coop> {
    Coop.sharedP ??= Coop.connect().catch((e) => {
      Coop.sharedP = null;
      throw e;
    });
    return Coop.sharedP;
  }

  /** Close the shared connection (signing out). */
  static async dropShared(): Promise<void> {
    const p = Coop.sharedP;
    Coop.sharedP = null;
    if (p) (await p.catch(() => null))?.close();
  }

  /** Invite a friend into the lobby you are in. */
  invite(userId: string): Promise<void> {
    return new Promise((resolve, reject) =>
      this.socket.emit('friend:invite', { userId }, (r: { ok?: boolean; error?: string }) => (r?.ok ? resolve() : reject(new Error(r?.error || 'Could not invite.')))),
    );
  }

  /** The lobby code a friend is in, to join it from the friends list. */
  friendLobby(userId: string): Promise<string> {
    return new Promise((resolve, reject) =>
      this.socket.emit('friend:lobby', { userId }, (r: { code?: string; error?: string }) => (r?.code ? resolve(r.code) : reject(new Error(r?.error || 'They are not in a lobby.')))),
    );
  }

  static async connect(): Promise<Coop> {
    const server = await serverBase();
    const socket = io(server || undefined, { path: `${apiRoot().replace(server, '')}/socket.io`.replace(/^\/\//, '/'), auth: { token: getToken() }, transports: ['websocket', 'polling'] });
    return await new Promise<Coop>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('The co-op server is not answering.')), 8000);
      socket.once('connect', () => {
        clearTimeout(t);
        resolve(new Coop(socket));
      });
      socket.once('connect_error', (e) => {
        clearTimeout(t);
        socket.close();
        reject(new Error(e.message || 'Could not connect for co-op.'));
      });
    });
  }

  private async reattach(): Promise<void> {
    const code = this.room?.code;
    if (!code) return;
    try {
      if (this.isHost) await this.reclaim(code);
      else await this.join(code, this.lastChars);
      this.emit('reattached', {});
    } catch (e) {
      this.room = null;
      clearCoopRecord();
      this.emit('closed', { reason: e instanceof Error ? e.message : 'The game has closed.' });
    }
  }

  on(ev: string, fn: Handler): () => void {
    let set = this.handlers.get(ev);
    if (!set) this.handlers.set(ev, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  private emit(ev: string, data: unknown): void {
    for (const f of this.handlers.get(ev) ?? []) f(data);
  }

  host(chars: RoomChar[]): Promise<RoomView> {
    this.lastChars = chars;
    return new Promise((resolve, reject) =>
      this.socket.emit('host:create', { chars }, (r: { ok?: boolean; room?: RoomView; error?: string }) => {
        if (!r?.ok || !r.room) return reject(new Error(r?.error || 'Could not host.'));
        this.isHost = true;
        this.room = r.room;
        resolve(r.room);
      }),
    );
  }

  /** Take back a room this account hosts (after a refresh or a dropped connection). */
  reclaim(code: string): Promise<RoomView> {
    return new Promise((resolve, reject) =>
      this.socket.emit('host:reclaim', { code }, (r: { ok?: boolean; room?: RoomView; error?: string }) => {
        if (!r?.ok || !r.room) return reject(new Error(r?.error || 'That game has closed.'));
        this.isHost = true;
        this.room = r.room;
        resolve(r.room);
      }),
    );
  }

  join(code: string, chars: RoomChar[]): Promise<RoomView> {
    this.lastChars = chars;
    return new Promise((resolve, reject) =>
      this.socket.emit('room:join', { code, chars }, (r: { ok?: boolean; room?: RoomView; error?: string }) => {
        if (!r?.ok || !r.room) return reject(new Error(r?.error || 'Could not join.'));
        this.isHost = false;
        this.room = r.room;
        resolve(r.room);
      }),
    );
  }

  setChars(chars: RoomChar[]): void {
    this.lastChars = chars;
    this.socket.emit('room:chars', { chars });
  }

  toGuests(msg: unknown): void {
    this.socket.emit('host:msg', msg);
  }

  toHost(msg: unknown): void {
    this.socket.emit('guest:msg', msg);
  }

  /** Leave on purpose: the seat is given up (or, for the host, the room closes). */
  leave(): void {
    this.socket.emit('room:leave');
    this.room = null;
    clearCoopRecord();
  }

  close(): void {
    this.socket.close();
    this.handlers.clear();
  }
}

// ------------------------------------------------------------------ remembering the room across a refresh

const RECORD_KEY = 'shoallhell.coop';
/** how long a remembered room is worth trying to rejoin */
const RECORD_MAX_AGE = 2 * 60 * 60 * 1000;

export interface CoopRecord {
  userId: string;
  code: string;
  role: 'host' | 'guest';
  /** the heroes this player brought */
  charIds: string[];
  /** host only: the fight in progress, so a refreshed host can carry on */
  sc?: ScenarioDef | null;
  state?: CombatState | null;
  at: number;
}

export function saveCoopRecord(r: Omit<CoopRecord, 'at'>): void {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify({ ...r, at: Date.now() }));
  } catch {
    /* storage blocked: rejoining just isn't offered */
  }
}

export function getCoopRecord(userId: string): CoopRecord | null {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as CoopRecord;
    if (r.userId !== userId || Date.now() - r.at > RECORD_MAX_AGE) return null;
    return r;
  } catch {
    return null;
  }
}

export function clearCoopRecord(): void {
  try {
    localStorage.removeItem(RECORD_KEY);
  } catch {
    /* ignore */
  }
}
