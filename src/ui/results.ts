// After a scenario: what each of your heroes earned, levels gained, Tasks finished, classes and scenarios unlocked.
import { CLASSES } from '../data/classes';
import { ITEMS } from '../data/items';
import { scenarioById } from '../data/story';
import { TASKS } from '../data/tasks';
import type { Outcome } from '../game/campaign';
import { clear, h } from './dom';
import { titleArt } from './titleArt';

export function resultsScreen(root: HTMLElement, title: string, o: Outcome, cont: () => void, label = 'Back to the boiler room'): () => void {
  clear(root);
  const screen = h('div.screen');
  root.appendChild(screen);
  const stop = titleArt(screen);
  const panel = h('div.panel.col', { style: { width: 'min(720px, 94vw)', background: 'rgba(20,18,26,.94)', gap: '10px' } });
  panel.append(h('h1', { style: { margin: 0, color: o.won ? '#ffd24a' : '#ff6a5a' } }, o.won ? 'Victory' : 'Defeat'), h('div.dim', title));
  for (const r of o.heroes) {
    panel.appendChild(
      h(
        'div.depth',
        h('b', r.name),
        h('div', `+${r.xpGained} XP · `, h('span.gold', `+${r.goldGained} gold`)),
        r.levelUps ? h('div.good', `Level up! Open their sheet in the hall to choose a new card and a perk.`) : null,
        r.items.length ? h('div.accent', `Found: ${r.items.map((i) => ITEMS[i]?.name ?? i).join(', ')}`) : null,
      ),
    );
  }
  if (!o.heroes.length) panel.appendChild(h('div.dim', 'Your heroes earned nothing this time.'));
  for (const t of o.tasks) {
    const def = TASKS.find((x) => x.id === t);
    if (def) panel.appendChild(h('div.good', `Task complete: ${def.name}${def.gold ? ` (+${def.gold} gold to the union fund)` : ''}`));
  }
  for (const c of o.classes) panel.appendChild(h('div', { style: { color: 'var(--glowen)', fontWeight: '700' } }, `New class unlocked: ${CLASSES[c]?.name}! Recruit one in the hall.`));
  for (const s of o.newScenarios) panel.appendChild(h('div.accent', `New scenario: ${scenarioById(s)?.name ?? s}`));
  if (!o.won) panel.appendChild(h('div.small.dim', 'Defeat still keeps the XP and gold your heroes picked up. Rest, re-pick your hand and try again.'));
  panel.appendChild(h('button.primary.big', { onclick: () => (stop(), cont()) }, label));
  screen.appendChild(h('div.col', { style: { position: 'relative', alignItems: 'center', padding: '6vh 16px' } }, panel));
  return stop;
}
