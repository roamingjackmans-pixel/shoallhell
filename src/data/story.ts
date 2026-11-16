// The story of Shoallhell: what happened after Dungeon Joe, the nine Depths of the Shoal, and every scenario's
// set-up and pay-off. Grim world, cheeky text (Dungeon Joe D14). Joe is still an ordinary guy in over his head;
// now he has a union.
import type { Objective } from '../game/types';

export const TITLE = 'Shoallhell';
export const SUBTITLE = 'A Dungeon Joe story · The Tenants’ Union goes down to the sea';

/** The premise, typed out the first time an account starts the campaign. */
export const PREMISE: readonly string[] = [
  'The Landlord is gone. He came apart like a shredded contract, and every drop of Glowen he collected went home: to kettles, lamps, coats and good spoons.',
  'Almost every drop.',
  'Rent flows downhill. For four hundred years it ran through the Drowned Sewers, and not all of it reached his desk. It leaked. It pooled. Under the floor of the Abyss, where there was no floor, it made a sea.',
  'Warm. Shallow. Glowing. The Shoal.',
  'Everything washes up in the Shoal: every monster Joe ever bonked, their cousins, their cousins’ landlords. And, last Tuesday, the Landlord’s will.',
  'The will is short. Whoever stands at the bottom of the Shoal at Low Tide inherits the deed to everything under the stairs. And, per the small print, over them.',
  'The Executor of the estate has been very busy. He has rehired all of the Landlord’s old staff. Most of them are hollow. None of them read the contract.',
  'Joe got a letter addressed to “The Occupant”. He called a tenants’ meeting in the boiler room. Fourteen people came, most of them armed.',
  'Nobody is inheriting anything. The Tenants’ Union is going down to the sea.',
];

/** Lines the hall shows at random between scenarios. */
export const HALL_LINES: readonly string[] = [
  'The boiler room smells of tea, damp coats and somebody’s sword oil.',
  'Gary has set up a stall by the boiler. Nobody invited Gary. Gary pays no rent.',
  'Someone has pinned the Landlord’s will to the dartboard. It is doing well.',
  'The minutes of the last meeting read, in full: “Down. Again.”',
  'Joe has made a rota for the kettle. It is the only rota anyone follows.',
  'A bucket under the stairs is collecting Glowen from a leak. It glows when you are sad.',
  'The union banner reads TENANTS UNITED. Someone has added “& ARMED” in marker.',
  'The Knight is polishing his shield. The Brute is polishing the Knight.',
];

export interface DepthDef {
  n: number;
  name: string;
  /** which Dungeon Joe zone washed up here (enemy pool, palette, props); 9 = everything */
  zone: number;
  tagline: string;
  lines: string[];
}

export const DEPTHS: DepthDef[] = [
  { n: 1, zone: 1, name: 'The Bone Shallows', tagline: 'The crypt washed up first. The dead float. They do not like it.',
    lines: ['At the bottom of Joe’s stairs the steps go into warm, glowing water, ankle deep.', 'Coffins bob in it like ducks. The Mossy Crypt came loose and drifted down here whole.', 'Somewhere a lantern is still lit. The Caretaker has a new contract.'] },
  { n: 2, zone: 2, name: 'The Spore Reef', tagline: 'Mushrooms the size of chapels, now with a sea view.',
    lines: ['The Fungal Caverns sank into the Shoal and took root. Caps glow under the water like jellyfish.', 'Mother Spore has never been so happy. The Glowen here is free, and she is farming it.'] },
  { n: 3, zone: 3, name: 'The Bilge', tagline: 'Every drain in the world ends somewhere. Here.',
    lines: ['The Drowned Sewers emptied straight into the Shoal, and the Shoal did not want them either.', 'The Bloatking floats on a throne of debris, skimming the tide. Old habits.'] },
  { n: 4, zone: 4, name: 'The Driftwood', tagline: 'A forest on rafts. The leaves still fall upward.',
    lines: ['The Hollow Forest broke off in chunks and drifted here as islands of root and bark.', 'Vexthorn rides the biggest raft. The wolves on board look seasick and furious.'] },
  { n: 5, zone: 5, name: 'The Slag Flats', tagline: 'Hot. Loud. Still not unionised. We’re working on it.',
    lines: ['Where the Ashen Forge fell in, the Shoal boils. The steam smells of overtime.', 'Foreman Ignatius has clocked back in. The Executor is paying time and a half.'] },
  { n: 6, zone: 6, name: 'The Rime Banks', tagline: 'Four hundred years on one note, now with an echo.',
    lines: ['The Frozen Reliquary slid into the sea and froze a mile of it.', 'Saint Aurelia stands at the door again. The Executor has had her contract re-frozen. She is livid.'] },
  { n: 7, zone: 7, name: 'The Gearwreck', tagline: 'Everything ticks. Some of it is rusting.',
    lines: ['The Clockwork Citadel landed on its side in the shallows and kept going anyway.', 'Archmagister Tock is auditing the estate. Every drop of Glowen in the Shoal has a line in his ledger.'] },
  { n: 8, zone: 8, name: 'The Undertow', tagline: 'No floor. No walls. Now also no lifeguard.',
    lines: ['The Abyss drains into the Shoal like a plughole. The current pulls toward a desk.', 'Behind the desk sits a photocopy of the Landlord, notarised, stamped and very much awake.'] },
  { n: 9, zone: 9, name: 'Shoallhell', tagline: 'The bottom of the bottom. Everything washes up here eventually.',
    lines: ['Low Tide. The water draws back and shows the floor of the Shoal: every zone, every monster, every lost spoon.', 'The Executor is waiting with the will, a pen and a very long reading voice.'] },
];

export interface ScenarioDef {
  id: string;
  name: string;
  depth: number;
  /** enemy/palette zone; 9 mixes every zone */
  zone: number;
  rooms: number;
  objective: Objective;
  intro: string[];
  outro: string[];
  unlocks: string[];
  gold: number;
  /** chance a pack comes from another zone ("washed up") */
  mix: number;
}

const S = (
  id: string,
  depth: number,
  name: string,
  rooms: number,
  objective: Objective,
  unlocks: string[],
  intro: string[],
  outro: string[],
  mix = 0.15,
): ScenarioDef => ({ id, name, depth, zone: DEPTHS[depth - 1]!.zone, rooms, objective, intro, outro, unlocks, gold: 10 + depth * 5, mix });

export const SCENARIOS: ScenarioDef[] = [
  S('1a', 1, 'Low Water, High Rent', 3, { kind: 'clear' }, ['1b'],
    ['The stairs end in warm water. The Tenants’ Union wades in, single file, holding their weapons over their heads.', 'Something in a coffin knocks politely. Then less politely.'],
    ['The shambling dead stop shambling. One of them was holding an eviction notice addressed to Joe.', 'The water is shallow. The rent is not. Onward.'], 0),
  S('1b', 1, 'The Drowned Graveyard', 3, { kind: 'destroy', monster: 'plague_bell', count: 2 }, ['1c'],
    ['Plague Bells toll across the water. Every toll wakes another tenant of the crypt.', 'Silence the bells. The dead will take it as a lie-in.'],
    ['The last bell goes quiet. Somewhere, a skeleton rolls over and goes back to sleep.', 'A lantern bobs further out. It is wearing a hat.']),
  S('1c', 1, 'The Caretaker’s Last Shift', 3, { kind: 'boss', boss: 'the_caretaker' }, ['2a'],
    ['The Caretaker is digging graves in the seabed. They keep filling with water. He keeps digging.', '“Tenants,” he says, not looking up. “The Executor said you might come. I have dug you a hole each.”'],
    ['The Caretaker lies down in one of his own graves. It fills with warm water. He seems at peace about it.', 'His lantern drifts away on the current, downhill, toward the reef. The union follows the lantern.']),
  S('2a', 2, 'Reef of Caps', 3, { kind: 'clear' }, ['2b'],
    ['The Spore Reef hums. The caps glow. A Sporeling waves at the Knight. The Knight waves back. Then it explodes.'],
    ['The reef goes quiet, apart from the humming, which never stops.']),
  S('2b', 2, 'The Long Hum', 4, { kind: 'escape' }, ['2c'],
    ['The tide is turning, and the reef closes up at high water. Get through to the far side before it seals.', 'Do not stop to fight everything. The mushrooms will not stop to fight you either. They will just keep coming.'],
    ['The union squeezes through the last gap as the caps fold shut behind them. Somebody has lost a shoe. Somebody always does.']),
  S('2c', 2, 'Mother Spore Takes the Waters', 3, { kind: 'boss', boss: 'mother_spore' }, ['3a'],
    ['Mother Spore has grown a mile wide. Her children ride the waves like little glowing boats.', '“My babies have never had it so good,” she says. “The Executor gives us all the Glowen we can drink.”'],
    ['Mother Spore wilts into the sea. Her children go dark one cap at a time, like cheap fairy lights.', 'The reef drains down into a smell. The Bilge is next. Everybody holds their breath. It does not help.']),
  S('3a', 3, 'Bilge Rats', 3, { kind: 'clear' }, ['3b'],
    ['Everything that drained out of the world ends up here: rats, slime, three centuries of hair.', 'A Rat Physician offers the Scholar a prescription. It is for “being stabbed”.'],
    ['The rats scatter. The slime splits. The Bilge is quieter, if no cleaner.']),
  S('3b', 3, 'Every Drain Leads Here', 2, { kind: 'survive', rounds: 6 }, ['3c'],
    ['The Bloatking has opened the sluices. Everything in the sewers is about to come through at once.', 'Hold the platform. Six rounds. Then the tide goes out and takes the stragglers with it.'],
    ['The flood ebbs. The union is soaked, filthy and alive. The Bloatking’s throne is in sight.']),
  S('3c', 3, 'Long May He Float', 3, { kind: 'boss', boss: 'bloatking' }, ['4a'],
    ['The Bloatking drifts on a raft of furniture. Every chair in it was somebody’s favourite.', '“Rent flows downhill,” he burbles, “and I am the bottom of the hill.”'],
    ['The Bloatking bursts. Skimmed rent sloshes across the Bilge in a warm, glowing wave.', 'He doesn’t float. A forest does: rafts of hollow trees drifting on the swell.']),
  S('4a', 4, 'Rafts of Root', 3, { kind: 'clear' }, ['4b'],
    ['The Driftwood creaks under the union’s boots. The wolves on board are thin, seasick and very interested.'],
    ['The raft steadies. Something in the trees is clapping slowly. It is a scarecrow. It has no hands.']),
  S('4b', 4, 'The Scarecrow Pickets', 3, { kind: 'destroy', monster: 'hollow_scarecrow', count: 2 }, ['4c'],
    ['The Hollow Scarecrows have formed a picket line. They are on strike. Nobody knows against whom.', 'Their crows are not on strike. Knock the scarecrows down.'],
    ['The scarecrows fall. The crows fly off to find a better union. Ours is full.']),
  S('4c', 4, 'Vexthorn’s Raft', 3, { kind: 'boss', boss: 'vexthorn' }, ['5a'],
    ['Vexthorn stands at the prow of the largest raft, antlers dripping, lantern-heart flickering.', 'The Executor has promised him a new forest. Vexthorn wants it very badly.'],
    ['Vexthorn’s lantern cracks, and the forest’s last Glowen soaks back into the rafts. They sprout. Just a little.', 'Downstream the sea starts to boil. The Slag Flats are on shift.']),
  S('5a', 5, 'Overtime', 3, { kind: 'clear' }, ['5b'],
    ['The Slag Flats are a factory floor half a mile wide. Cultists hammer swords out of the seabed, then melt them down again.', 'Nobody has had a break in two hundred years. The union has brought leaflets.'],
    ['Some of the cultists take a leaflet. Most of them set it on fire. It is a start.']),
  S('5b', 5, 'The Crucible Run', 4, { kind: 'escape' }, ['5c'],
    ['A Crucible Bearer has tipped the big crucible. Molten slag is pouring across the Flats.', 'Run. Hit things on the way if you must, but run.'],
    ['The slag hardens behind the union into a wall shaped like a very surprised wave.']),
  S('5c', 5, 'The Foreman Clocks Back In', 3, { kind: 'boss', boss: 'foreman_ignatius' }, ['6a'],
    ['Foreman Ignatius rides his Anvil Golem across the boiling shallows, ringing a shift bell.', '“Union?” he roars. “Down here we have a word for unions. The word is SLAG.”'],
    ['Foreman Ignatius clocks out for good. The cultists put down their hammers. One of them asks Joe about membership.', 'The steam clears, and the sea beyond is frozen solid.']),
  S('6a', 6, 'The Frozen Choir', 3, { kind: 'destroy', monster: 'choir_acolyte', count: 3 }, ['6b'],
    ['The Choir Acolytes are singing their one note across the ice, and the note is freezing the union’s feet to the floor.', 'Stop the singing. Gently, if possible. Not at all gently, if not.'],
    ['The note stops. For the first time in four hundred years, the Rime Banks hear silence. Somebody coughs.']),
  S('6b', 6, 'Relics on the Tideline', 3, { kind: 'clear' }, ['6c'],
    ['The Reliquary’s treasures are strewn along the ice: the most-loved things in the world, brimming with Glowen.', 'The Executor wants them catalogued, then sold. His staff are already here.'],
    ['The relics are safe for now. Joe pockets a spoon. It is the best spoon he has ever held. He puts it back. Mostly.']),
  S('6c', 6, 'Re-frozen', 3, { kind: 'boss', boss: 'saint_aurelia' }, ['7a'],
    ['Saint Aurelia stands at the Reliquary door, frozen again by the Executor’s lawyers, furious about it.', '“I know you are not him,” she says. “But the contract says I must stop everyone. I am sorry. I am very good at it.”'],
    ['The ice lets go. Aurelia breathes out four hundred years. “Go and get him,” she says, and this time she does not turn to snow.', 'She points the way: down, toward the ticking.']),
  S('7a', 7, 'Tin Tide', 2, { kind: 'survive', rounds: 6 }, ['7b'],
    ['The Gearwreck lies on its side in the shallows. Tin Soldiers march out of it in step, wave after wave, like a clock that strikes soldiers.', 'Hold out until the mainspring runs down.'],
    ['The last Tin Soldier topples over in step. The Gearwreck’s ticking slows. Something deep inside is counting.']),
  S('7b', 7, 'The Ledger Room', 3, { kind: 'clear' }, ['7c'],
    ['Every drop of Glowen in the Shoal has a line in Tock’s ledgers. Every Joe has a page.', 'The Magisters are guarding the books. The union has questions about the books.'],
    ['Joe finds his page. It says OVERDUE, in very small and very angry handwriting. He tears it out and eats it. Again.']),
  S('7c', 7, 'Tock, Tock', 3, { kind: 'boss', boss: 'archmagister_tock' }, ['8a'],
    ['Archmagister Tock is winding the whole Gearwreck by hand, one turn per second, forever.', '“Probate,” he says, with enormous pleasure, “takes a very long time.”'],
    ['Tock winds down mid-sentence. The Gearwreck stops ticking, and the water around it starts to pull.', 'The Undertow. It drags toward a desk at the bottom of the sea.']),
  S('8a', 8, 'The Fine Print', 3, { kind: 'clear' }, ['8b'],
    ['The Undertow is all small print: paragraphs of it, swimming in the dark like eels.', 'Read none of it. Hit all of it.'],
    ['The Fine Print sinks. One clause floats back up. It says “subject to change”. Ominous.']),
  S('8b', 8, 'Eviction Proceedings', 4, { kind: 'escape' }, ['8c'],
    ['The Bailiffs have arrived to evict the union from the Shoal itself. They have paperwork. They have truncheons.', 'Get past them to the desk. The current is on your side, for once.'],
    ['The union washes up at the foot of an enormous desk. On it sits a photocopier, still warm.']),
  S('8c', 8, 'A Notarised Copy', 3, { kind: 'boss', boss: 'the_landlord' }, ['9a'],
    ['The Executor photocopied the Landlord from his own will and had the copy notarised. It is legally him.', '“You again,” says the copy, in a voice that is slightly too grey. “I don’t remember you. I remember the stain on the carpet.”'],
    ['The copy jams. It folds itself into a paper aeroplane and glides off into the dark.', 'The water drops away. It is Low Tide, and the floor of the Shoal is showing.']),
  S('9a', 9, 'Everything Washes Up', 4, { kind: 'clear' }, ['9b'],
    ['Low Tide shows the seabed: every zone, every monster, every lost spoon, all tangled together.', 'Crypt bones beside clockwork, mushrooms on anvils. Everything the Landlord ever owned, together at last, and angry.'],
    ['The seabed goes quiet. Ahead, a chair has been set out on the sand, facing a lectern.'], 0.6),
  S('9b', 9, 'The Low Tide', 2, { kind: 'survive', rounds: 8 }, ['9c'],
    ['The tide is turning back. When it comes in, everything the Executor has rehired comes in with it.', 'Hold the sandbar for eight rounds. The Executor does not start a reading until the room is full.'],
    ['The sea stops. It hangs there, a wall of glowing water, waiting for the reading to begin.'], 0.7),
  S('9c', 9, 'The Reading of the Will', 3, { kind: 'boss', boss: 'the_executor' }, [],
    ['The Executor stands at his lectern in the very bottom of the Shoal. He clears his throat. It takes a while.', '“I, the Landlord, being of sound mind and no body…” He looks up. “Ah. The Occupants. Do sit. This will take several hours.”'],
    ['The Executor drops the will. It dissolves in the Shoal like sugar in tea.', 'With no heir and no deed, the Glowen in the Shoal goes home, up every drain and every stair, to kettles, lamps and good spoons.', 'Far above, every light in Joe’s building flickers on at once. The union climbs back up. It takes all night. Nobody minds.'], 0.6),
];

export function scenarioById(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** Lines after the final scenario. */
export const EPILOGUE: readonly string[] = [
  'The Tenants’ Union held its last meeting in the boiler room at 4:12 in the morning.',
  'Motion: the stairs stay closed. Carried, unanimously. Gary abstained. Gary pays no rent.',
  'The Shoal is still down there, warm and shallow. Things still wash up. Now and then the union goes down for a look.',
  'Nobody believes them about the photocopier.',
];

export const DEFEAT_TITLES: readonly string[] = ['THE UNION HAS BEEN EVICTED', 'WASHED UP', 'THE TIDE WINS THIS ROUND', 'MOTION DEFEATED', 'BACK TO THE BOILER ROOM'];
export const DEFEAT_QUIPS: readonly string[] = [
  'The Executor has noted your attendance.',
  'Everyone is fine. Everyone is lying down on purpose.',
  'Short rests are free. Lost cards are not.',
  'Red means it ignores your shield. Blue means it hits everyone in the area.',
  'The union regroups in the boiler room. Someone puts the kettle on.',
  'Somewhere, Gary is slowly shaking his head.',
  'That was a learning experience. The lesson was “ow”.',
];

/** Riptide Delves: random side scenarios at any Depth already reached, for gold and XP. */
export const DELVE_NAMES: readonly string[] = ['Riptide Delve', 'Flotsam Run', 'Wreck Dive', 'Low-Water Scavenge', 'Tide Pool Brawl', 'Undercurrent', 'Jetsam Sweep'];
