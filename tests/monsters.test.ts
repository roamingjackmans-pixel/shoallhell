// Monster tweaks on top of Dungeon Joe's enemy data.
import { describe, expect, it } from 'vitest';
import { monsterDef } from '../src/data/monsters';

describe('monsters', () => {
  it('Shambler attacks never ignore Shield (Grave Lunge keeps its lunge)', () => {
    const sh = monsterDef('shambler');
    expect(sh.abilities.some((a) => a.red)).toBe(false);
    expect(sh.abilities.find((a) => a.name === 'Grave Lunge')).toMatchObject({ atk: 1 });
  });
});
