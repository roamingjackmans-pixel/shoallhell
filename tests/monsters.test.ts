// Monster tweaks on top of Dungeon Joe's enemy data.
import { describe, expect, it } from 'vitest';
import { MONSTERS, monsterDef } from '../src/data/monsters';
import { modLabel } from '../src/game/mods';

describe('monsters', () => {
  it('Shambler attacks never ignore Shield (Grave Lunge keeps its lunge)', () => {
    const sh = monsterDef('shambler');
    expect(sh.abilities.some((a) => a.red)).toBe(false);
    expect(sh.abilities.find((a) => a.name === 'Grave Lunge')).toMatchObject({ atk: 1 });
  });

  it('ranged monsters shoot from where they stand (close in to give them disadvantage)', () => {
    let shooters = 0;
    for (const d of Object.values(MONSTERS)) {
      if (!(d.base.range > 0 && d.base.move > 0)) continue;
      shooters++;
      // plain attacks (not lunges, area blasts or guarded repositions) do not move first
      const plain = d.abilities.filter((a) => a.atk !== null && a.atk >= 0 && !a.red && !a.blue && !a.shield);
      expect(plain.length, d.id).toBeGreaterThan(0);
      for (const a of plain) expect(a.move, `${d.id}: ${a.name}`).toBeNull();
      // but every shooter can still close in somehow
      expect(d.abilities.some((a) => a.move !== null), d.id).toBe(true);
    }
    expect(shooters).toBeGreaterThan(5);
  });

  it('the miss card is shown as ×0', () => {
    expect(modLabel({ v: 0, mult: 'null' })).toBe('×0');
    expect(modLabel({ v: 0, temp: 'curse' })).toBe('CURSE ×0');
  });
});
