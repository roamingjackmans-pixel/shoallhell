// A solo scenario in progress is kept in this browser so a reload (or a closed tab) can pick it up again.
import type { ScenarioDef } from './data/story';
import type { CombatState } from './game/types';

const KEY = 'shoallhell.resume';

export interface Suspended {
  userId: string;
  sc: ScenarioDef;
  state: CombatState;
  at: number;
}

export function saveResume(r: Suspended): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* storage full or blocked: resuming just isn't offered */
  }
}

export function getResume(userId: string): Suspended | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Suspended;
    if (r.userId !== userId || !r.state || r.state.phase === 'won' || r.state.phase === 'lost') return null;
    return r;
  } catch {
    return null;
  }
}

export function clearResume(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
