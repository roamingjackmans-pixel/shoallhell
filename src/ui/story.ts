// Story cards: lines fade in one at a time over the glowing Shoal. Click or press a key to hurry, then to continue.
import { clear, h } from './dom';
import { titleArt } from './titleArt';

export function storyScreen(root: HTMLElement, title: string, lines: readonly string[], done: () => void, sub?: string): () => void {
  clear(root);
  const screen = h('div.screen');
  root.appendChild(screen);
  const stop = titleArt(screen);
  const box = h('div.story');
  const btn = h('button.primary.big', { style: { visibility: 'hidden' } }, 'Continue');
  screen.appendChild(
    h(
      'div.col',
      { style: { position: 'relative', alignItems: 'center', padding: '7vh 20px', gap: '18px', background: 'radial-gradient(ellipse at 50% 30%, rgba(7,6,11,.85), rgba(7,6,11,.2) 70%)', minHeight: '100%' } },
      h('h1', { style: { margin: '0', color: 'var(--accent)' } }, title),
      sub ? h('div.tagline', sub) : null,
      box,
      btn,
    ),
  );
  const ps = lines.map((l) => {
    const p = h('p', l);
    box.appendChild(p);
    return p;
  });
  let i = 0;
  let timer = 0;
  const next = (): void => {
    if (i < ps.length) {
      ps[i++]!.classList.add('on');
      timer = window.setTimeout(next, 1500);
    } else btn.style.visibility = 'visible';
  };
  timer = window.setTimeout(next, 300);
  const finish = (): void => {
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey);
    stop();
    done();
  };
  const hurry = (): void => {
    if (i < ps.length) {
      clearTimeout(timer);
      while (i < ps.length) ps[i++]!.classList.add('on');
      btn.style.visibility = 'visible';
    } else finish();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') hurry();
  };
  window.addEventListener('keydown', onKey);
  screen.addEventListener('click', (e) => {
    if (e.target === btn) finish();
    else hurry();
  });
  return () => {
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey);
    stop();
  };
}
