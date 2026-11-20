# Class balance

Balance report: bal-1a, bal-2a, bal-3a (1 room of monsters) · scenario level 0 · 450 seeds each · Normal · solo, level 1, random hand from the level-1 cards
Average win rate 41.6% · band (±20% of average) 33.3%–49.9% · 83 s

| Class | Win rate | vs average | Avg rounds | Avg damage | HP left when won |
|---|---|---|---|---|---|
| Brute | 46.0% | 111% | 12.5 | 15.1 | 36% |
| Pyre Priest | 45.1% | 108% | 14.6 | 13.4 | 74% |
| Zealot | 45.1% | 108% | 12.9 | 14.7 | 61% |
| Lamplighter | 44.2% | 106% | 14.1 | 11.1 | 54% |
| Berserker | 41.9% | 101% | 12.6 | 15.3 | 43% |
| Notary | 41.7% | 100% | 13.5 | 14.5 | 64% |
| Shoal Diver | 40.8% | 98% | 12.5 | 14.9 | 42% |
| Knight | 40.7% | 98% | 15.5 | 15.1 | 44% |
| Hunter | 40.7% | 98% | 15.1 | 12.0 | 58% |
| Glowsmith | 40.2% | 97% | 13.6 | 15.1 | 51% |
| Duelist | 40.1% | 96% | 13.8 | 14.0 | 52% |
| Battlemage | 39.5% | 95% | 12.7 | 15.6 | 51% |
| Nobody | 39.3% | 94% | 14.6 | 14.4 | 56% |
| Scholar | 36.7% | 88% | 14.5 | 13.7 | 59% |

## How it is measured

- `tests/balance.test.ts` with the bot in `tests/balance/bot.ts`. Run it with
  `$env:BALANCE='1'; $env:BAL_LEVEL='0'; $env:BAL_N='450'; $env:BAL_OUT='1'; npx vitest run tests/balance.test.ts`
  (`BAL_SEED` picks a different set of seeds; without `BAL_OUT` the report goes to `tests/balance/last-report.md`).
- Every class plays the same seeded missions solo: the first three clear-the-rooms scenarios (1a, 2a, 3a) cut to one
  room of monsters after the start room, at scenario level 0, on Normal. Each game the hero gets a random hand from
  their level-1 cards, so every build is played. No items, no perks.
- Scenario level 0 with one room puts the average near 40% (the full three-room missions are a 0% wall for one
  level-1 hero), which leaves room to see classes above and below it.
- The bot is the same for every class: it picks the best top/bottom pair for the situation, moves before attacking
  when nothing is in reach, keeps ranged classes at range, finishes what it can kill, aims area attacks at the most
  enemies, rests when it must and only burns cards to survive a lethal hit.
- Target: every class within ±20% of the average win rate. Checked on two independent seed sets (2,700 games per
  class); the table above is the second, untouched-by-tuning set.

Limits: it measures solo play at level 1. Support classes (Lamplighter, Pyre Priest) are also built to help allies,
which a solo run does not see; higher-level cards are not measured.

## Card changes from the balance pass

- **Notary** (23% → 42%): Red Tape Attack 2→3 · Filed in Triplicate Attack 1→2 · Poison Pen bottom Heal 2→3.
- **Scholar** (30% → 37%): Footnote Attack 2→3 · Study Break Heal 2→3 · Pop Quiz Attack 1→2 · Skip a Chapter Attack 2→3 ·
  Dry Reading Attack 2→3, bottom Shield 1→2 · Bookmark top Attack 2 range 2 → Attack 3 range 3 · Citation Needed Attack 1→2 ·
  Do Not Disturb range 2→3 · Kindling Chapter bottom Move 2 → Move 3, Shield 1 · Line of Inquiry bottom Move 3 → Move 2, Shield 1 ·
  Red Pen bottom Move 2→3.
- **Battlemage** (30% → 40%): Charged Edge Attack 2→3 · Blinkstrike Attack 2→3 · Rune Ward bottom Move 2 → Heal 2 ·
  Read Aloud bottom Move 3 → Move 2, Heal 2.
- **Nobody** (30% → 39%): Slipper Sprint Attack 2→3 · Behind the Sofa Attack 2→3.
- **Shoal Diver** (31% → 41%): Pressure Drop Attack 2→3 · Through the Water Attack 2→3.
- **Glowsmith** (34% → 40%): Tin Apprentice Attack 2→3 · Apron of Many Burns Attack 2→3 · Bellows Breath bottom Move 2→3.
- **Knight** (34% → 41%): Longsword Sweep Attack 2→3.
- **Berserker** (58% → 42%): Bloodletting drain 2→1 · Red Mist drain 2→1 · Shrug It Off Heal 3→2 · Thick Skull bottom Heal 2→1 ·
  Kindle the Rage Attack 3→2.
- **Pyre Priest** (54% → 45%): Last Rites bottom Heal 3→2 · Censer Swing Attack 3→2.
- **Lamplighter** (53% → 44%): Light the Way range 4→3 · Everburning Lamp range 4→3, its heal-on-attack lasts six attacks instead of
  the whole scenario · Mend the Wick Heal 3→2, bottom Move 3→2 · Lantern Swing bottom Heal 2→1 · Long Reach Attack 3→2 ·
  Lamp Post Shield 2→1 · Lamp Oil Heal 2→1 · Hot Wax range 3→2 · Strike a Match bottom loses its Heal 1.
- **Duelist** (47% → 40%): Cheap Shot Attack 3→2 · One-Two bottom Move 4→3.
- Brute, Zealot and Hunter were already inside the band and are unchanged.
