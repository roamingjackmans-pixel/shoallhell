// The Executor: Shoallhell's final boss, drawn with Dungeon Joe's own person rig — a tall grey man in a black suit
// and bowler, void-lit eyes, a will in one hand and a fountain pen in the other.
import { glow } from '../draw/parts';
import { drawJoe, type JoeLook } from '../draw/players';
import { registerDraw, type DrawState } from '../draw/registry';

const LOOK: JoeLook = {
  skin: '#b8b4c4',
  hair: '#1a1620',
  head: 'bowler',
  headColor: '#0e0c12',
  body: 'suit',
  bodyColor: '#18161e',
  trim: '#7a2bd6',
  legsColor: '#121016',
  hairStyle: 'slick',
  eyeGlow: '#b07aff',
  brows: 'angry',
  over: 'vest',
  overColor: '#2a0d3f',
  extra: 'tie',
  legs: 'slacks',
  bootColor: '#050408',
  glow: '#7a2bd6',
};

function drawWill(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#efe6d2';
  g.strokeStyle = '#120e14';
  g.lineWidth = 1.5;
  g.beginPath();
  g.rect(-2, -7, 16, 14);
  g.fill();
  g.stroke();
  g.fillStyle = '#8a1020';
  g.beginPath();
  g.arc(10, 4, 2.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#6a6070';
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(1, -4 + i * 3);
    g.lineTo(11, -4 + i * 3);
    g.stroke();
  }
}

function drawPen(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#0e0c12';
  g.strokeStyle = '#120e14';
  g.lineWidth = 1.2;
  g.beginPath();
  g.rect(0, -1.5, 16, 3);
  g.fill();
  g.stroke();
  g.fillStyle = '#d4af37';
  g.beginPath();
  g.moveTo(16, -1.5);
  g.lineTo(21, 0);
  g.lineTo(16, 1.5);
  g.closePath();
  g.fill();
}

export function registerExecutor(): void {
  registerDraw('boss_executor', (ctx: CanvasRenderingContext2D, s: DrawState) => {
    const k = s.scale * 1.9;
    glow(ctx, s.x, s.y + 6, 60 * s.scale, '#7a2bd6', 0.35 + Math.sin(s.t * 2) * 0.1);
    // floating pages of the will
    for (let i = 0; i < 5; i++) {
      const a = s.t * 0.7 + (i * Math.PI * 2) / 5;
      const px = s.x + Math.cos(a) * 34 * s.scale;
      const py = s.y - 10 + Math.sin(a) * 14 * s.scale;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.globalAlpha *= 0.85;
      ctx.fillStyle = '#efe6d2';
      ctx.strokeStyle = '#120e14';
      ctx.lineWidth = 1;
      ctx.fillRect(-4, -5, 8, 10);
      ctx.strokeRect(-4, -5, 8, 10);
      ctx.restore();
    }
    const f = s.facing;
    drawJoe(ctx, LOOK, {
      x: s.x,
      y: s.y,
      facing: f,
      t: s.t,
      moving: s.moving,
      scale: k,
      flash: s.flash,
      main: { x: Math.cos(f + 0.9) * 10, y: Math.sin(f + 0.9) * 10 + 2, a: f + 0.4 - s.squash, draw: drawPen },
      off: { x: Math.cos(f - 1.0) * 12, y: Math.sin(f - 1.0) * 12 + 2, a: f - 0.6, draw: drawWill },
    });
  });
}
