// The turn chime: a short sound when it becomes one of your heroes' turn. Synthesised with Web Audio (no sound
// files). The choice and volume are kept in this browser (a per-device preference).

export const CHIMES = [
  { id: 'bell', name: 'Boiler-room bell' },
  { id: 'dingdong', name: 'Ding-dong (the front door)' },
  { id: 'whistle', name: 'Steam whistle' },
  { id: 'harp', name: 'Glowen harp' },
  { id: 'gong', name: 'Gong from the Depths' },
  { id: 'triangle', name: 'Tiny triangle' },
  { id: 'kettle', name: 'Kettle’s on' },
  { id: 'off', name: 'Off' },
] as const;
export type ChimeId = (typeof CHIMES)[number]['id'];

const KEY = 'shoallhell.chime';
const VOL = 'shoallhell.chimeVolume';

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

let memChime: ChimeId | null = null;
let memVol: number | null = null;

export function getChime(): ChimeId {
  if (memChime) return memChime;
  const v = read(KEY);
  return CHIMES.some((c) => c.id === v) ? (v as ChimeId) : 'bell';
}
export function setChime(id: ChimeId): void {
  memChime = id;
  write(KEY, id);
}
/** 0..1 */
export function getVolume(): number {
  if (memVol !== null) return memVol;
  const v = Number(read(VOL));
  return read(VOL) !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6;
}
export function setVolume(v: number): void {
  memVol = Math.max(0, Math.min(1, v));
  write(VOL, String(memVol));
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One decaying tone. */
function tone(a: AudioContext, out: AudioNode, freq: number, start: number, dur: number, type: OscillatorType, peak: number, attack = 0.005): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** A bell: a fundamental plus inharmonic partials. */
function bell(a: AudioContext, out: AudioNode, f: number, t: number, dur: number, peak: number): void {
  for (const [mult, amp] of [
    [1, 1],
    [2.0, 0.5],
    [2.76, 0.35],
    [5.4, 0.18],
  ] as const)
    tone(a, out, f * mult, t, dur / mult ** 0.3, 'sine', peak * amp);
}

/** Play a chime (the chosen one by default). */
export function playChime(id: ChimeId = getChime(), volume = getVolume()): void {
  if (id === 'off' || volume <= 0) return;
  const a = audio();
  if (!a) return;
  const out = a.createGain();
  out.gain.value = volume * 0.5;
  out.connect(a.destination);
  const t = a.currentTime + 0.02;
  switch (id) {
    case 'bell':
      bell(a, out, 880, t, 1.4, 0.5);
      break;
    case 'dingdong':
      bell(a, out, 784, t, 0.9, 0.45);
      bell(a, out, 622, t + 0.42, 1.3, 0.45);
      break;
    case 'whistle': {
      // a steam whistle: two detuned saws through a band-pass, a little vibrato, and some hiss
      const bp = a.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 6;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.08);
      g.gain.setValueAtTime(0.9, t + 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      bp.connect(g).connect(out);
      for (const f of [520, 523]) {
        const o = a.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.94, t);
        o.frequency.linearRampToValueAtTime(f, t + 0.12);
        const lfo = a.createOscillator();
        const lg = a.createGain();
        lfo.frequency.value = 6;
        lg.gain.value = 6;
        lfo.connect(lg).connect(o.frequency);
        o.connect(bp);
        o.start(t);
        lfo.start(t);
        o.stop(t + 1);
        lfo.stop(t + 1);
      }
      break;
    }
    case 'harp':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(a, out, f, t + i * 0.09, 1.1, 'triangle', 0.4));
      break;
    case 'gong':
      for (const [m, amp] of [
        [1, 1],
        [1.48, 0.6],
        [2.03, 0.45],
        [2.71, 0.3],
        [3.9, 0.15],
      ] as const)
        tone(a, out, 98 * m, t, 2.8, 'sine', 0.55 * amp, 0.02);
      break;
    case 'triangle':
      bell(a, out, 2093, t, 0.7, 0.25);
      bell(a, out, 2093, t + 0.18, 0.9, 0.2);
      break;
    case 'kettle':
      // a kettle coming to the boil: a rising whistle
      {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(1200, t);
        o.frequency.exponentialRampToValueAtTime(2200, t + 0.7);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 1);
      }
      break;
  }
}
