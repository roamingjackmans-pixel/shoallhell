# Card design guide

How ability cards work in Shoallhell, and the rules every class deck follows. Card data lives in
`src/data/cards/<class>.ts`, written with the helpers in `src/data/dsl.ts` (see `src/data/cards/knight.ts` for the
reference deck). Types are in `src/game/types.ts`.

## How cards are played

- Before each round every hero picks **two cards** from their hand. The first one picked is the *lead*: its initiative
  (01–99, low goes first) is the hero's initiative for the round.
- On their turn a hero plays the **top half of one card and the bottom half of the other**, in either order. Any top
  half can instead be played as the basic **Attack 2**, any bottom half as the basic **Move 2**.
- Played cards go to the discard pile. A half marked **lost** (`L(...)`) sends the card to the lost pile: it is gone
  for the rest of the scenario. A half with a **persist** effect (`P(...)`) parks the card in the active area until its
  uses run out, then it is lost (if the half was lost) or discarded.
- **Short rest** (between rounds, any time the discard has 2+ cards): all discards return to the hand except one
  random card, which is lost. **Long rest** (takes the whole round, initiative 99): heal 2, refresh spent items, choose
  one discard to lose, the rest return. A hero who cannot play two cards and cannot rest is exhausted.
- So hand size is the hero's stamina. Lost halves are the big moments and should be clearly stronger than normal
  halves, and give XP.

## Steps (from `dsl.ts`)

| Helper | Meaning |
|---|---|
| `mv(n, jump?)` | move up to n hexes (six directions; difficult ground costs 2). `jump` ignores obstacles, figures and hazards |
| `atk(n, {range, targets, aoe, pierce, push, pull, cond, type, xp, drain, use, selfDmg, all})` | attack. `range 0` = melee (one of the six neighbouring hexes). `targets` = up to N different enemies. `aoe`: `cleave` (the aimed hex + the next one clockwise around you), `line2`, `line3` (straight out), `cone` (aimed hex + the three beyond it), `ring` (all six neighbours), `cross` (5 hexes centred in range), `blast` (a hex in range + its six neighbours). `pierce` ignores N shield. `push`/`pull` N spaces. `type`: `physical` (default), `fire`, `magic`, `void`, `holy` — the weakness chart is Magic>Holy>Void>Fire>Magic (+1 damage when strong, −1 when weak). `drain` heals the attacker. `selfDmg` hurts the attacker. `all` hits every enemy in range |
| `heal(n, {range, all, cond})` | heal (and remove poison/wound). No range = self. `all` = every ally in range |
| `shield(n, {range, all})` | Shield n until end of round (reduces each attack's damage). `range` lets you give it to an ally |
| `ret(n, {range})` | Retaliate n until end of round (damages adjacent attackers) |
| `buff(conds, {range, all})` | give positive conditions: `strengthen` (advantage), `invisible` (can't be targeted), `regenerate` (heal 1 each turn start) |
| `loot(n)` | pick up coins/chests within n |
| `infuse(el)` | infuse an element (`fire`, `magic`, `void`, `holy`); strong next round, waning the round after |
| `use(el, bonus)` | on a step: spend an element for a bonus `{n, range, targets, cond, heal, pierce, push, xp, shield, text}` (`text` is what the card shows, e.g. `'+2 Attack'`) |
| `summon(id)` | summon an ally (ids: `glow_turret`, `tin_helper`, `bellows_buddy`, `hound`, `pyre_wisp`, `intern`, `eel`, `moths`, `gary`) |
| `recover(n)` | return n cards from discard to hand |
| `bless(n, range)` | shuffle n Bless (×2) cards into an ally's modifier deck (range 0 = self) |
| `curse(n, range)` | shuffle n Curse (miss) cards into the monster modifier deck |
| `tp(n)` | teleport to any empty space within n |
| `xp(n)` | gain n XP when this half is played |
| `P(kind, n, uses, text, cond?)` | lasting effect. kinds: `shield` (−n damage per attack against you, uses = attacks), `retaliate`, `atk` (+n to each of your attacks, uses = attacks), `move` (+n to each move), `drain` (heal n whenever you attack), `cond` (your attacks apply `cond`). `uses 0` = rest of the scenario |

Negative conditions for enemies: `poison` (+1 damage taken from attacks), `wound` (1 damage at each turn start),
`immobilize`, `disarm`, `stun` (loses its next turn), `muddle` (disadvantage).

## Deck shape and numbers

- Level 1: **hand size + 1** cards (the class `hand` in `src/data/classes.ts`). Levels 2, 3, 4, 5: **two cards each**
  (the hero picks one per level-up).
- Initiatives spread across 05–95; fast classes skew low. No two cards in a class share an initiative.
- Normal top halves: Attack 2–3 (level 1), 3–4 (level 3+), often with one rider (push, a condition, a target, range).
  Normal bottoms: Move 2–4, or utility (shield 1–2, heal 2–3, loot, infuse).
- Lost halves: Attack 4–6 or big area/control, summons, persistent bonuses; give `xp` 1–2.
- Ranged classes: range 2–4 attacks a point weaker than melee. Area attacks a point weaker again.
- Most cards have a move somewhere (top or bottom) so heroes can reposition.
- Use the class's element (`elem` in classes.ts): some cards infuse it, others spend it with `use(...)`.
- Card names are short and in Dungeon Joe’s voice: grim world, cheeky text. Give a few cards a one-line flavour.
- Card names must be unique within the class (the id is built from the name).
