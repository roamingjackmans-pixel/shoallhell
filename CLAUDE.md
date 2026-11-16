# CLAUDE.md — Shoallhell

Shoallhell is a Gloomhaven-style card tactics game in the Dungeon Joe world (see README.md). Browser game
(Vite + TypeScript, Canvas 2D, no framework) plus a small Node server (Express + Socket.IO) for email/password
accounts, cloud saves and the co-op relay. Will be hosted at `https://josephjackman.com/games/shoallhell/`.

## How we work

- The owner works on Windows 11 + PowerShell 5.1: commands you give them are exact PowerShell (chain with `;`).
- Project path `C:\dev\Shoallhell`. Dungeon Joe's source (art, enemies, lore) is at `C:\dev\DungeonJoe`.
- Commit/push only when asked.

## Rules that are easy to break

- `CombatState` must stay plain JSON (no Maps/Sets/classes): the co-op host sends it to guests whole.
- No `Math.random()` in `src/game/rules.ts` or `src/game/procgen.ts`: use the seeded `rng.ts` with the state.
- Content is data: cards in `src/data/cards/*.ts` (written with `src/data/dsl.ts`, rules in docs/CARD_DESIGN.md),
  monsters converted from Dungeon Joe in `src/data/monsters.ts`. The engine never special-cases a card by id.
- `src/draw/` is Dungeon Joe's art copied as-is; change art in Dungeon Joe first if it should match there too.
- Enemies stay Dungeon Joe's enemies (owner's request). New bosses are drawn with Joe's rig (see render/executor.ts).
- Every scenario must play to an end in `tests/sim.test.ts`.

## Commands

```powershell
npm run dev                      # server :3031 + Vite :5174 (launch config "shoallhell-dev")
npm run typecheck; npm test      # engine sims + server tests
npm run build                    # dist/
```
