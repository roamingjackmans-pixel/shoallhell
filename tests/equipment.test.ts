// Equipment slots: one helmet, chest and shoes; two hands (one with a two-handed weapon); potions/utility = level/2 up.
import { describe, expect, it } from 'vitest';
import { buyItem, equipItem, equipSwap, heroSetup, loadout, makeCharacter, slotCaps, unequipItem, upgradeProfile, type Profile } from '../src/game/campaign';

describe('equipment', () => {
  it('caps slots by class and level', () => {
    const knight = makeCharacter('K', 'knight'); // sword and shield
    const brute = makeCharacter('B', 'brute'); // two-handed greathammer
    expect(slotCaps(knight)).toEqual({ head: 1, body: 1, legs: 1, hand: 2, small: 1 });
    expect(slotCaps(brute).hand).toBe(1);
    knight.level = 2;
    expect(slotCaps(knight).small).toBe(1);
    knight.level = 3;
    expect(slotCaps(knight).small).toBe(2);
    knight.level = 5;
    expect(slotCaps(knight).small).toBe(3);
  });

  it('buys onto a free slot, otherwise into the bag; only equipped items go into a scenario', () => {
    const b = makeCharacter('B', 'brute');
    b.gold = 999;
    expect(buyItem(b, 'crowbar')).toBeNull();
    expect(buyItem(b, 'spoon')).toBeNull();
    expect(loadout(b)).toEqual(['crowbar']); // one hand only
    expect(b.items).toEqual(['crowbar', 'spoon']);
    expect(equipItem(b, 'spoon')).toMatch(/two-handed/);
    expect(heroSetup(b, 'me').items).toEqual(['crowbar']);
    // swapping from the bag takes the old one off
    expect(equipSwap(b, 'spoon')).toBe('crowbar');
    expect(loadout(b)).toEqual(['spoon']);
    unequipItem(b, 'spoon');
    expect(loadout(b)).toEqual([]);
  });

  it('potion slots follow half the level, rounded up', () => {
    const k = makeCharacter('K', 'knight');
    k.gold = 999;
    buyItem(k, 'thermos');
    buyItem(k, 'potion_heal');
    expect(loadout(k)).toEqual(['thermos']);
    k.level = 3;
    expect(equipItem(k, 'potion_heal')).toBeNull();
    expect(loadout(k)).toEqual(['thermos', 'potion_heal']);
  });

  it('old saves start with what they used to carry', () => {
    const k = makeCharacter('K', 'knight');
    k.items = ['crowbar', 'spoon', 'whistle', 'thermos', 'potion_heal', 'hardhat'];
    delete (k as { equipped?: string[] }).equipped;
    const p = upgradeProfile({ v: 1, name: 'T', characters: [k] } as unknown as Profile);
    const c = p.campaigns[0]!.characters[0]!;
    expect(loadout(c)).toEqual(['crowbar', 'spoon', 'thermos', 'hardhat']);
  });
});
