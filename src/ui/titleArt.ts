// An animated line-up behind the title and sign-in screens: the union wading in the Shoal, Dungeon Joe's monsters
// lurking behind them.
import { monsterDef } from '../data/monsters';
import { zoneLook } from '../data/zones';
import '../draw/enemies';
import { glow } from '../draw/parts';
import { drawById } from '../draw/registry';
import { drawHero } from '../render/hero';

const HEROES = ['knight', 'scholar', 'nobody', 'brute', 'duelist'];
const MONS = ['crypt_shambler', 'caverns_sporeling', 'sewers_croc', 'forge_cultist', 'abyss_bailiff', 'crypt_bone_archer', 'reliquary_wraith'];

export function titleArt(parent: HTMLElement): () => void {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  parent.prepend(c);
  const g = c.getContext('2d')!;
  let raf = 0;
  const t0 = performance.now();
  const frame = (): void => {
    raf = requestAnimationFrame(frame);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== W * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    const t = (performance.now() - t0) / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#07060b');
    grd.addColorStop(0.55, '#0b1316');
    grd.addColorStop(1, '#123a34');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    // glowing shallows
    for (let i = 0; i < 40; i++) {
      const y = H * 0.62 + ((i * 37) % (H * 0.4)) + Math.sin(t * 0.6 + i) * 4;
      const x = ((i * 211 + t * 12 * ((i % 3) + 1)) % (W + 200)) - 100;
      g.strokeStyle = `rgba(157,255,207,${0.08 + (i % 4) * 0.03})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 30, y - 5, x + 60, y);
      g.stroke();
    }
    const baseY = H * 0.8;
    // monsters behind
    MONS.forEach((id, i) => {
      const x = W * (0.08 + i * 0.14) + Math.sin(t * 0.5 + i) * 6;
      const y = baseY - 70 - (i % 2) * 24;
      const z = zoneLook(1 + (i % 8));
      g.save();
      g.globalAlpha = 0.55;
      drawById(g, id, { x, y, facing: Math.PI / 2, t: t + i, r: 20, flash: false, tint: null, alpha: 1, scale: 1.3, squash: 0, pose: 'idle', poseT: 0, hpFrac: 1, moving: 0.2, pal: z.colors, phase: 0, variant: i, awake: true, elem: 'physical', atk: null });
      g.restore();
    });
    void monsterDef;
    // the union, wading
    HEROES.forEach((cls, i) => {
      const x = W * 0.5 + (i - 2) * 92;
      const y = baseY + Math.sin(t * 1.5 + i) * 2;
      glow(g, x, y + 14, 40, '#9dffcf', 0.18);
      drawHero(g, cls, { x, y, facing: -Math.PI / 2 + (i - 2) * 0.15, t: t + i * 0.3, moving: 0.5, scale: 1.8 });
      g.fillStyle = 'rgba(18,58,52,0.55)';
      g.fillRect(x - 40, y + 14, 80, 30);
    });
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    c.remove();
  };
}
