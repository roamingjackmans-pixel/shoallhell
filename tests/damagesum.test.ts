// The damage sum shown over every attack.
import { describe, expect, it } from 'vitest';
import { damageSum } from '../src/game/rules';

describe('damage sum', () => {
  it('writes out the attack', () => {
    expect(damageSum(2, [{ v: 1 }], 1, false, 0, 3)).toBe('2 + 1 = 3');
    expect(damageSum(3, [{ v: -1 }], 1, false, 0, 2)).toBe('3 − 1 = 2');
    expect(damageSum(3, [{ v: 0, mult: 'x2' }], 1, false, 0, 6)).toBe('3 × 2 = 6');
    expect(damageSum(3, [{ v: 1, roll: true }, { v: 0, mult: 'x2' }], 1, false, 0, 8)).toBe('(3 + 1) × 2 = 8');
    expect(damageSum(2, [{ v: 0, temp: 'bless' }], 1, false, 0, 4)).toBe('2 × 2 = 4');
    expect(damageSum(4, [{ v: 0 }], 1.5, true, 1, 5)).toBe('4 + 0 + 1 weak + 1 poison − 1 shield = 5');
    expect(damageSum(3, [{ v: 1 }], 0.6, false, 0, 3)).toBe('3 + 1 − 1 resist = 3');
  });
});
