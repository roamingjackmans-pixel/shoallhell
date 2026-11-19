# Shoallhell

A card-driven tactical dungeon crawler set in the world of **Dungeon Joe**. The Landlord is gone, but four hundred
years of skimmed rent pooled at the bottom of the world into a warm, glowing sea: the Shoal. Everything washes up
there — every Dungeon Joe monster, every boss, and the Landlord's will. Whoever stands at the bottom at Low Tide
inherits the deed to everything under the stairs. Joe has formed a Tenants' Union. They are going down to the sea.

Plays at **https://josephjackman.com/games/shoallhell/** (once deployed, see below). Solo or online co-op for up to
four players, with email + password accounts.

## How it plays

- **Cards, Gloomhaven-style.** Every round each hero picks two ability cards. The first one picked sets initiative.
  On your turn you play the **top half of one and the bottom half of the other** (any top can be a basic Attack 2,
  any bottom a basic Move 2). Chose the wrong half? **Undo** (Ctrl+Z) takes it back until you move, attack, skip
  or use an item. Played cards are discarded; halves marked LOST are gone for the scenario.
- **Rests.** *Short rest* any time between rounds (even with an empty hand): all discards come back except one
  random card, which is lost; you may pay 1 HP once to keep that card and lose a different random one instead.
  *Long rest* (when you are out of cards, or whenever you like): it takes your turn, heals 2, refreshes items, and
  you choose which discarded card to lose. Run out entirely and you are exhausted. A hit that would knock you out
  can be avoided by losing a card of your choice from your hand, or two of your choice from your discard pile.
- **Hexes and drag and drop.** The board is a hex grid. On a move, drag your hero up to the number of hexes the card
  gives (blue hexes), or click one. Click red-ringed enemies to attack, green-ringed allies to heal or shield, aim area attacks by hovering.
  Hover any hex to see what it is (obstacle, hazard, rubble, trap, door, loot) in the corner panel, and right-click
  a hex to ping it for everyone in the game.
- **Dungeon Joe rules carried over.** Red attacks ignore Shield; Blue attacks hit every hero in their area. The
  weakness chart (Magic › Holy › Void › Fire › Magic) gives +1/−1 damage. Fire, Magic, Void and Holy are elements
  heroes infuse and spend for bonuses.
- **Monsters.** All 80 Dungeon Joe enemies, with their own art, names and jokes, each with an ability deck built
  from its Dungeon Joe attacks; elites; 8 Dungeon Joe bosses plus the new final boss, The Executor.
- **Maps.** Every scenario is procedurally generated: a chain of large, irregular hex rooms behind doors in the Depth's zone style
  (props, hazards, difficult ground, traps, chests, coins), with packs built the Dungeon Joe way. Some packs wash up
  from other zones, and the bottom Depth mixes them all. A room stays dark and its monsters do not exist until
  someone opens its door. Move the view by dragging empty ground or with WASD/arrow keys; zoom with the wheel or +/−.
- **Campaigns.** Nine Depths, 27 scenarios (clear, destroy targets, escape, survive, boss), plus random Riptide Delves.
  Keep up to 8 campaigns at once (📜 in the hall): each has its own tenants and progress; unlocked classes, Tasks and
  records are shared by all of them.
- **Co-op lobby.** Open a lobby and friends join with the 4-digit code, an invite, or Join from their friends list.
  The lobby stays together across missions: the host starts each one and every guest is brought along automatically,
  then everyone returns to the lobby. Each player picks their own heroes in the lobby and keeps what they earn.
  Refreshing the page (host or guest) puts you straight back in the lobby or the fight; the server holds a host's room
  for 3 minutes while they reconnect.
- **Friends.** Every account has a 4-digit friend code. Add a friend by code (requests wait if they are offline),
  see who is online and who is in a lobby, invite them with one click, or join theirs.
- **Inventory.** Dungeon Joe style paper doll on each hero's sheet: one helmet, one chest, one pair of shoes, two hand
  items (one for classes with a two-handed weapon) and potions/utility items up to half the level, rounded up. Everything
  else waits in the bag; click to equip or swap. Only equipped items come into a scenario.
- **Pushing.** When a hero pushes an enemy and it could go more than one way, you pick the hex (step by step).
- **Version** is shown on the sign-in screen and in the hall header.
- **Classes.** 14 classes: Dungeon Joe's ten (Knight, Brute, Duelist, Scholar, Pyre Priest, Battlemage, Hunter,
  Zealot, Berserker, Nobody) and four new ones (Shoal Diver, Notary, Glowsmith, Lamplighter). Four start unlocked;
  the rest unlock through **Tasks** as you play. Each class has ~19 cards: its level-1 hand plus two choices at each
  level up to 5, and a perk list that tunes its attack modifier deck.
- **Progress.** XP, levels, new cards, perks, gold, Gary's stall (items), Tasks, records — saved to your account.

## Run it locally

Needs Node 22+ (24 recommended). PowerShell:

```powershell
cd C:\dev\Shoallhell; npm install
npm run dev        # server on :3031 + game on http://localhost:5174/games/shoallhell/
```

Other commands:

```powershell
npm run typecheck; npm test     # rules simulation (every scenario played by a bot) + server/accounts/co-op tests
npm run build                   # production build to dist/
npm start                       # the server alone; it also serves dist/ at /games/shoallhell/
```

Dev shortcut: `http://localhost:5174/games/shoallhell/?test=9c&classes=knight,lamplighter&level=3` jumps straight
into any scenario (nothing is saved). Co-op guest bot for testing: host a room, then
`$env:ROOM='123456'; npx vitest run tests/coop-bot.test.ts`.

Accounts and saves live in `data/` (git-ignored). "Play offline on this device" works with no server at all.

## How it deploys

Two parts, like Roleplay20:

1. **The game page** (static) on GitHub Pages through the `games` repo. Every push to `main` runs
   `.github/workflows/ready.yml`: type check, tests, build, then the built site goes to `site/` on the `ready`
   branch. Add `{ "folder": "shoallhell", "repo": "shoallhell", "publish": "site" }` to the games repo's
   `deploy/library.json`. The page talks to https://shoallhell.fly.dev unless the repository variable `SHOALLHELL_SERVER` says otherwise.
2. **The server** (accounts, saves, co-op relay) on Fly.io: `fly launch --no-deploy --copy-config`, then
   `fly volumes create shoallhell_data --size 1 --region ord`, then `fly deploy`. About $2–4 a month.

## Code map

```
src/game/      rules engine (rules.ts), map generator (procgen.ts), grid/pathing, modifier decks, campaign/saves,
               match controller (solo + co-op host/guest)
src/data/      classes, cards (one file per class), monsters (converted from Dungeon Joe), items, tasks, story
src/draw/      Dungeon Joe's vector art, copied as-is (enemies, bosses, Joe, weapons, props)
src/render/    the battle board, hero drawing, The Executor
src/ui/        sign-in, hall, recruit, character sheet, combat HUD, lobby, results, story cards
server/        Express + Socket.IO: email/password accounts (scrypt), profile saves, co-op rooms, friends and presence
docs/          CARD_DESIGN.md (how cards are written)
```
