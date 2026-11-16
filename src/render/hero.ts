// Draw a class's hero exactly as Dungeon Joe draws Joe: the class look, its weapon in hand, its shield or casting tool.
import { CLASSES } from '../data/classes';
import { drawJoe, type HandPose } from '../draw/players';
import { drawShield, drawTool, drawWeapon, isPairedWeapon } from '../draw/weapons';

export interface HeroPose {
  x: number;
  y: number;
  facing: number;
  t: number;
  moving?: number;
  scale?: number;
  flash?: boolean;
  ghost?: boolean;
  alpha?: number;
  /** 0..1 swing animation */
  swing?: number;
}

export function drawHero(ctx: CanvasRenderingContext2D, cls: string, p: HeroPose): void {
  const def = CLASSES[cls] ?? CLASSES['nobody']!;
  const f = p.facing;
  const two = !!def.twoHanded;
  const paired = isPairedWeapon(def.weapon);
  const sw = p.swing ?? 0;
  const rot = (two && !paired ? 1.0 : 0.7 + Math.sin(p.t * 2) * 0.03) - Math.sin(sw * Math.PI) * 1.6;
  const ha = f + 0.9 + (rot - 0.7) * 0.55;
  const main: HandPose = { x: Math.cos(ha) * 10, y: Math.sin(ha) * 10 + 2, a: f + rot, draw: (g) => drawWeapon(g, def.weapon, p.t) };
  let off: HandPose | undefined;
  if (paired && two) off = { x: Math.cos(f - 0.9) * 10, y: Math.sin(f - 0.9) * 10 + 2, a: f - rot * 0.8, draw: (g) => drawWeapon(g, def.weapon, p.t) };
  else if (def.off?.kind === 'shield') off = { x: Math.cos(f - 1.1) * 13, y: Math.sin(f - 1.1) * 13 + 2, a: Math.cos(f) * 0.18, hold: 'shield', draw: (g) => drawShield(g, def.off!.draw) };
  else if (def.off?.kind === 'tool') off = { x: Math.cos(f - 1.1) * 13, y: Math.sin(f - 1.1) * 13 + 2, a: f - 0.4, draw: (g) => drawTool(g, def.off!.draw, p.t) };
  drawJoe(ctx, def.look, {
    x: p.x,
    y: p.y,
    facing: f,
    t: p.t,
    moving: p.moving ?? 0,
    scale: p.scale ?? 1,
    twoHanded: two && !paired,
    main,
    ...(off ? { off } : {}),
    ...(p.flash ? { flash: true } : {}),
    ...(p.ghost ? { ghost: true } : {}),
    ...(p.alpha !== undefined ? { alpha: p.alpha } : {}),
  });
}

/** A small canvas portrait of a class, for menus. */
export function heroPortrait(cls: string, size = 96, t = 0): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = size * dpr;
  c.height = size * dpr;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  drawHero(g, cls, { x: size / 2, y: size * 0.6, facing: Math.PI / 2 - 0.35, t, scale: size / 48 });
  return c;
}
