// What a hex is and what it does, for the hover panel: obstacles, hazards, rubble, traps, doors, the exit, walls,
// and any coins or chest lying on it. Plain hexes of open floor return nothing.
import { zoneLook } from '../data/zones';
import { COIN_VALUE } from '../game/rules';
import { neighbors, roomAt, tile } from '../game/grid';
import type { CombatState } from '../game/types';

export interface TileLine {
  name: string;
  text: string;
  kind: 'terrain' | 'loot';
}

const OBSTACLES: Record<string, string> = {
  coffin: 'Coffins, urns and gravestones',
  mushroom: 'Giant mushrooms and boulders',
  barrel: 'Barrels, crates and sacks',
  stump: 'Stumps, boulders and thorn bushes',
  anvil: 'Anvils and forge clutter',
  crystal: 'Ice crystals and frozen relics',
  gear: 'Gears and clockwork scrap',
  void: 'Shards of nothing',
};

const HAZARD_TEXT: Record<string, string> = {
  water: 'murky water',
  poisonCloud: 'a cloud of spores',
  thorns: 'a thicket of thorns',
  lava: 'molten slag',
  ice: 'black ice',
  oil: 'scalding oil',
  void: 'a patch of the void',
};

/** The zone a hex belongs to (walls and doors take a neighbouring open room's zone). */
function zoneOf(s: CombatState, x: number, y: number): number {
  let r = roomAt(s.map, x, y);
  if (r < 0)
    for (const [nx, ny] of neighbors(x, y)) {
      const rr = roomAt(s.map, nx, ny);
      if (rr >= 0 && s.map.rooms[rr]!.revealed) {
        r = rr;
        break;
      }
    }
  return r >= 0 ? s.map.rooms[r]!.zone : s.map.zone === 9 ? 8 : s.map.zone;
}

/** True when the hex can be seen (its room is open, or it is a wall/door next to an open room). */
export function hexVisible(s: CombatState, x: number, y: number): boolean {
  const r = roomAt(s.map, x, y);
  if (r >= 0) return s.map.rooms[r]!.revealed;
  return neighbors(x, y).some(([nx, ny]) => {
    const rr = roomAt(s.map, nx, ny);
    return rr >= 0 && s.map.rooms[rr]!.revealed;
  });
}

export function describeTile(s: CombatState, x: number, y: number): TileLine[] {
  if (!hexVisible(s, x, y)) return [];
  const out: TileLine[] = [];
  const z = zoneLook(zoneOf(s, x, y));
  const cap = (t: string): string => t[0]!.toUpperCase() + t.slice(1);
  switch (tile(s.map, x, y)) {
    case 'o':
      out.push({ kind: 'terrain', name: 'Obstacle', text: `${OBSTACLES[z.props] ?? 'Clutter'}. Blocks movement but not line of sight: shoot over it, or Jump across it.` });
      break;
    case '~':
      out.push({
        kind: 'terrain',
        name: `Hazard: ${cap(z.hazardName)}`,
        text: `${cap(HAZARD_TEXT[z.hazardKind] ?? 'something nasty')}. Anyone who walks in takes 1 damage. Jumping, flying monsters and Industrial Wellies avoid it. Monsters steer around it when they can.`,
      });
      break;
    case ',':
      out.push({ kind: 'terrain', name: 'Difficult ground', text: 'Rubble and muck. Costs 2 movement to step into (Jumping ignores it).' });
      break;
    case 'T': {
      const dmg = 2 + Math.floor(s.scenario.level / 3);
      out.push({ kind: 'terrain', name: 'Trap', text: `Springs on the first figure to step on it: ${dmg} damage and Immobilize, then it is gone. Jumping and flying avoid it; Industrial Wellies crush it harmlessly.` });
      break;
    }
    case 'D':
      out.push({
        kind: 'terrain',
        name: 'Closed door',
        text: 'Move onto it to open it (that ends the move). The room behind stays dark and its monsters do nothing until the door opens. Monsters cannot open doors, and closed doors block line of sight.',
      });
      break;
    case 'd':
      out.push({ kind: 'terrain', name: 'Open door', text: 'An open doorway. Ordinary ground now.' });
      break;
    case 'X':
      out.push({ kind: 'terrain', name: 'Exit', text: 'The way out. A hero who ends their turn here escapes the scenario.' });
      break;
    case '#':
      out.push({ kind: 'terrain', name: 'Wall', text: 'Blocks movement and line of sight.' });
      break;
  }
  for (const p of s.pickups) {
    if (p.opened || p.x !== x || p.y !== y) continue;
    if (p.kind === 'coin')
      out.push({ kind: 'loot', name: 'Coins', text: `Worth ${COIN_VALUE[Math.min(7, s.scenario.level)]} gold. Pick them up by ending your turn here, or with a Loot action from range.` });
    else out.push({ kind: 'loot', name: 'Chest', text: 'Gold or an item. Open it by ending your turn here, or with a Loot action from range.' });
  }
  return out;
}
