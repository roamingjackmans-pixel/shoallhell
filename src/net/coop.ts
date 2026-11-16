// Online co-op through the Shoallhell server's relay: a room with a 6-digit code, one host and up to three guests.
// The host's browser runs the rules; guests send intents and draw the state the host sends back.
import { io, type Socket } from 'socket.io-client';
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
  players: RoomPlayer[];
}

type Handler = (data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

export class Coop {
  private socket: Socket;
  room: RoomView | null = null;
  isHost = false;
  private handlers = new Map<string, Set<Handler>>();

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.on('room:update', (r: RoomView) => {
      this.room = r;
      this.emit('room', r);
    });
    socket.on('room:closed', (m: { reason: string }) => {
      this.room = null;
      this.emit('closed', m);
    });
    socket.on('host:msg', (m: unknown) => this.emit('hostmsg', m));
    socket.on('guest:msg', (m: { from: string; msg: unknown }) => this.emit('guestmsg', m));
    socket.on('guest:left', (m: { userId: string }) => this.emit('guestleft', m));
    socket.on('guest:joined', (m: { userId: string; name: string }) => this.emit('guestjoined', m));
    socket.on('disconnect', () => this.emit('disconnect', {}));
    socket.on('connect', () => this.emit('reconnect', {}));
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
    return new Promise((resolve, reject) =>
      this.socket.emit('host:create', { chars }, (r: { ok?: boolean; room?: RoomView; error?: string }) => {
        if (!r?.ok || !r.room) return reject(new Error(r?.error || 'Could not host.'));
        this.isHost = true;
        this.room = r.room;
        resolve(r.room);
      }),
    );
  }

  join(code: string, chars: RoomChar[]): Promise<RoomView> {
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
    this.socket.emit('room:chars', { chars });
  }

  toGuests(msg: unknown): void {
    this.socket.emit('host:msg', msg);
  }

  toHost(msg: unknown): void {
    this.socket.emit('guest:msg', msg);
  }

  leave(): void {
    this.socket.emit('room:leave');
    this.room = null;
  }

  close(): void {
    this.socket.close();
    this.handlers.clear();
  }
}
