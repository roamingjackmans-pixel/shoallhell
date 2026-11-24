// Talking to the Shoallhell server: sign-up, sign-in, the save file. The server address comes from config.json
// next to the page ("" = the same site, as when the server serves the game or in development through Vite's proxy).
export interface User {
  id: string;
  email: string;
  name: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
let server = '';
let serverP: Promise<string> | null = null;

/**
 * Where the server is. Every call shares one look at config.json: calls made at the same moment (an API call and
 * the socket, say) would otherwise go ahead before the address arrived and ask the page's own site instead.
 */
export function serverBase(): Promise<string> {
  serverP ??= (async () => {
    try {
      const r = await fetch(`${BASE}/config.json`, { cache: 'no-store' });
      if (r.ok) server = String((await r.json()).server || '').replace(/\/$/, '');
    } catch {
      /* same origin */
    }
    return server;
  })();
  return serverP;
}

export function apiRoot(): string {
  return `${server}${server ? '/games/shoallhell' : BASE}`;
}

const TOKEN_KEY = 'shoallhell.token';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}
export function setToken(t: string): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private window */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  await serverBase();
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${apiRoot()}/api${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch {
    throw new ApiError('Can’t reach the Shoallhell server. Check your connection, or play offline on this device.', 0);
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) throw new ApiError(String(data.error || `Server error (${res.status}).`), res.status, data);
  return data as T;
}

export const api = {
  ping: () => call<{ ok: boolean }>('GET', '/ping'),
  signup: (email: string, password: string, name: string) => call<{ token: string; user: User }>('POST', '/signup', { email, password, name }),
  login: (email: string, password: string) => call<{ token: string; user: User }>('POST', '/login', { email, password }),
  logout: () => call<{ ok: boolean }>('POST', '/logout', {}),
  me: () => call<{ user: User; profile: unknown; rev: number }>('GET', '/me'),
  save: (profile: unknown, rev: number) => call<{ rev: number }>('PUT', '/profile', { profile, rev }),
  password: (oldP: string, newP: string) => call<{ ok: boolean }>('POST', '/password', { old: oldP, new: newP }),
  rename: (name: string) => call<{ ok: boolean; user: User }>('POST', '/name', { name }),
  friends: () => call<FriendsView>('GET', '/friends'),
  addFriend: (code: string) => call<{ ok: boolean; friends: boolean; view: FriendsView }>('POST', '/friends/add', { code }),
  acceptFriend: (id: string) => call<{ ok: boolean; view: FriendsView }>('POST', '/friends/accept', { id }),
  removeFriend: (id: string) => call<{ ok: boolean; view: FriendsView }>('POST', '/friends/remove', { id }),
};

export interface FriendInfo {
  id: string;
  name: string;
  code: string;
  online?: boolean;
  /** the co-op lobby they are in, if any */
  lobby?: string | null;
  /** which game they are playing ('shoallhell' or 'syb' = Smash Your Bros, same accounts and friends) */
  game?: string | null;
}
export interface FriendsView {
  /** your own friend code */
  code: string;
  friends: FriendInfo[];
  incoming: FriendInfo[];
  outgoing: FriendInfo[];
}
