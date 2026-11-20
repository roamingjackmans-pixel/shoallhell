// The boiler room: the Tenants' Union's hall between scenarios. Your union (characters), the campaign down
// through the Depths, Riptide Delves, online co-op, Tasks that unlock classes, Gary's stall, the Enhancer, the Boiler
// (donations for a blessing and the union's prosperity), and records.
import { save, saveNow, session, onSaveStatus } from '../app';
import { CLASS_CARDS } from '../data/cards';
import { CLASSES, CLASS_IDS, XP_LEVELS, MAX_LEVEL } from '../data/classes';
import { ITEMS } from '../data/items';
import { DEPTHS, HALL_LINES, type ScenarioDef } from '../data/story';
import { TASKS } from '../data/tasks';
import {
  buyItem,
  camp,
  checkmarks,
  classTaskProgress,
  MAX_CAMPAIGNS,
  newCampaign,
  chooseLevelCard,
  choosePerk,
  deepest,
  donate,
  DONATION,
  DONATION_BLESS,
  PROSPERITY_STEP,
  prosperity,
  shopDepth,
  handFor,
  levelUpOptions,
  loadout,
  SLOT_NAMES,
  slotCaps,
  slotUse,
  equipItem,
  unequipItem,
  type Slot,
  makeCharacter,
  makeDelve,
  maxHp,
  scenarioList,
  sellItem,
  taskProgress,
  type Character,
} from '../game/campaign';
import { api } from '../net/api';
import { heroPortrait } from '../render/hero';
import { cardEl } from './cardView';
import { clear, h, modal, toast } from './dom';
import { cardDef, heroCard } from '../game/rules';
import { enhancerTab } from './enhancer';
import { CHECKS_PER_PERK, CLASS_TASKS } from '../data/classTasks';
import { clearResume, getResume } from '../resume';
import { GAME_VERSION } from '../version';
import { friendBadge, friendsModal, onFriendsChange } from './friends';
import { inventoryEl } from './inventory';
import { CHIMES, getChime, getVolume, playChime, setChime, setVolume } from './sound';

export interface HallNav {
  play(sc: ScenarioDef, chars: Character[]): void;
  resume(): void;
  /** join a co-op lobby by code (friends list, invites) */
  joinLobby(code: string): void;
  /** the co-op room this tab is in, if any */
  inCoop?(): string | null;
  coop(chars: Character[]): void;
  signOut(): void;
  story(title: string, lines: readonly string[], after: () => void, sub?: string): void;
}

let tab = 'campaign';
let party: string[] = [];
// one save-status listener for the hall, however many times it is drawn
let saveListening = false;
let lastSaveStatus = '';
let currentSaveLabel: HTMLElement | null = null;

/** The tenants picked for the party in the hall (what co-op brings by default). */
export function partyIds(): string[] {
  return [...party];
}

export function hallScreen(root: HTMLElement, nav: HallNav): () => void {
  const s = session!;
  const p = s.profile;
  const k = camp(p);
  // clicking through the menus re-draws the hall: keep the page where it was instead of jumping to the top
  const prevScroll = (root.querySelector('.screen.hall-screen') as HTMLElement | null)?.scrollTop ?? 0;
  clear(root);
  const screen = h('div.screen.bgwater.hall-screen');
  root.appendChild(screen);
  const saveLabel = h('span.small.dim', s.mode === 'offline' ? 'Offline: saved on this device' : lastSaveStatus);
  currentSaveLabel = saveLabel;
  if (!saveListening) {
    saveListening = true;
    onSaveStatus((t) => {
      lastSaveStatus = t;
      if (currentSaveLabel) currentSaveLabel.textContent = t;
    });
  }

  const live = k.characters.filter((c) => !c.retired);
  party = party.filter((id) => live.some((c) => c.id === id));
  if (!party.length && live.length) party = live.slice(0, Math.min(2, live.length)).map((c) => c.id);

  const rerender = (): void => {
    save();
    hallScreen(root, nav);
  };

  // ---------------------------------------------------------------- header
  const head = h(
    'div.hall-head',
    h('h1.logo', 'SHOAL', h('span', 'L'), 'HELL'),
    h('div.col', { style: { gap: '2px' } }, h('div', h('b', 'The Boiler Room'), h('span.dim', ' · Tenants’ Union hall')), h('div.small.dim', HALL_LINES[Math.floor(Date.now() / 60000) % HALL_LINES.length])),
    h('div.grow'),
    h('button', { title: 'Switch between your campaigns, or start a new one', onclick: () => campaignsModal() }, `📜 ${k.name} ▾`),
    s.mode === 'online' ? h('button', { onclick: () => friendsModal(nav) }, '👥 Friends', friendBadge()) : '',
    saveLabel,
    h('button.tiny', { title: 'Difficulty and the turn chime', onclick: () => settingsModal() }, '⚙ Settings'),
    h('button.tiny', { onclick: () => accountModal(nav) }, s.mode === 'online' ? `👤 ${s.user.name}` : '👤 Offline'),
    h('span.tiny.dim', { title: 'Game version' }, `v${GAME_VERSION}`),
  );

  // ---------------------------------------------------------------- campaigns
  function campaignsModal(): void {
    const nameIn = h('input', { placeholder: 'New campaign name', maxlength: '32' }) as HTMLInputElement;
    const list = h('div.col');
    let close = (): void => undefined;
    const draw = (): void => {
      clear(list);
      for (const c of p.campaigns) {
        const live2 = c.characters.filter((x) => !x.retired);
        const depth = DEPTHS[deepest(c) - 1]!;
        const active = c.id === k.id;
        list.appendChild(
          h(
            `div.depth.row.wrap${active ? '' : ''}`,
            { style: active ? { borderColor: 'var(--glowen)' } : {} },
            h(
              'div.grow',
              h('b', c.name),
              active ? h('span.badge.new', ' playing') : '',
              h('div.small.dim', `Depth ${depth.n}: ${depth.name} · ${c.completed.length} scenarios won · ${live2.length} tenant${live2.length === 1 ? '' : 's'}${live2.length ? ` (${live2.map((x) => x.name).join(', ')})` : ''}${c.ending ? ' · finished' : ''}`),
            ),
            active ? '' : h('button.primary.tiny', { onclick: () => ((p.active = c.id), (party = []), save(), close(), hallScreen(root, nav)) }, 'Play this one'),
            h(
              'button.tiny',
              {
                onclick: () => {
                  const n = prompt('Rename the campaign', c.name);
                  if (n && n.trim()) {
                    c.name = n.trim().slice(0, 32);
                    save();
                    draw();
                  }
                },
              },
              'Rename',
            ),
            p.campaigns.length > 1
              ? h(
                  'button.tiny.danger',
                  {
                    onclick: () => {
                      if (!confirm(`Delete "${c.name}"? Its tenants and progress are gone for good. Unlocked classes, Tasks and records stay.`)) return;
                      p.campaigns = p.campaigns.filter((x) => x !== c);
                      if (p.active === c.id) p.active = p.campaigns[0]!.id;
                      save();
                      close();
                      hallScreen(root, nav);
                    },
                  },
                  'Delete',
                )
              : '',
          ),
        );
      }
    };
    draw();
    close = modal(
      h(
        'div.col',
        { style: { width: 'min(720px, 92vw)' } },
        h('h2', 'Campaigns'),
        h('div.small.dim', 'Each campaign has its own union of tenants and its own way down through the Depths. Unlocked classes, Tasks and records are shared by all of them.'),
        list,
        p.campaigns.length < MAX_CAMPAIGNS
          ? h(
              'div.row',
              nameIn,
              h(
                'button.primary',
                {
                  onclick: () => {
                    const c = newCampaign(nameIn.value || `Campaign ${p.campaigns.length + 1}`);
                    p.campaigns.push(c);
                    p.active = c.id;
                    party = [];
                    save();
                    close();
                    hallScreen(root, nav);
                  },
                },
                'Start a new campaign',
              ),
            )
          : h('div.small.dim', `You can keep up to ${MAX_CAMPAIGNS} campaigns.`),
      ),
    );
  }

  // ---------------------------------------------------------------- roster
  const roster = h('div.roster');
  roster.appendChild(h('h3', 'The union'));
  if (!live.length) roster.appendChild(h('div.small.dim', 'Nobody has signed up yet. Recruit your first tenant.'));
  for (const c of live) {
    const def = CLASSES[c.cls]!;
    const next = XP_LEVELS[c.level] ?? XP_LEVELS[MAX_LEVEL - 1]!;
    const prev = XP_LEVELS[c.level - 1] ?? 0;
    const sel = party.includes(c.id);
    const pending = c.pendingCards.length + c.pendingPerks;
    const card = h(
      `div.charcard${sel ? '.sel' : ''}`,
      heroPortrait(c.cls, 64),
      h(
        'div.col',
        { style: { gap: '3px' } },
        h('div.row', { style: { gap: '6px' } }, h('span.name', c.name), pending ? h('span.badge.alert', 'Level up!') : null, c.blessed ? h('span.badge.bless', { title: `${c.blessed} Bless cards in their modifier deck next scenario` }, '✧ Blessed') : null),
        h('div.small.dim', `${def.name} · level ${c.level} · ${maxHp(c)} HP · `, h('span.gold', `${c.gold} gold`)),
        h('div.bar', h('i', { style: { width: `${c.level >= MAX_LEVEL ? 100 : Math.round(((c.xp - prev) / Math.max(1, next - prev)) * 100)}%` } })),
        h(
          'div.row',
          { style: { gap: '4px' } },
          h(`button.tiny${sel ? '.on' : ''}`, { onclick: (e: Event) => (e.stopPropagation(), togglePart(c.id)) }, sel ? 'In the party' : 'Add to party'),
          h('button.tiny', { onclick: (e: Event) => (e.stopPropagation(), sheet(c)) }, 'Sheet'),
        ),
      ),
    );
    card.addEventListener('click', () => sheet(c));
    roster.appendChild(card);
  }
  roster.appendChild(h('button.primary', { onclick: () => recruit() }, '+ Recruit a tenant'));
  if (k.fund > 0) {
    roster.appendChild(
      h(
        'div.panel.col',
        { style: { padding: '8px 10px' } },
        h('div', 'Union fund: ', h('b.gold', `${k.fund} gold`), ' from finished Tasks.'),
        h(
          'button.tiny',
          {
            disabled: !live.length,
            onclick: () => {
              const share = Math.floor(k.fund / live.length);
              for (const c of live) c.gold += share;
              k.fund -= share * live.length;
              toast(`Each tenant gets ${share} gold.`);
              rerender();
            },
          },
          'Share it out',
        ),
      ),
    );
  }

  function togglePart(id: string): void {
    if (party.includes(id)) party = party.filter((x) => x !== id);
    else if (party.length < 4) party.push(id);
    else toast('A party is at most four heroes.');
    hallScreen(root, nav);
  }

  // ---------------------------------------------------------------- tabs
  const TABS: [string, string][] = [
    ['campaign', 'Campaign'],
    ['delve', 'Riptide Delve'],
    ['coop', 'Co-op'],
    ['tasks', 'Tasks'],
    ['shop', 'Gary’s Stall'],
    ['enhance', 'Enhancer'],
    ['boiler', 'The Boiler'],
    ['records', 'Records'],
  ];
  const doneTasks = p.tasksDone.length;
  const body = h('div.col', { style: { gap: '12px' } });
  const tabsEl = h(
    'div.tabs',
    TABS.map(([id, label]) => h(`button${tab === id ? '.on' : ''}`, { onclick: () => ((tab = id), hallScreen(root, nav)) }, label, id === 'tasks' ? h('span.small.dim', ` ${doneTasks}/${TASKS.length}`) : null)),
  );
  const partyChars = party.map((id) => k.characters.find((c) => c.id === id)!).filter(Boolean);
  const partyLine = h('div.small', partyChars.length ? `Party: ${partyChars.map((c) => `${c.name} (${CLASSES[c.cls]!.name} ${c.level})`).join(', ')}` : h('span.bad', 'Pick up to four tenants for your party (Add to party).'));

  const inRoom = nav.inCoop?.() ?? null;
  if (inRoom)
    body.appendChild(
      h(
        'div.depth.row.wrap',
        { style: { borderColor: 'var(--glowen)' } },
        h('div.grow', h('b', 'You are in a co-op lobby '), `(room ${inRoom}). Missions your host starts will bring you along from anywhere.`),
        h('button.primary', { onclick: () => nav.coop([]) }, 'Back to the lobby'),
      ),
    );
  const susp = getResume(s.user.id);
  if (susp)
    body.appendChild(
      h(
        'div.depth.row.wrap',
        { style: { borderColor: 'var(--glowen)' } },
        h('div.grow', h('b', 'Scenario in progress: '), `${susp.sc.name}, round ${susp.state.round}`),
        h('button.primary', { onclick: () => nav.resume() }, 'Resume'),
        h('button.tiny.danger', { onclick: () => (clearResume(), hallScreen(root, nav)) }, 'Abandon'),
      ),
    );
  if (tab === 'campaign') body.appendChild(campaignTab());
  else if (tab === 'delve') body.appendChild(delveTab());
  else if (tab === 'coop') body.appendChild(coopTab());
  else if (tab === 'tasks') body.appendChild(tasksTab());
  else if (tab === 'shop') body.appendChild(shopTab());
  else if (tab === 'enhance') body.appendChild(enhancerTab(live, partyChars[0] ?? live[0], (id) => ((party = [id, ...party.filter((x) => x !== id)].slice(0, 4)), hallScreen(root, nav)), rerender));
  else if (tab === 'boiler') body.appendChild(boilerTab());
  else body.appendChild(recordsTab());

  screen.appendChild(h('div.hall', head, h('div.panel', roster), h('div.panel.col', { style: { gap: '10px' } }, tabsEl, partyLine, body)));
  screen.scrollTop = prevScroll;

  // ---------------------------------------------------------------- campaign
  function campaignTab(): HTMLElement {
    const box = h('div.col');
    const list = scenarioList(k);
    const deep = deepest(k);
    box.appendChild(h('div.small.dim', 'Nine Depths down to the bottom of the Shoal. Each one ends with a boss that washed up there. Finished scenarios can be replayed for XP and gold.'));
    if (k.ending) box.appendChild(h('div.good', 'The Executor is beaten and the will dissolved. The Shoal is quiet... mostly. Replay any scenario, or go on Riptide Delves.'));
    for (const d of DEPTHS) {
      const scs = list.filter((x) => x.sc.depth === d.n);
      const open = d.n <= deep;
      const el = h(`div.depth${open ? '' : '.locked'}`);
      el.appendChild(h('div.row', h('b', `Depth ${d.n}: ${d.name}`), h('span.small.dim', d.tagline)));
      if (open) {
        for (const { sc, done, open: o } of scs) {
          el.appendChild(
            h(
              'div.scen',
              h('span', { style: { width: '30px' } }, done ? '✔' : o ? '•' : '🔒'),
              h('div.grow', h('div', sc.name), h('div.tiny.dim', objectiveLabel(sc))),
              o
                ? h(
                    'button.primary',
                    {
                      disabled: !partyChars.length,
                      onclick: () => {
                        if (!k.seenDepths.includes(d.n)) {
                          k.seenDepths.push(d.n);
                          save();
                          nav.story(`Depth ${d.n}: ${d.name}`, d.lines, () => nav.play(sc, partyChars), d.tagline);
                        } else nav.play(sc, partyChars);
                      },
                    },
                    done ? 'Replay' : 'Play',
                  )
                : h('span.small.dim', 'Locked'),
            ),
          );
        }
      } else el.appendChild(h('div.small.dim', 'Further down. Clear the Depth above to find the way.'));
      box.appendChild(el);
    }
    return box;
  }

  function objectiveLabel(sc: ScenarioDef): string {
    const o = sc.objective;
    switch (o.kind) {
      case 'clear':
        return `Clear ${sc.rooms} rooms`;
      case 'boss':
        return 'Boss';
      case 'escape':
        return 'Escape: reach the exit';
      case 'survive':
        return `Survive ${o.rounds} rounds`;
      case 'destroy':
        return `Destroy ${o.count} targets`;
    }
  }

  function delveTab(): HTMLElement {
    const seed = Math.floor(Date.now() / 1000) % 1000000;
    const sc = makeDelve(k, seed);
    return h(
      'div.col',
      h('h3', 'Riptide Delves'),
      h('div', 'A random dive at any Depth you have reached: new map, mixed monsters from every zone, gold and XP. Good for levelling up a new tenant.'),
      h('div.depth', h('b', sc.name), h('div.small.dim', objectiveLabel(sc))),
      h('div.row', h('button.primary', { disabled: !partyChars.length, onclick: () => nav.play(sc, partyChars) }, 'Dive in'), h('button', { onclick: () => hallScreen(root, nav) }, 'Reroll')),
    );
  }

  function coopTab(): HTMLElement {
    if (s.mode === 'offline')
      return h('div.col', h('h3', 'Online co-op'), h('div', 'Co-op needs an account: sign out and create one (it’s free), then bring friends with a 4-digit code or your friends list.'), h('button', { onclick: () => nav.signOut() }, 'Sign out'));
    return h(
      'div.col',
      h('h3', 'Online co-op (up to four players)'),
      h('div', 'Open a lobby and friends join it with the 4-digit code, an invite, or Join from their friends list. The lobby stays together for as many missions as you like: the host picks each one from their campaign and everyone comes along.'),
      h('div.small.dim', 'Everyone brings their own tenants (four heroes at the table in total), chooses them in the lobby, and keeps everything they earn.'),
      h('div.row', h('button.primary.big', { onclick: () => nav.coop(partyChars) }, inRoom ? 'Back to the lobby' : 'Co-op lobby'), h('button', { onclick: () => friendsModal(nav) }, '👥 Friends', friendBadge())),
    );
  }

  function tasksTab(): HTMLElement {
    const box = h('div.col');
    box.appendChild(h('div.small.dim', 'Union business. Finishing a Task unlocks a new class for recruiting, or pays the union fund.'));
    for (const t of TASKS) {
      const pr = taskProgress(p, t.id);
      const reward = t.cls ? `Unlocks: ${CLASSES[t.cls]!.name}${CLASSES[t.cls]!.isNew ? ' (new class)' : ''}` : `Reward: ${t.gold} gold`;
      box.appendChild(
        h(
          `div.task${pr.done ? '.done' : ''}`,
          h('div', h('b', t.name), pr.done ? h('span.good', ' ✔') : null, h('div.small', t.text), h('div.tiny.accent', reward)),
          h('div.col', { style: { justifyContent: 'center' } }, h('div.small.dim', `${pr.have} / ${pr.goal}`), h('div.bar', h('i', { style: { width: `${Math.round((pr.have / pr.goal) * 100)}%`, background: pr.done ? 'var(--good)' : '' } }))),
        ),
      );
    }
    return box;
  }

  function shopTab(): HTMLElement {
    const box = h('div.col');
    const buyer = partyChars[0] ?? live[0];
    box.appendChild(h('div', h('b', 'Gary pays no rent.'), h('span.dim', ' He has a stall by the boiler anyway. Buying for: ')));
    if (!buyer) {
      box.appendChild(h('div.dim', 'Recruit someone first. Gary only sells to tenants.'));
      return box;
    }
    const pickBuyer = h(
      'div.row.wrap',
      live.map((c) => h(`button.tiny${c.id === buyer.id ? '.on' : ''}`, { onclick: () => ((party = [c.id, ...party.filter((x) => x !== c.id)].slice(0, 4)), hallScreen(root, nav)) }, `${c.name} (${c.gold}g)`)),
    );
    box.appendChild(pickBuyer);
    const caps = slotCaps(buyer);
    const use = slotUse(buyer);
    const worn = loadout(buyer);
    box.appendChild(
      h(
        'div.small',
        `${buyer.name}'s slots: `,
        (['head', 'body', 'legs', 'hand', 'small'] as Slot[]).map((sl) => h(`span${use[sl] >= caps[sl] ? '.accent' : '.dim'}`, `${SLOT_NAMES[sl]} ${use[sl]}/${caps[sl]}   `)),
      ),
    );
    const depth = shopDepth(k);
    if (depth > deepest(k)) box.appendChild(h('div.small.good', `The union’s prosperity (${prosperity(k)}) has Gary stocking goods from as deep as Depth ${depth}.`));
    for (const it of Object.values(ITEMS)) {
      if (it.depth > depth) continue;
      const owned = buyer.items.includes(it.id);
      box.appendChild(
        h(
          'div.shopitem',
          h(
            'div',
            h('b', `${it.icon ?? ''} ${it.name}`),
            h('span.small.dim', ` · ${SLOT_NAMES[it.slot]} · ${it.use}`),
            owned ? h('span.small.good', worn.includes(it.id) ? ' · equipped' : ' · in the bag') : '',
            h('div.small', it.text),
          ),
          owned
            ? h('button.tiny', { onclick: () => (sellItem(buyer, it.id), rerender()) }, `Sell (${Math.floor(it.cost / 2)}g)`)
            : h('button.tiny', { disabled: buyer.gold < it.cost, onclick: () => { const e = buyItem(buyer, it.id); if (e) toast(e); rerender(); } }, `Buy ${it.cost}g`),
        ),
      );
    }
    // what Gary is still waiting on: more stock arrives with each Depth (or prosperity) the union reaches
    const later = Object.values(ITEMS).filter((it) => it.depth > depth);
    if (later.length) {
      const next = Math.min(...later.map((it) => it.depth));
      const soon = later.filter((it) => it.depth === next);
      box.appendChild(
        h(
          'div.depth',
          { style: { opacity: '0.8' } },
          h('div', h('b', 'On order: '), h('span.dim', `${later.length} more item${later.length === 1 ? '' : 's'} Gary can get once the union is deeper.`)),
          h('div.small', `Arriving at Depth ${next}: `, soon.map((it) => h('span', { title: 'Gary won’t say what it does yet.' }, `${it.icon ?? '📦'} ${it.name}   `))),
          h('div.tiny.dim', 'Reach the next Depth, or raise the union’s prosperity at the Boiler, and he’ll stock them.'),
        ),
      );
    }
    box.appendChild(
      h(
        'div.small.dim',
        'Each hero equips one helmet, one chest and one pair of shoes, two hand items (one if they fight with a two-handed weapon), and potions/utility items up to half their level, rounded up. A new item goes on if a slot is free, otherwise into the bag: swap things around in the Inventory on the hero’s sheet. Spent items come back on a long rest; consumed ones after the scenario.',
      ),
    );
    return box;
  }

  function boilerTab(): HTMLElement {
    const box = h('div.col', { style: { gap: '10px' } });
    const given = k.donated ?? 0;
    const pros = prosperity(k);
    const toNext = PROSPERITY_STEP - (given % PROSPERITY_STEP);
    box.append(
      h('div', h('b', 'The Boiler. '), h('span.dim', 'It keeps the whole building warm, and nobody has ever seen it switched off. Tenants feed it coins for luck. The coins come back out as something like grace.')),
      h(
        'div.depth',
        h('div', 'Union prosperity ', h('b.accent', String(pros)), h('span.dim', ` · ${given} gold given in this campaign · ${toNext} more for the next level`)),
        h('div.bar', h('i', { style: { width: `${Math.round(((given % PROSPERITY_STEP) / PROSPERITY_STEP) * 100)}%`, background: 'var(--glowen)' } })),
        h('div.small.dim', `Every ${PROSPERITY_STEP} gold raises prosperity by one. Gary stocks goods from Depths down to the union’s prosperity, even ones it has not reached yet (now Depth ${shopDepth(k)}).`),
      ),
    );
    if (!live.length) {
      box.appendChild(h('div.dim', 'Recruit someone first.'));
      return box;
    }
    for (const c of live) {
      box.appendChild(
        h(
          'div.shopitem',
          h(
            'div.row',
            { style: { gap: '10px' } },
            heroPortrait(c.cls, 40),
            h('div', h('b', c.name), h('span.small.dim', ` · ${c.gold} gold`), h('div.small', c.blessed ? h('span.good', `✧ Blessed: ${c.blessed} Bless cards go into their modifier deck next scenario.`) : h('span.dim', 'Not blessed.'))),
          ),
          h(
            'button.tiny',
            {
              disabled: !!c.blessed || c.gold < DONATION,
              title: c.blessed ? 'One blessing at a time: it is used up by the next scenario.' : '',
              onclick: () => {
                const err = donate(k, c);
                if (err) toast(err);
                else toast(`${c.name} feeds the Boiler ${DONATION} gold. It hums. ${DONATION_BLESS} Bless for the next scenario.`);
                rerender();
              },
            },
            `Donate ${DONATION}g`,
          ),
        ),
      );
    }
    box.appendChild(h('div.small.dim', `Donate ${DONATION} gold to put ${DONATION_BLESS} Bless cards (×2, removed once drawn) into that hero’s attack modifier deck for their next scenario, won or lost. One blessing at a time.`));
    return box;
  }

  function recordsTab(): HTMLElement {
    const st = p.stats;
    const rows: [string, number][] = [
      ['Scenarios won', st.scenariosWon ?? 0],
      ['Bosses defeated', st.bossesKilled ?? 0],
      ['Enemies defeated', st.kills ?? 0],
      ['Elites defeated', st.elitesKilled ?? 0],
      ['Damage dealt', st.damage ?? 0],
      ['Healing done', st.heals ?? 0],
      ['Elements infused', st.infusions ?? 0],
      ['Cards lost', st.cardsLost ?? 0],
      ['Times exhausted', st.exhaustions ?? 0],
      ['Gold earned', st.goldEarned ?? 0],
      ['Delves won', st.delvesWon ?? 0],
    ];
    return h(
      'div.col',
      h('h3', 'Union records'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 20px', width: 'max-content' } }, rows.map(([k, v]) => [h('span.dim', k), h('b', String(v))])),
      h('div.small.dim', `Classes unlocked: ${p.classes.length} of ${CLASS_IDS.length}. Retired tenants: ${k.characters.filter((c) => c.retired).length}.`),
    );
  }

  // ---------------------------------------------------------------- recruit
  function recruit(): void {
    let pick = p.classes[0]!;
    const nameIn = h('input', { placeholder: 'Name', maxlength: '24' }) as HTMLInputElement;
    const detail = h('div.col');
    const grid = h('div.classgrid');
    const draw = (): void => {
      clear(grid);
      for (const id of CLASS_IDS) {
        const def = CLASSES[id]!;
        const unlocked = p.classes.includes(id);
        const task = TASKS.find((t) => t.cls === id);
        const tile = h(
          `div.classtile${unlocked ? '' : '.locked'}${pick === id ? '.sel' : ''}`,
          heroPortrait(id, 72),
          h('div', h('b', def.name)),
          def.isNew ? h('span.badge.new', 'NEW') : null,
          unlocked ? h('div.tiny.dim', def.role.split(' · ')[0]) : h('div.tiny.dim', `🔒 ${task ? task.name : 'Locked'}`),
        );
        tile.addEventListener('click', () => {
          pick = id;
          draw();
        });
        grid.appendChild(tile);
      }
      const def = CLASSES[pick]!;
      const unlocked = p.classes.includes(pick);
      const task = TASKS.find((t) => t.cls === pick);
      clear(detail);
      detail.append(
        h('div.row', heroPortrait(pick, 110), h('div.col', { style: { gap: '4px' } }, h('h2', { style: { margin: 0 } }, def.name), h('div.accent', def.role), h('div.dim', def.blurb), h('div.small', `HP ${def.hp[0]} → ${def.hp[MAX_LEVEL - 1]} · Hand ${def.hand} cards${def.elem ? ` · ${def.elem}` : ''}`))),
        h('div.row', { style: { overflowX: 'auto', alignItems: 'flex-start', padding: '4px 0' } }, (CLASS_CARDS[pick] ?? []).filter((c) => c.level === 1).slice(0, 4).map((c) => cardEl(c, { small: true }))),
        unlocked
          ? h('div.row', nameIn, h('button.primary', { onclick: () => create() }, `Recruit ${def.name}`))
          : h('div.bad', `Locked. Task: ${task?.name} — ${task?.text}`),
      );
    };
    const create = (): void => {
      if (!p.classes.includes(pick)) return;
      const c = makeCharacter(nameIn.value || randomName(pick), pick);
      k.characters.push(c);
      if (party.length < 4) party.push(c.id);
      close();
      toast(`${c.name} joins the union.`);
      rerender();
    };
    draw();
    const close = modal(h('div.col', { style: { width: 'min(980px, 92vw)' } }, h('h2', 'Recruit a tenant'), grid, detail));
  }

  // ---------------------------------------------------------------- character sheet
  function sheet(c: Character): void {
    const def = CLASSES[c.cls]!;
    const content = h('div.col', { style: { width: 'min(1060px, 94vw)' } });
    let close = (): void => undefined;
    const draw = (): void => {
      clear(content);
      content.append(
        h(
          'div.row',
          heroPortrait(c.cls, 96),
          h(
            'div.col.grow',
            { style: { gap: '3px' } },
            h('h2', { style: { margin: 0 } }, c.name, h('span.dim', ` · ${def.name}`)),
            h('div', `Level ${c.level} · XP ${c.xp}${c.level < MAX_LEVEL ? ` / ${XP_LEVELS[c.level]}` : ' (max)'} · ${maxHp(c)} HP · `, h('span.gold', `${c.gold} gold`), ` · ${c.scenarios} scenarios`),
            h('div.small.dim', def.blurb),
          ),
          h('button.danger.tiny', { onclick: () => retire() }, 'Retire'),
        ),
      );
      // level-up card choice
      if (c.pendingCards.length) {
        const lvl = c.pendingCards[0]!;
        const opts = levelUpOptions(c, lvl);
        content.append(h('h3', `Level ${lvl}: choose a new card`), h('div.small.dim', 'Pick one card of your new level or lower to add to your pool.'));
        content.appendChild(
          h(
            'div.row.wrap',
            opts.map((id) => {
              const el = cardEl(cardDef(id));
              el.classList.add('pick');
              el.addEventListener('click', () => {
                chooseLevelCard(c, id);
                save();
                draw();
              });
              return el;
            }),
          ),
        );
        if (!opts.length) {
          c.pendingCards.shift();
          save();
        }
      }
      if (c.pendingPerks > 0) {
        content.append(h('h3', `Choose ${c.pendingPerks} perk${c.pendingPerks > 1 ? 's' : ''}`), h('div.small.dim', 'Perks change your attack modifier deck for good.'));
        content.appendChild(
          h(
            'div.row.wrap',
            def.perks.map(([text], i) => h('button.tiny', { disabled: c.perks.includes(i), onclick: () => (choosePerk(c, i), save(), draw()) }, c.perks.includes(i) ? `✔ ${text}` : text)),
          ),
        );
      } else if (c.perks.length) content.appendChild(h('div.small', 'Perks: ', c.perks.map((i) => def.perks[i]?.[0]).join(' · ')));
      // class tasks: three stages each; every stage is a checkmark, every three checkmarks a perk
      const ctasks = CLASS_TASKS[c.cls] ?? [];
      if (ctasks.length) {
        const marks = checkmarks(c);
        const toNext = CHECKS_PER_PERK - (marks % CHECKS_PER_PERK);
        const maxMarks = ctasks.length * 3;
        content.append(
          h('h3', 'Class tasks'),
          h(
            'div.small.dim',
            `Career goals for a ${def.name}. Each stage reached is a checkmark; every ${CHECKS_PER_PERK} checkmarks earn a perk for the modifier deck. Checkmarks: `,
            h('b.accent', `${marks} / ${maxMarks}`),
            marks < maxMarks ? ` (${toNext} more for the next perk)` : ' (all done)',
          ),
          h(
            'div.row.wrap',
            { style: { gap: '8px', alignItems: 'stretch' } },
            ctasks.map((t) => {
              const pr = classTaskProgress(c, t);
              const goal = pr.next ?? t.goals[2];
              return h(
                `div.task.ctask${pr.stages === 3 ? '.done' : ''}`,
                h('div', h('b', t.name), h('span.ctask-marks', ' ', [0, 1, 2].map((i) => h(`span.${i < pr.stages ? 'mark-on' : 'mark-off'}`, i < pr.stages ? '✔' : '○')))),
                h('div.small', `${t.text}: ${t.goals.join(' / ')}`),
                h('div.bar', h('i', { style: { width: `${Math.min(100, Math.round((pr.have / goal) * 100))}%`, background: pr.stages === 3 ? 'var(--good)' : '' } })),
                h('div.tiny.dim', pr.next === null ? `Done (${pr.have})` : `${pr.have} / ${pr.next} for stage ${pr.stages + 1}`),
              );
            }),
          ),
        );
      }
      // inventory: Dungeon Joe style paper doll and bag (only equipped items come into a scenario)
      content.append(
        h('h3', 'Inventory'),
        inventoryEl(c, () => {
          save();
          draw();
        }),
      );
      // hand selection
      if (!c.hand.length) c.hand = handFor(c);
      c.hand = c.hand.filter((id) => c.cards.includes(id));
      const chosen = new Set(c.hand);
      content.append(
        h('h3', `Hand: ${chosen.size} / ${def.hand} cards`),
        h(
          'div.small.dim',
          `You own ${c.cards.length} cards and bring ${def.hand} into a scenario. Click to swap cards in and out (bright = in your hand).${chosen.size < def.hand ? ' Empty slots are filled with your highest-level cards.' : ''}`,
        ),
      );
      const row = h('div.row.wrap', { style: { alignItems: 'flex-start' } });
      for (const id of c.cards) {
        const el = cardEl(heroCard(c, id), { small: true });
        el.classList.add('pick');
        if (!chosen.has(id)) el.classList.add('dimmed');
        el.addEventListener('click', () => {
          if (c.hand.includes(id)) c.hand = c.hand.filter((x) => x !== id);
          else if (c.hand.length < def.hand) c.hand = [...c.hand, id];
          else {
            toast(`Your hand is full (${def.hand}). Take a card out first.`);
            return;
          }
          save();
          draw();
        });
        row.appendChild(el);
      }
      content.appendChild(row);
    };
    const retire = (): void => {
      const conf = modal(
        h(
          'div.col',
          h('h2', `Retire ${c.name}?`),
          h('div', 'They hang up their gear and leave the union for good. Their gold goes to the union fund.'),
          h(
            'div.row',
            h('button.danger', { onclick: () => ((c.retired = true), (k.fund += c.gold), (c.gold = 0), conf(), close(), rerender()) }, 'Retire'),
            h('button', { onclick: () => conf() }, 'Keep them'),
          ),
        ),
      );
    };
    draw();
    close = modal(content, () => hallScreen(root, nav));
  }

  // ---------------------------------------------------------------- settings
  function settingsModal(): void {
    const body = h('div.col', { style: { width: 'min(520px, 92vw)', gap: '10px' } });
    const draw = (): void => {
      const chime = getChime();
      const vol = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(getVolume() * 100)), style: { flex: '1' } }) as HTMLInputElement;
      vol.addEventListener('change', () => (setVolume(Number(vol.value) / 100), playChime()));
      body.replaceChildren(
        h('h2', { style: { margin: 0 } }, '⚙ Settings'),
        h('h3', { style: { margin: '4px 0 0' } }, `Difficulty for “${k.name}”`),
        h(
          'div.row.wrap',
          { style: { gap: '8px' } },
          (
            [
              ['normal', 'Normal', 'Monsters have 15% less health than they used to. The way the union is meant to go down.'],
              ['hardcore', 'Hardcore', 'Monsters have 30% more health. For tenants who read the small print and signed anyway.'],
            ] as const
          ).map(([id, name, text]) =>
            h(
              `div.diffopt${k.difficulty === id ? '.on' : ''}`,
              { onclick: () => ((k.difficulty = id), save(), draw()) },
              h('b', name),
              h('div.small.dim', text),
            ),
          ),
        ),
        h('div.tiny.dim', 'Each campaign has its own difficulty. It applies to missions started from now on, solo or hosted in co-op.'),
        h('h3', { style: { margin: '8px 0 0' } }, 'Turn chime'),
        h('div.small.dim', 'Plays when it becomes one of your heroes’ turn. Saved in this browser.'),
        h(
          'div.col',
          { style: { gap: '4px' } },
          CHIMES.map((c) =>
            h(
              `div.chimeopt${chime === c.id ? '.on' : ''}`,
              h('label.grow', { style: { cursor: 'pointer' }, onclick: () => (setChime(c.id), playChime(c.id), draw()) }, `${chime === c.id ? '◉' : '○'} ${c.name}`),
              c.id === 'off' ? '' : h('button.tiny', { title: 'Preview', onclick: () => playChime(c.id) }, '▶'),
            ),
          ),
        ),
        h('div.row', { style: { gap: '8px', alignItems: 'center' } }, h('span.small', 'Volume'), vol, h('button.tiny', { onclick: () => playChime() }, 'Test')),
        h('button.primary', { onclick: () => close() }, 'Done'),
      );
    };
    draw();
    const close = modal(body, () => hallScreen(root, nav));
  }

  function accountModal(n: HallNav): void {
    const old = h('input', { type: 'password', placeholder: 'Current password' }) as HTMLInputElement;
    const nw = h('input', { type: 'password', placeholder: 'New password (8+)' }) as HTMLInputElement;
    const msg = h('div.err');
    const close = modal(
      h(
        'div.col',
        { style: { width: 'min(460px, 90vw)' } },
        h('h2', s.mode === 'online' ? s.user.name : 'Offline play'),
        s.mode === 'online' ? h('div.small.dim', s.user.email) : h('div.small.dim', 'Saved in this browser only.'),
        s.mode === 'online'
          ? h(
              'div.col',
              h('h3', 'Change password'),
              old,
              nw,
              msg,
              h(
                'button',
                {
                  onclick: async () => {
                    try {
                      await api.password(old.value, nw.value);
                      msg.textContent = 'Password changed.';
                    } catch (e) {
                      msg.textContent = e instanceof Error ? e.message : 'Failed.';
                    }
                  },
                },
                'Change password',
              ),
            )
          : null,
        h('div.row', h('button', { onclick: async () => (await saveNow(), close(), n.signOut()) }, s.mode === 'online' ? 'Sign out' : 'Back to sign-in')),
      ),
    );
  }

  return () => undefined;
}

const NAMES: Record<string, string[]> = {
  knight: ['Sir Brenda', 'Ser Colin', 'Dame Pat'],
  brute: ['Big Sue', 'Tiny', 'Dennis'],
  duelist: ['Rafe', 'Vivienne', 'Count Kevin'],
  scholar: ['Professor Mold', 'Agnes', 'Dr. Penhallow'],
  cleric: ['Father Ash', 'Sister Cinder'],
  spearman: ['Magnus', 'Brick'],
  hunter: ['Wren', 'Old Tom'],
  occultist: ['Brother Dawn', 'Seraphine'],
  berserker: ['Grizzle', 'Helga'],
  nobody: ['Joe', 'Also Joe', 'Joe (2)'],
  diver: ['Captain Brine', 'Mrs. Kettle'],
  notary: ['Mr. Clause', 'Ms. Ledger'],
  glowsmith: ['Ingrid', 'Rivet'],
  lamplighter: ['Old Lumen', 'Hattie Wick'],
};

function randomName(cls: string): string {
  const l = NAMES[cls] ?? ['Tenant'];
  return l[Math.floor(Math.random() * l.length)]!;
}
