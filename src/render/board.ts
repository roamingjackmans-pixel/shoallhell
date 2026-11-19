// The battle board: a top-down hex map in Dungeon Joe's zone styles, its enemies drawn with Dungeon Joe's own art,
// the heroes drawn as Joe in their class gear, plus highlights (where you can move, who you can hit), drag-and-drop
// movement, floating numbers and swings. Unopened rooms stay dark. Pan by dragging empty ground (any mouse button)
// or with WASD/arrow keys; zoom with the wheel or +/−; F re-fits the map.
import { monsterDef, SUMMONS } from '../data/monsters';
import { zoneLook, type ZoneLook } from '../data/zones';
import { drawById, type DrawState } from '../draw/registry';
import '../draw/enemies';
import { glow, shade, withAlpha, OUTLINE } from '../draw/parts';
import { drawRoomProp, drawStairs } from '../draw/props';
import { drawChest } from '../draw/enemies/crypt';
import { ELEMENTS } from '../draw/elements';
import { hexCenter, key, neighbors, pixelToHex, roomAt, tile, unkey } from '../game/grid';
import type { CombatState, Fx, Unit } from '../game/types';
import { drawHero } from './hero';
import { registerExecutor } from './executor';

/** Hex radius in world pixels (centre to corner). A hex is √3·S ≈ 64 px wide. */
export const S = 37;
const PAD = 40;

registerExecutor();

/** World-pixel centre of a hex. */
export function hexPx(x: number, y: number): [number, number] {
  const [ux, uy] = hexCenter(x, y);
  return [PAD + ux * S + (Math.sqrt(3) * S) / 2, PAD + uy * S + S];
}

function hexPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

interface Disp {
  /** world pixels */
  px: number;
  py: number;
  path: [number, number][];
  pathT: number;
  flashUntil: number;
  swingUntil: number;
  dying: number;
  facing: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
}

/** A ping someone put on a hex: pulsing rings and their name, for about three seconds. */
export interface Ping {
  x: number;
  y: number;
  color: string;
  label: string;
  t0: number;
}

const PING_SECONDS = 3.2;

interface Shot {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t0: number;
  color: string;
}

export interface Highlights {
  move?: Set<number>;
  enemies?: Set<string>;
  allies?: Set<string>;
  aim?: Set<number>;
  aoe?: (x: number, y: number) => [number, number][];
  draggable?: string;
  teleport?: Set<number>;
  /** hexes a pushed enemy can be sent to (the player chooses) */
  push?: Set<number>;
}

export interface BoardHandlers {
  onTile?(x: number, y: number): void;
  onUnit?(uid: string): void;
  onDrop?(uid: string, x: number, y: number): void;
  onHover?(uid: string | null, x: number, y: number): void;
  /** right-click on a hex */
  onPing?(x: number, y: number): void;
}

function rngFrom(seed: number) {
  let s = seed | 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + next() * (hi - lo),
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p: number) => next() < p,
  };
}

export class Board {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  state: CombatState | null = null;
  hl: Highlights = {};
  handlers: BoardHandlers = {};
  private cam = { x: 0, y: 0, z: 1 };
  private camFitted = false;
  private disp = new Map<string, Disp>();
  private floaters: Floater[] = [];
  private shots: Shot[] = [];
  private lastFx = 0;
  private staticCanvas: HTMLCanvasElement | null = null;
  private staticKey = '';
  private hover: [number, number] = [-1, -1];
  private hoverUid: string | null = null;
  private drag: { uid: string; sx: number; sy: number; wx: number; wy: number; moved: boolean } | null = null;
  private pan: { sx: number; sy: number; cx: number; cy: number; click: boolean; button: number } | null = null;
  private pings: Ping[] = [];
  private keys = new Set<string>();
  private t0 = performance.now();
  private raf = 0;
  private dpr = 1;
  private lastFrame = performance.now();
  focusUid: string | null = null;

  /** Show a ping on a hex (from this player or anyone else in the game). */
  ping(x: number, y: number, color: string, label: string): void {
    // a new ping from the same person replaces their old one
    this.pings = this.pings.filter((p) => p.label !== label);
    this.pings.push({ x, y, color, label, t0: this.now() });
  }

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board';
    this.canvas.tabIndex = 0;
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.remove();
  }

  private resize = (): void => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
  };

  private now(): number {
    return (performance.now() - this.t0) / 1000;
  }

  setState(s: CombatState): void {
    const first = !this.state || this.state.scenario.seed !== s.scenario.seed || this.state.scenario.id !== s.scenario.id;
    if (first) {
      this.disp.clear();
      this.lastFx = s.fxId;
      this.camFitted = false;
      this.floaters = [];
      this.shots = [];
    }
    const before = this.state ? this.state.map.rooms.filter((r) => r.revealed).length : 0;
    this.state = s;
    const now = this.now();
    for (const f of s.fx) if (f.id > this.lastFx) this.playFx(f, now);
    this.lastFx = Math.max(this.lastFx, ...s.fx.map((f) => f.id), 0);
    for (const u of s.units) {
      let d = this.disp.get(u.uid);
      if (!d) {
        const [px, py] = hexPx(u.x, u.y);
        d = { px, py, path: [], pathT: 0, flashUntil: 0, swingUntil: 0, dying: u.dead ? 1 : 0, facing: u.facing };
        this.disp.set(u.uid, d);
      }
      if (!d.path.length) [d.px, d.py] = hexPx(u.x, u.y);
    }
    if (!this.camFitted) this.fit();
    else if (s.map.rooms.filter((r) => r.revealed).length > before && before > 0) {
      // a door opened: show the new room
      const r = s.map.rooms.filter((x) => x.revealed).slice(-1)[0];
      if (r) this.centerOn(Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2));
    }
  }

  private unitPx(uid: string | undefined): [number, number] | null {
    if (!uid) return null;
    const d = this.disp.get(uid);
    if (d) return [d.px, d.py];
    const u = this.state?.units.find((x) => x.uid === uid);
    return u ? hexPx(u.x, u.y) : null;
  }

  private playFx(f: Fx, now: number): void {
    const s = this.state!;
    const u = f.uid ? s.units.find((x) => x.uid === f.uid) : undefined;
    const d = f.uid ? this.disp.get(f.uid) : undefined;
    const at = (): [number, number] => this.unitPx(f.uid) ?? hexPx(Math.round(f.x ?? 0), Math.round(f.y ?? 0));
    switch (f.kind) {
      case 'move':
        if (d && f.path && f.path.length > 1) {
          d.path = f.path.map((p) => [p[0], p[1]] as [number, number]);
          d.pathT = now;
          [d.px, d.py] = hexPx(f.path[0]![0], f.path[0]![1]);
        }
        break;
      case 'dmg':
      case 'heal':
      case 'shield':
      case 'cond':
      case 'miss':
      case 'loot':
      case 'text': {
        const [x, y] = at();
        const stack = this.floaters.filter((fl) => Math.abs(fl.x - x) < 20 && Math.abs(fl.y - y) < 60 && now - fl.t0 < 0.5).length;
        this.floaters.push({ x, y: y - stack * 20, text: f.text ?? '', color: f.color ?? '#fff', t0: now + stack * 0.08 });
        if (f.kind === 'dmg' && d) d.flashUntil = now + 0.18;
        break;
      }
      case 'swing':
      case 'shot': {
        if (d) d.swingUntil = now + 0.3;
        const tu = f.to ? s.units.find((x) => x.uid === f.to) : undefined;
        if (u && tu) {
          const [ax, ay] = hexPx(u.x, u.y);
          const [bx, by] = hexPx(tu.x, tu.y);
          if (d) d.facing = Math.atan2(by - ay, bx - ax);
          if (f.kind === 'shot' || Math.hypot(bx - ax, by - ay) > S * 2.2)
            this.shots.push({ fx: ax, fy: ay, tx: bx, ty: by, t0: now, color: f.el ? ELEMENTS[f.el as keyof typeof ELEMENTS]?.glow ?? '#fff' : '#fff' });
        }
        break;
      }
      case 'death':
        if (d) d.dying = now;
        break;
      case 'infuse': {
        const [x, y] = at();
        if (f.el) this.floaters.push({ x, y, text: f.text === 'spent' ? `−${f.el}` : `+${f.el}`, color: ELEMENTS[f.el as keyof typeof ELEMENTS]?.glow ?? '#fff', t0: now });
        break;
      }
    }
  }

  /** Centre the camera on the revealed rooms. */
  fit(): void {
    const s = this.state;
    if (!s) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let y = 0; y < s.map.h; y++)
      for (let x = 0; x < s.map.w; x++) {
        const r = roomAt(s.map, x, y);
        if (r < 0 || !s.map.rooms[r]!.revealed) continue;
        const [px, py] = hexPx(x, y);
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
      }
    if (x0 === Infinity) return;
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;
    const z = Math.min(1.3, Math.max(0.4, Math.min((W - 120) / (x1 - x0 + S * 4), (H - 360) / (y1 - y0 + S * 4))));
    this.cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 130 / z, z };
    this.camFitted = true;
  }

  centerOn(x: number, y: number): void {
    const [px, py] = hexPx(x, y);
    this.cam.x = px;
    this.cam.y = py + 130 / this.cam.z;
  }

  /** Recentre on a hex if it is hidden behind the HUD or off screen. */
  ensureVisible(x: number, y: number): void {
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;
    const [px, py] = hexPx(x, y);
    const sx = W / 2 + (px - this.cam.x) * this.cam.z;
    const sy = H / 2 + (py - this.cam.y) * this.cam.z;
    if (sx < 260 || sx > W - 60 || sy < 90 || sy > H - 340) this.centerOn(x, y);
  }

  private toWorld(cx: number, cy: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const sx = cx - r.left - r.width / 2;
    const sy = cy - r.top - r.height / 2;
    return [this.cam.x + sx / this.cam.z, this.cam.y + sy / this.cam.z];
  }

  private hexAtWorld(wx: number, wy: number): [number, number] {
    return pixelToHex((wx - PAD - (Math.sqrt(3) * S) / 2) / S, (wy - PAD - S) / S);
  }

  private tileAtClient(cx: number, cy: number): [number, number] {
    const [wx, wy] = this.toWorld(cx, cy);
    return this.hexAtWorld(wx, wy);
  }

  private unitAtTile(x: number, y: number): Unit | undefined {
    return this.state?.units.find((u) => !u.dead && u.x === x && u.y === y && !(u.kind === 'hero' && u.exhausted));
  }

  private onDown = (e: PointerEvent): void => {
    this.canvas.focus({ preventScroll: true });
    if (e.button === 1 || e.button === 2) {
      // middle-drag pans; right-drag pans too, but a still right-click pings the hex
      this.pan = { sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y, click: e.button === 2, button: e.button };
      return;
    }
    const [x, y] = this.tileAtClient(e.clientX, e.clientY);
    const u = this.unitAtTile(x, y);
    if (u && this.hl.draggable === u.uid) {
      const [wx, wy] = this.toWorld(e.clientX, e.clientY);
      this.drag = { uid: u.uid, sx: e.clientX, sy: e.clientY, wx, wy, moved: false };
      return;
    }
    // left-drag on empty space pans; a still click is a click
    this.pan = { sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y, click: true, button: 0 };
  };

  private onMove = (e: PointerEvent): void => {
    if (this.drag) {
      const [wx, wy] = this.toWorld(e.clientX, e.clientY);
      this.drag.wx = wx;
      this.drag.wy = wy;
      if (Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 6) this.drag.moved = true;
    } else if (this.pan) {
      const dx = e.clientX - this.pan.sx;
      const dy = e.clientY - this.pan.sy;
      if (Math.hypot(dx, dy) > 6) this.pan.click = false;
      if (!this.pan.click) {
        this.cam.x = this.pan.cx - dx / this.cam.z;
        this.cam.y = this.pan.cy - dy / this.cam.z;
      }
    }
    if (this.overCanvas(e) || this.drag) {
      const [x, y] = this.tileAtClient(e.clientX, e.clientY);
      if (x !== this.hover[0] || y !== this.hover[1]) {
        this.hover = [x, y];
        const u = this.unitAtTile(x, y);
        this.hoverUid = u?.uid ?? null;
        this.handlers.onHover?.(this.hoverUid, x, y);
      }
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      const [x, y] = this.tileAtClient(e.clientX, e.clientY);
      if (d.moved) this.handlers.onDrop?.(d.uid, x, y);
      else this.handlers.onUnit?.(d.uid);
      return;
    }
    if (this.pan) {
      const click = this.pan.click;
      const button = this.pan.button;
      this.pan = null;
      if (click && button === 2 && this.overCanvas(e)) {
        const [x, y] = this.tileAtClient(e.clientX, e.clientY);
        if (x >= 0 && y >= 0 && x < (this.state?.map.w ?? 0) && y < (this.state?.map.h ?? 0)) this.handlers.onPing?.(x, y);
        return;
      }
      if (click && this.overCanvas(e)) {
        const [x, y] = this.tileAtClient(e.clientX, e.clientY);
        const u = this.unitAtTile(x, y);
        if (u) this.handlers.onUnit?.(u.uid);
        this.handlers.onTile?.(x, y);
      }
    }
  };

  private overCanvas(e: PointerEvent): boolean {
    return document.elementFromPoint(e.clientX, e.clientY) === this.canvas;
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    const z = Math.max(0.3, Math.min(2.2, this.cam.z * factor));
    this.cam.x = wx - (wx - this.cam.x) * (this.cam.z / z);
    this.cam.y = wy - (wy - this.cam.y) * (this.cam.z / z);
    this.cam.z = z;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  private onKey = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
    if (k === '+' || k === '=') this.zoomStep(1.15);
    else if (k === '-' || k === '_') this.zoomStep(1 / 1.15);
    else if (k === 'f') this.fit();
    else this.keys.add(k);
  };

  private zoomStep(f: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  // ------------------------------------------------------------------ drawing

  private frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const s = this.state;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07060b';
    ctx.fillRect(0, 0, W, H);
    const t = performance.now();
    const dt = Math.min(0.05, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    if (!s) return;
    const now = this.now();
    // keyboard panning: screen pixels per second, independent of zoom
    const sp = (720 * dt) / this.cam.z;
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.cam.x -= sp;
    if (this.keys.has('d') || this.keys.has('arrowright')) this.cam.x += sp;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.cam.y -= sp;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.cam.y += sp;
    ctx.setTransform(this.dpr * this.cam.z, 0, 0, this.dpr * this.cam.z, W / 2 - this.cam.x * this.cam.z * this.dpr, H / 2 - this.cam.y * this.cam.z * this.dpr);
    this.drawWater(ctx, s, now);
    this.ensureStatic(s);
    if (this.staticCanvas) ctx.drawImage(this.staticCanvas, 0, 0);
    this.drawHazards(ctx, s, now);
    this.drawHighlights(ctx, s, now);
    this.drawPickups(ctx, s, now);
    this.drawUnits(ctx, s, now);
    this.drawShots(ctx, now);
    this.drawFloaters(ctx, now);
    this.drawDrag(ctx, s, now);
    this.drawPings(ctx, now);
  };

  private mapSize(s: CombatState): [number, number] {
    return [PAD * 2 + (s.map.w + 1) * Math.sqrt(3) * S, PAD * 2 + (s.map.h * 1.5 + 1) * S];
  }

  /** The Shoal itself: warm glowing shallows behind everything. */
  private drawWater(ctx: CanvasRenderingContext2D, s: CombatState, now: number): void {
    const [w, h] = this.mapSize(s);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0d1418');
    g.addColorStop(1, '#0a0f14');
    ctx.fillStyle = g;
    ctx.fillRect(-600, -600, w + 1200, h + 1200);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#9dffcf';
    ctx.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      const y = ((i * 97) % (h + 800)) - 400 + Math.sin(now * 0.4 + i) * 10;
      const x = ((i * 233) % (w + 1000)) - 500 + Math.sin(now * 0.3 + i * 2) * 30;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 40, y - 8, x + 80, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private ensureStatic(s: CombatState): void {
    const k = s.map.tiles.join('') + s.map.rooms.map((r) => (r.revealed ? 1 : 0)).join('');
    if (k === this.staticKey && this.staticCanvas) return;
    this.staticKey = k;
    const c = this.staticCanvas ?? document.createElement('canvas');
    const [w, h] = this.mapSize(s);
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    this.paintStatic(g, s);
    this.staticCanvas = c;
  }

  /** A hex is shown once its room is open; walls and doors show when they touch an open room. */
  private visible(s: CombatState, x: number, y: number): boolean {
    const r = roomAt(s.map, x, y);
    if (r >= 0) return s.map.rooms[r]!.revealed;
    for (const [nx, ny] of neighbors(x, y)) {
      const rr = roomAt(s.map, nx, ny);
      if (rr >= 0 && s.map.rooms[rr]!.revealed) return true;
    }
    return false;
  }

  private lookAt(s: CombatState, x: number, y: number): ZoneLook {
    let r = roomAt(s.map, x, y);
    if (r < 0)
      for (const [nx, ny] of neighbors(x, y)) {
        const rr = roomAt(s.map, nx, ny);
        if (rr >= 0 && s.map.rooms[rr]!.revealed) {
          r = rr;
          break;
        }
      }
    return zoneLook(r >= 0 ? s.map.rooms[r]!.zone : s.map.zone === 9 ? 8 : s.map.zone);
  }

  private paintStatic(g: CanvasRenderingContext2D, s: CombatState): void {
    const m = s.map;
    const rng = rngFrom(s.scenario.seed * 31 + 7);
    // floors (and floor under doors, props, traps)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const c = tile(m, x, y);
        if (c === ' ' || c === '#' || !this.visible(s, x, y)) continue;
        this.paintFloor(g, s, this.lookAt(s, x, y), x, y, rng);
      }
    // walls: raised hex blocks, drawn top row first so lower rows overlap
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (tile(m, x, y) !== '#' || !this.visible(s, x, y)) continue;
        const z = this.lookAt(s, x, y);
        const [cx, cy] = hexPx(x, y);
        const lift = S * 0.45;
        hexPath(g, cx, cy, S + 0.5);
        g.fillStyle = shade(z.wall, 0.75);
        g.fill();
        hexPath(g, cx, cy - lift, S + 0.5);
        g.fillStyle = z.wallTop;
        g.fill();
        g.strokeStyle = withAlpha('#000000', 0.35);
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(cx - S * 0.6, cy - lift - S * 0.15);
        g.lineTo(cx + S * 0.6, cy - lift - S * 0.15);
        g.moveTo(cx - S * 0.5, cy - lift + S * 0.25);
        g.lineTo(cx + S * 0.5, cy - lift + S * 0.25);
        g.moveTo(cx, cy - lift - S * 0.15);
        g.lineTo(cx, cy - lift + S * 0.25);
        g.stroke();
        hexPath(g, cx, cy - lift, S);
        g.strokeStyle = OUTLINE;
        g.lineWidth = 2;
        g.stroke();
      }
    // props, doors, exits, traps (on top of walls behind them)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const c = tile(m, x, y);
        if (!this.visible(s, x, y)) continue;
        const z = this.lookAt(s, x, y);
        const [cx, cy] = hexPx(x, y);
        if (c === 'o') {
          g.save();
          g.translate(cx - 32, cy - 26);
          g.scale(2, 2);
          const prng = rngFrom(x * 7919 + y * 104729 + s.scenario.seed);
          drawRoomProp(g, 0, 0, z.props, prng, { light: (lx, ly, r, col, a) => glow(g, lx, ly, r, col, a), flame: () => undefined });
          g.restore();
        } else if (c === 'D' || c === 'd') this.paintDoor(g, s, x, y, c === 'D');
        else if (c === 'X') drawStairs(g, cx, cy, 0, false);
        else if (c === 'T') this.paintTrap(g, cx, cy);
      }
  }

  private paintFloor(g: CanvasRenderingContext2D, s: CombatState, z: ZoneLook, x: number, y: number, rng: ReturnType<typeof rngFrom>): void {
    const [cx, cy] = hexPx(x, y);
    hexPath(g, cx, cy, S + 0.5);
    g.fillStyle = (x + y * 2) % 3 === 0 ? z.floor2 : z.floor;
    g.fill();
    g.save();
    hexPath(g, cx, cy, S);
    g.clip();
    const v = rng.next();
    switch (z.style) {
      case 'crypt':
      case 'reliquary': {
        g.strokeStyle = withAlpha('#000', 0.3);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx - S, cy + (v - 0.5) * 10);
        g.lineTo(cx + S, cy - (v - 0.5) * 10);
        g.stroke();
        if (z.style === 'crypt' && rng.chance(0.3)) {
          g.fillStyle = withAlpha('#5a7a3a', 0.45);
          g.beginPath();
          g.ellipse(cx + rng.range(-16, 16), cy + rng.range(-14, 14), rng.range(6, 14), rng.range(4, 9), rng.range(0, 3), 0, Math.PI * 2);
          g.fill();
        }
        if (z.style === 'reliquary' && rng.chance(0.45)) {
          g.strokeStyle = withAlpha('#ffffff', 0.13);
          g.beginPath();
          g.moveTo(cx + rng.range(-S, S), cy - S);
          g.quadraticCurveTo(cx + rng.range(-S, S), cy, cx + rng.range(-S, S), cy + S);
          g.stroke();
        }
        break;
      }
      case 'caverns': {
        g.fillStyle = withAlpha('#000', 0.18);
        g.beginPath();
        g.ellipse(cx, cy, S * 0.7, S * 0.6, v * 3, 0, Math.PI * 2);
        g.fill();
        if (rng.chance(0.3)) {
          const gx = cx + rng.range(-18, 18);
          const gy = cy + rng.range(-16, 16);
          glow(g, gx, gy, 10, z.accent, 0.5);
          g.fillStyle = z.accent;
          g.beginPath();
          g.arc(gx, gy, 2, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'sewers': {
        g.strokeStyle = withAlpha('#000', 0.3);
        g.lineWidth = 2;
        for (let by = -S; by < S; by += 14) {
          g.beginPath();
          g.moveTo(cx - S, cy + by);
          g.lineTo(cx + S, cy + by);
          g.stroke();
          for (let bx = -S + ((by / 14) % 2 ? 0 : 14); bx < S; bx += 28) {
            g.beginPath();
            g.moveTo(cx + bx, cy + by);
            g.lineTo(cx + bx, cy + by + 14);
            g.stroke();
          }
        }
        if (rng.chance(0.2)) {
          g.fillStyle = withAlpha('#4a5a2a', 0.5);
          g.beginPath();
          g.ellipse(cx, cy + 8, 16, 6, 0, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'forest': {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = withAlpha(rng.chance(0.5) ? '#c8621f' : '#e6b84a', 0.35);
          g.beginPath();
          g.ellipse(cx + rng.range(-22, 22), cy + rng.range(-20, 20), 5, 2.5, rng.range(0, 3), 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'forge': {
        g.fillStyle = '#5a3a2a';
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          g.beginPath();
          g.arc(cx + Math.cos(a) * S * 0.62, cy + Math.sin(a) * S * 0.62, 2.2, 0, Math.PI * 2);
          g.fill();
        }
        if (rng.chance(0.15)) glow(g, cx, cy, 24, '#ff4a10', 0.25);
        break;
      }
      case 'citadel': {
        hexPath(g, cx, cy, S * 0.72);
        g.strokeStyle = withAlpha('#b08d3c', 0.35);
        g.lineWidth = 2;
        g.stroke();
        break;
      }
      case 'abyss': {
        for (let i = 0; i < 3; i++) {
          if (!rng.chance(0.5)) continue;
          g.fillStyle = withAlpha('#ffffff', rng.range(0.2, 0.6));
          g.fillRect(cx + rng.range(-24, 24), cy + rng.range(-24, 24), 1.5, 1.5);
        }
        break;
      }
    }
    // difficult ground: rubble
    if (tile(s.map, x, y) === ',') {
      g.fillStyle = withAlpha('#000', 0.25);
      g.fillRect(cx - S, cy - S, S * 2, S * 2);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = withAlpha(shade(z.wallTop, 1.2), 0.85);
        g.beginPath();
        g.ellipse(cx + rng.range(-20, 20), cy + rng.range(-20, 20), rng.range(3, 7), rng.range(2, 5), rng.range(0, 3), 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = OUTLINE;
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
    g.restore();
    // the hex outline so spaces read clearly
    hexPath(g, cx, cy, S - 1);
    g.strokeStyle = withAlpha('#ffffff', 0.07);
    g.lineWidth = 1.2;
    g.stroke();
  }

  private paintDoor(g: CanvasRenderingContext2D, s: CombatState, x: number, y: number, closed: boolean): void {
    const [cx, cy] = hexPx(x, y);
    const z = this.lookAt(s, x, y);
    hexPath(g, cx, cy, S + 0.5);
    g.fillStyle = z.floor;
    g.fill();
    if (!closed) {
      hexPath(g, cx, cy, S * 0.95);
      g.strokeStyle = shade(z.wallTop, 0.8);
      g.lineWidth = 6;
      g.stroke();
      return;
    }
    // a heavy wooden door standing in the gap
    g.save();
    hexPath(g, cx, cy - 4, S * 0.9);
    g.clip();
    g.fillStyle = '#6a4424';
    g.fillRect(cx - S, cy - S, S * 2, S * 2);
    g.strokeStyle = '#3a2410';
    g.lineWidth = 3;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(cx + i * 12, cy - S);
      g.lineTo(cx + i * 12, cy + S);
      g.stroke();
    }
    g.fillStyle = '#7c838e';
    g.fillRect(cx - S, cy - 16, S * 2, 6);
    g.fillRect(cx - S, cy + 8, S * 2, 6);
    g.restore();
    g.fillStyle = '#d4af37';
    g.beginPath();
    g.arc(cx + 12, cy - 2, 4, 0, Math.PI * 2);
    g.fill();
    hexPath(g, cx, cy - 4, S * 0.9);
    g.strokeStyle = OUTLINE;
    g.lineWidth = 3;
    g.stroke();
    glow(g, cx, cy, 30, '#ffe98a', 0.15);
  }

  private paintTrap(g: CanvasRenderingContext2D, px: number, py: number): void {
    g.fillStyle = '#3a3440';
    g.strokeStyle = OUTLINE;
    g.lineWidth = 2;
    hexPath(g, px, py, S * 0.6);
    g.fill();
    g.stroke();
    g.fillStyle = '#c9ced6';
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI / 3) * i;
      const sx = i === 6 ? px : px + Math.cos(a) * 12;
      const sy = i === 6 ? py : py + Math.sin(a) * 12;
      g.beginPath();
      g.moveTo(sx - 4, sy + 4);
      g.lineTo(sx, sy - 5);
      g.lineTo(sx + 4, sy + 4);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D, s: CombatState, now: number): void {
    const m = s.map;
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (tile(m, x, y) !== '~' || !this.visible(s, x, y)) continue;
        const z = this.lookAt(s, x, y);
        const [cx, cy] = hexPx(x, y);
        const ph = Math.sin(now * 2 + x * 1.3 + y * 0.7);
        ctx.save();
        hexPath(ctx, cx, cy, S - 2);
        switch (z.hazardKind) {
          case 'water':
            ctx.fillStyle = withAlpha(z.style === 'sewers' ? '#2a3a1a' : '#1f4a4a', 0.85);
            ctx.fill();
            ctx.strokeStyle = withAlpha('#9dffcf', 0.25 + ph * 0.1);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 14 + ph * 4, 6 + ph * 2, 0, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'poisonCloud':
            ctx.fillStyle = withAlpha('#2a3a1a', 0.5);
            ctx.fill();
            for (let i = 0; i < 3; i++) glow(ctx, cx - 14 + i * 14, cy + Math.sin(now + i) * 8, 22, '#7aff4a', 0.28);
            break;
          case 'thorns':
            ctx.fillStyle = withAlpha('#2a1a08', 0.6);
            ctx.fill();
            ctx.strokeStyle = '#5a3a1a';
            ctx.lineWidth = 3;
            for (let i = 0; i < 5; i++) {
              ctx.beginPath();
              ctx.moveTo(cx - 22 + i * 11, cy + 22);
              ctx.quadraticCurveTo(cx - 16 + i * 11, cy, cx - 26 + i * 11, cy - 20);
              ctx.stroke();
            }
            ctx.fillStyle = '#c9b98a';
            for (let i = 0; i < 6; i++) ctx.fillRect(cx - 20 + ((i * 9) % 40), cy - 18 + ((i * 17) % 36), 3, 3);
            break;
          case 'lava':
            ctx.fillStyle = '#7a1608';
            ctx.fill();
            glow(ctx, cx, cy, 34, '#ff7a1a', 0.55 + ph * 0.15);
            ctx.fillStyle = withAlpha('#ffd27a', 0.6);
            ctx.beginPath();
            ctx.arc(cx - 10 + ph * 6, cy - 6, 4, 0, Math.PI * 2);
            ctx.arc(cx + 12, cy + 8 - ph * 5, 3, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'ice':
            ctx.fillStyle = withAlpha('#a8d8f0', 0.55);
            ctx.fill();
            ctx.strokeStyle = withAlpha('#ffffff', 0.5);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - 20, cy + 14);
            ctx.lineTo(cx, cy - 12);
            ctx.lineTo(cx + 18, cy + 4);
            ctx.stroke();
            break;
          case 'oil':
            ctx.fillStyle = withAlpha('#2a1a3a', 0.85);
            ctx.fill();
            glow(ctx, cx, cy, 26, '#b08de8', 0.25 + ph * 0.1);
            break;
          case 'void':
            ctx.fillStyle = '#000';
            ctx.fill();
            glow(ctx, cx, cy, 30, '#7a2bd6', 0.35 + ph * 0.15);
            break;
        }
        ctx.restore();
      }
  }

  private drawHighlights(ctx: CanvasRenderingContext2D, s: CombatState, now: number): void {
    const pulse = 0.55 + Math.sin(now * 5) * 0.2;
    const hk = key(this.hover[0], this.hover[1]);
    const fill = (k: number, col: string, a: number): void => {
      const [x, y] = unkey(k);
      const [cx, cy] = hexPx(x, y);
      hexPath(ctx, cx, cy, S - 3);
      ctx.fillStyle = withAlpha(col, a);
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, Math.min(1, a + 0.35));
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    if (this.hl.move) for (const k of this.hl.move) fill(k, '#4aa3ff', 0.18 + (k === hk ? 0.25 : 0));
    if (this.hl.teleport) for (const k of this.hl.teleport) fill(k, '#b06bff', 0.18 + (k === hk ? 0.25 : 0));
    if (this.hl.push) for (const k of this.hl.push) fill(k, '#ff9b2e', 0.24 + (k === hk ? 0.3 : 0) + Math.sin(now * 6) * 0.06);
    if (this.hl.aim) for (const k of this.hl.aim) fill(k, '#ff6a5a', 0.1);
    if (this.hl.aoe && this.hl.aim?.has(hk)) for (const [x, y] of this.hl.aoe(this.hover[0], this.hover[1])) fill(key(x, y), '#ff3b3b', 0.35);
    // the hovered hex
    if (this.visible(s, this.hover[0], this.hover[1]) && tile(s.map, this.hover[0], this.hover[1]) !== '#') {
      const [cx, cy] = hexPx(this.hover[0], this.hover[1]);
      hexPath(ctx, cx, cy, S - 2);
      ctx.strokeStyle = withAlpha('#ffffff', 0.25);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const ring = (uids: Set<string> | undefined, col: string): void => {
      if (!uids) return;
      for (const u of s.units) {
        if (!uids.has(u.uid)) continue;
        const [x, y] = this.unitPx(u.uid) ?? hexPx(u.x, u.y);
        ctx.strokeStyle = withAlpha(col, pulse + (this.hoverUid === u.uid ? 0.3 : 0));
        ctx.lineWidth = this.hoverUid === u.uid ? 5 : 3;
        ctx.beginPath();
        ctx.ellipse(x, y + 14, 27, 13, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    ring(this.hl.enemies, '#ff4a3a');
    ring(this.hl.allies, '#58d66a');
  }

  private drawPickups(ctx: CanvasRenderingContext2D, s: CombatState, now: number): void {
    for (const p of s.pickups) {
      if (p.opened || !this.visible(s, p.x, p.y)) continue;
      const [x, y] = hexPx(p.x, p.y);
      if (p.kind === 'coin') {
        glow(ctx, x, y, 18, '#ffd24a', 0.4 + Math.sin(now * 3 + p.x) * 0.1);
        ctx.fillStyle = '#d4af37';
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(x - 6 + i * 6, y + 6 - i * 4, 8, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else drawChest(ctx, x, y + 6, 0, true, 0, false, !!p.item);
    }
  }

  /** Where a unit is drawn (world pixels), walking along its last move. */
  private dispPos(u: Unit, now: number): [number, number, number] {
    const d = this.disp.get(u.uid);
    if (!d) return [...hexPx(u.x, u.y), 0];
    if (d.path.length > 1) {
      const per = 0.12;
      const k = (now - d.pathT) / per;
      const i = Math.floor(k);
      if (i >= d.path.length - 1) {
        d.path = [];
        [d.px, d.py] = hexPx(u.x, u.y);
        return [d.px, d.py, 0];
      }
      const [ax, ay] = hexPx(d.path[i]![0], d.path[i]![1]);
      const [bx, by] = hexPx(d.path[i + 1]![0], d.path[i + 1]![1]);
      const f = Math.max(0, k - i);
      d.px = ax + (bx - ax) * f;
      d.py = ay + (by - ay) * f;
      d.facing = Math.atan2(by - ay, bx - ax);
      return [d.px, d.py, 1];
    }
    return [d.px, d.py, 0];
  }

  private drawUnits(ctx: CanvasRenderingContext2D, s: CombatState, now: number): void {
    const list = s.units
      .filter((u) => {
        const d = this.disp.get(u.uid);
        if (u.kind === 'hero' && u.escaped) return false;
        if (u.dead || (u.kind === 'hero' && u.exhausted)) return !!d && d.dying > 0 && now - d.dying < 0.7;
        return this.visible(s, u.x, u.y);
      })
      .map((u) => ({ u, p: this.dispPos(u, now) }))
      .sort((a, b) => a.p[1] - b.p[1]);
    for (const { u, p } of list) {
      if (this.drag?.uid === u.uid) continue;
      this.drawUnit(ctx, u, p[0], p[1], p[2], now, 1);
    }
  }

  private drawUnit(ctx: CanvasRenderingContext2D, u: Unit, px: number, py: number, moving: number, now: number, alphaMul: number): void {
    const d = this.disp.get(u.uid);
    const x = px;
    const y = py + 4;
    const dying = d && d.dying > 0 && (u.dead || (u.kind === 'hero' && u.exhausted)) ? Math.min(1, (now - d.dying) / 0.6) : 0;
    const alpha = (1 - dying) * alphaMul * (u.conds.includes('invisible') ? 0.45 : 1);
    const flash = !!d && d.flashUntil > now;
    const facing = d?.facing ?? u.facing;
    const swing = d && d.swingUntil > now ? 1 - (d.swingUntil - now) / 0.3 : 0;
    const active = this.focusUid && (this.focusUid === u.uid || (u.kind === 'monster' && this.focusUid === u.monster));
    if (active) glow(ctx, x, y + 8, 42, '#ffe98a', 0.35 + Math.sin(now * 6) * 0.1);
    ctx.save();
    ctx.globalAlpha = alpha;
    const ringCol = u.kind === 'hero' ? '#4aa3ff' : u.kind === 'summon' ? '#58d66a' : u.kind === 'monster' && u.elite ? '#ffd24a' : '#ff6a5a';
    ctx.strokeStyle = withAlpha(ringCol, 0.8);
    ctx.lineWidth = u.kind === 'monster' && u.elite ? 4 : 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 23, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    if (u.kind === 'hero') {
      drawHero(ctx, u.cls, { x, y: y - 4, facing, t: now, moving, scale: 1.2, flash, swing });
    } else {
      const def = u.kind === 'monster' ? monsterDef(u.monster) : null;
      const sdef = u.kind === 'summon' ? SUMMONS[u.summon] : null;
      const draw = def?.draw ?? sdef?.draw ?? 'gary';
      const r = def?.radius ?? sdef?.radius ?? 18;
      const target = def?.boss ? 40 : def?.role === 'swarm' ? 15 : u.kind === 'summon' ? 19 : 22;
      const scale = Math.max(0.45, Math.min(1.7, target / r));
      const z = zoneLook(def?.zone ?? 1);
      const st: DrawState = {
        x,
        y: y - (def?.boss ? 12 : 2),
        facing,
        t: now + (u.x * 0.37 + u.y * 0.91),
        r,
        flash,
        tint: null,
        alpha: 1,
        scale,
        squash: swing ? Math.sin(swing * Math.PI) * 0.6 : 0,
        pose: swing ? 'attack' : 'idle',
        poseT: swing,
        hpFrac: u.hp / Math.max(1, u.maxHp),
        moving,
        pal: z.colors,
        phase: def?.boss && u.hp < u.maxHp / 2 ? 1 : 0,
        variant: u.kind === 'monster' ? u.num : 0,
        awake: true,
        elem: def?.elem ?? 'physical',
        atk: swing ? def?.elem ?? 'physical' : null,
      };
      drawById(ctx, draw, st);
      if (u.kind === 'monster' && u.elite) glow(ctx, x, y - 10, 30, '#ffd24a', 0.18);
    }
    ctx.restore();
    if (dying) return;
    this.drawBadges(ctx, u, x, y, now);
  }

  private drawBadges(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, now: number): void {
    const w = 42;
    const bx = x - w / 2;
    const by = y + 18;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(bx - 1, by - 1, w + 2, 8);
    const f = Math.max(0, u.hp / Math.max(1, u.maxHp));
    ctx.fillStyle = u.kind === 'monster' ? (u.elite ? '#e6b84a' : '#d8443a') : u.kind === 'summon' ? '#58d66a' : '#4aa3ff';
    ctx.fillRect(bx, by, w * f, 6);
    ctx.font = 'bold 11px Segoe UI, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    const hpTxt = `${u.hp}/${u.maxHp}`;
    ctx.strokeText(hpTxt, x, by + 18);
    ctx.fillStyle = '#efe6d2';
    ctx.fillText(hpTxt, x, by + 18);
    if (u.kind === 'monster' && !monsterDef(u.monster).boss) {
      ctx.fillStyle = u.elite ? '#e6b84a' : '#efe6d2';
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.arc(x + 24, y - 30, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#14121a';
      ctx.fillText(String(u.num), x + 24, y - 26);
    }
    const sh = u.shield + (u.kind !== 'hero' ? u.stat.shield ?? 0 : 0) + (u.kind === 'hero' ? u.active.filter((a) => a.persist.kind === 'shield').reduce((n, a) => n + a.persist.n, 0) : 0);
    if (sh > 0) {
      ctx.fillStyle = '#9ad0ff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 30, y - 34);
      ctx.lineTo(x - 20, y - 30);
      ctx.lineTo(x - 21, y - 20);
      ctx.lineTo(x - 30, y - 14);
      ctx.lineTo(x - 39, y - 20);
      ctx.lineTo(x - 40, y - 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#14121a';
      ctx.fillText(String(sh), x - 30, y - 20);
    }
    const COL: Record<string, string> = { poison: '#7aff4a', wound: '#ff4a4a', immobilize: '#8fd3ff', disarm: '#c0c0c0', stun: '#ffe98a', muddle: '#b06bff', strengthen: '#ff9b2e', invisible: '#9a93ab', regenerate: '#58d66a' };
    u.conds.forEach((c, i) => {
      const cx = x - 20 + i * 13;
      const cy = y - 46 + Math.sin(now * 3 + i) * 1.5;
      ctx.fillStyle = COL[c] ?? '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 8px Segoe UI, system-ui, sans-serif';
      ctx.fillText(c[0]!.toUpperCase(), cx, cy + 3);
      ctx.font = 'bold 11px Segoe UI, system-ui, sans-serif';
    });
    // long resting: a blue "RESTING" tag and drifting Zzz over the hero, so nobody misses it
    if (u.kind === 'hero' && u.longRest && !u.exhausted) {
      const ty = y - 66;
      ctx.font = 'bold 13px Segoe UI, system-ui, sans-serif';
      const w = ctx.measureText('RESTING').width + 20;
      ctx.fillStyle = 'rgba(28, 40, 86, 0.92)';
      ctx.strokeStyle = '#8fb4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, ty - 11, w, 21, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dfe8ff';
      ctx.fillText('RESTING', x, ty + 4);
      for (let i = 0; i < 3; i++) {
        const k = (now * 0.6 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI);
        ctx.fillStyle = '#b8ccff';
        ctx.font = `bold ${10 + i * 3}px Segoe UI, system-ui, sans-serif`;
        ctx.fillText('z', x + 14 + k * 14 + i * 4, ty - 12 - k * 18);
      }
      ctx.globalAlpha = 1;
      ctx.font = 'bold 11px Segoe UI, system-ui, sans-serif';
    }
  }

  private drawShots(ctx: CanvasRenderingContext2D, now: number): void {
    this.shots = this.shots.filter((sh) => now - sh.t0 < 0.35);
    for (const sh of this.shots) {
      const k = (now - sh.t0) / 0.3;
      if (k < 0 || k > 1) continue;
      const x = sh.fx + (sh.tx - sh.fx) * k;
      const y = sh.fy + (sh.ty - sh.fy) * k - 10;
      glow(ctx, x, y, 16, sh.color, 0.9);
      ctx.fillStyle = sh.color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFloaters(ctx: CanvasRenderingContext2D, now: number): void {
    this.floaters = this.floaters.filter((f) => now - f.t0 < 1.4);
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const k = (now - f.t0) / 1.4;
      if (k < 0) continue;
      const x = f.x;
      const y = f.y - 40 - k * 40;
      ctx.globalAlpha = Math.min(1, (1 - k) * 2);
      ctx.font = `bold ${f.text.length > 8 ? 15 : 22}px Segoe UI, system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
      ctx.globalAlpha = 1;
    }
  }

  private drawPings(ctx: CanvasRenderingContext2D, now: number): void {
    this.pings = this.pings.filter((p) => now - p.t0 < PING_SECONDS);
    if (!this.pings.length) return;
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;
    for (const p of this.pings) {
      const age = now - p.t0;
      const fade = Math.min(1, (PING_SECONDS - age) / 0.6);
      const [cx, cy] = hexPx(p.x, p.y);
      ctx.save();
      ctx.globalAlpha = fade;
      // the hex itself, outlined
      hexPath(ctx, cx, cy, S - 2);
      ctx.fillStyle = withAlpha(p.color, 0.18);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4;
      ctx.stroke();
      // three expanding rings
      for (let i = 0; i < 3; i++) {
        const k = ((age * 1.3 + i / 3) % 1);
        ctx.globalAlpha = fade * (1 - k);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, S * (0.6 + k * 1.6), S * (0.6 + k * 1.6) * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // a bobbing pin with the name
      ctx.globalAlpha = fade;
      const bob = Math.sin(age * 6) * 4;
      const py = cy - S * 1.3 + bob;
      glow(ctx, cx, py, 22, p.color, 0.6);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - S * 0.55 + bob);
      ctx.lineTo(cx - 9, py + 4);
      ctx.arc(cx, py, 10, Math.PI * 0.85, Math.PI * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 13px Segoe UI, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.strokeText(p.label, cx, py - 16);
      ctx.fillStyle = p.color;
      ctx.fillText(p.label, cx, py - 16);
      ctx.restore();
      // off screen: an arrow at the edge of the view pointing at it
      const sx = W / 2 + (cx - this.cam.x) * this.cam.z;
      const sy = H / 2 + (cy - this.cam.y) * this.cam.z;
      const m = 34;
      if (sx < m || sy < m || sx > W - m || sy > H - m) {
        const ex = Math.max(m, Math.min(W - m, sx));
        const ey = Math.max(m, Math.min(H - m, sy));
        const a = Math.atan2(sy - H / 2, sx - W / 2);
        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.globalAlpha = fade * (0.7 + Math.sin(age * 8) * 0.3);
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -11);
        ctx.lineTo(-10, 11);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawDrag(ctx: CanvasRenderingContext2D, s: CombatState, now: number): void {
    if (!this.drag) return;
    const u = s.units.find((x) => x.uid === this.drag!.uid);
    if (!u) return;
    // the hero stays as a ghost on its hex and follows the cursor
    const [gx, gy] = hexPx(u.x, u.y);
    this.drawUnit(ctx, u, gx, gy, 0, now, 0.35);
    const hk = key(this.hover[0], this.hover[1]);
    const ok = this.hl.move?.has(hk) || this.hl.teleport?.has(hk);
    const [hx, hy] = hexPx(this.hover[0], this.hover[1]);
    hexPath(ctx, hx, hy, S - 3);
    ctx.strokeStyle = ok ? '#4aa3ff' : '#ff6a5a';
    ctx.lineWidth = 4;
    ctx.stroke();
    this.drawUnit(ctx, u, this.drag.wx, this.drag.wy - 6, 1, now, 0.9);
  }
}
