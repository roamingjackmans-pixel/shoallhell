// The signed-in session and its save. Online accounts save to the server (debounced, with a revision check);
// offline play saves to this browser only.
import { newProfile, upgradeProfile, type Profile } from './game/campaign';
import { api, ApiError, setToken, type User } from './net/api';

export interface Session {
  mode: 'online' | 'offline';
  user: User;
  profile: Profile;
  rev: number;
}

export let session: Session | null = null;

const OFFLINE_KEY = 'shoallhell.offline';
let saveTimer = 0;
let saving: Promise<void> | null = null;
let saveListeners: ((status: string) => void)[] = [];

export function onSaveStatus(fn: (status: string) => void): void {
  saveListeners.push(fn);
}
function status(s: string): void {
  for (const f of saveListeners) f(s);
}

export function startOnline(user: User, profile: unknown, rev: number, token?: string): Session {
  if (token) setToken(token);
  const p = profile ? upgradeProfile(profile as Profile) : newProfile(user.name);
  session = { mode: 'online', user, profile: p, rev };
  if (!profile) saveNow();
  return session;
}

export function startOffline(): Session {
  let p: Profile | null = null;
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    if (raw) p = upgradeProfile(JSON.parse(raw));
  } catch {
    /* none */
  }
  session = { mode: 'offline', user: { id: 'offline', email: '', name: p?.name ?? 'Tenant' }, profile: p ?? newProfile('Tenant'), rev: 0 };
  saveNow();
  return session;
}

export async function signOut(): Promise<void> {
  if (session?.mode === 'online') {
    await flushSave();
    try {
      await api.logout();
    } catch {
      /* already gone */
    }
  }
  setToken('');
  session = null;
}

/** Save soon (batches rapid changes). */
export function save(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 600);
}

export async function saveNow(): Promise<void> {
  clearTimeout(saveTimer);
  const s = session;
  if (!s) return;
  if (s.mode === 'offline') {
    try {
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(s.profile));
      status('Saved on this device');
    } catch {
      status('Could not save (browser storage blocked)');
    }
    return;
  }
  if (saving) await saving;
  saving = (async () => {
    try {
      status('Saving…');
      const r = await api.save(s.profile, s.rev);
      s.rev = r.rev;
      status('Saved');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) status('Your save changed on another device. Reload to get it.');
      else status(e instanceof Error ? e.message : 'Could not save');
    } finally {
      saving = null;
    }
  })();
  await saving;
}

export async function flushSave(): Promise<void> {
  if (saveTimer) await saveNow();
  if (saving) await saving;
}

window.addEventListener('beforeunload', () => {
  if (session?.mode === 'offline') {
    try {
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(session.profile));
    } catch {
      /* ignore */
    }
  }
});
