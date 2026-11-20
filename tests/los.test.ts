// Line of sight, Gloomhaven style: any line from the attacker's hex (centre or a corner) to the target's hex that
// crosses no wall gives sight. Walls straight in the way still block.
import { describe, expect, it } from 'vitest';
import { hexCenter, hexDist, isWallish, los, pixelToHex, tile } from '../src/game/grid';
import type { MapData } from '../src/game/types';

function mapOf(rows: string[]): MapData {
  return { w: rows[0]!.length, h: rows.length, tiles: rows } as unknown as MapData;
}

/** The old rule: only the centre-to-centre line. */
function centreOnly(map: MapData, ax: number, ay: number, bx: number, by: number): boolean {
  const [px, py] = hexCenter(ax, ay);
  const [qx, qy] = hexCenter(bx, by);
  const n = hexDist(ax, ay, bx, by) * 8;
  for (let i = 1; i < n; i++) {
    const [hx, hy] = pixelToHex(px + ((qx - px) * i) / n, py + ((qy - py) * i) / n);
    if ((hx === ax && hy === ay) || (hx === bx && hy === by)) continue;
    if (isWallish(tile(map, hx, hy))) return false;
  }
  return true;
}

describe('line of sight', () => {
  it('a wall straight in the way blocks, a wall row blocks everything behind it', () => {
    const m = mapOf(['.......', '...#...', '.......']);
    expect(los(m, 1, 1, 5, 1)).toBe(false); // through the wall on the same row
    const wall = mapOf(['.......', '#######', '.......']);
    for (let x = 0; x < 7; x++) for (let x2 = 0; x2 < 7; x2++) expect(los(wall, x, 0, x2, 2)).toBe(false);
  });

  it('seeing past a wall corner works even when the centre line clips it', () => {
    // one wall hex among open floor: some pairs that the old centre-only rule blocked are now in sight
    const m = mapOf(['.......', '.......', '...#...', '.......', '.......']);
    let opened = 0;
    for (let ay = 0; ay < 5; ay++)
      for (let ax = 0; ax < 7; ax++)
        for (let by = 0; by < 5; by++)
          for (let bx = 0; bx < 7; bx++) {
            if (tile(m, ax, ay) === '#' || tile(m, bx, by) === '#' || hexDist(ax, ay, bx, by) > 3) continue;
            const was = centreOnly(m, ax, ay, bx, by);
            const now = los(m, ax, ay, bx, by);
            if (was) expect(now).toBe(true); // never stricter than before
            if (!was && now) opened++;
            expect(los(m, bx, by, ax, ay)).toBe(now); // symmetric
          }
    expect(opened).toBeGreaterThan(0);
  });
});
