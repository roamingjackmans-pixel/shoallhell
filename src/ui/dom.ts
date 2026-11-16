// Tiny DOM helpers: h('div.class#id', {attrs}, children).
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(sel: K | string, attrs?: Record<string, unknown> | Child, ...kids: Child[]): HTMLElement {
  const m = /^([a-z0-9]*)((?:[.#][\w-]+)*)$/i.exec(sel);
  const tag = (m?.[1] || 'div') as K;
  const el = document.createElement(tag);
  for (const part of (m?.[2] ?? '').match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  let children = kids;
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) children = [attrs as Child, ...kids];
  else if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  add(el, children);
  return el;
}

function add(el: HTMLElement, kids: Child[]): void {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function clear(el: HTMLElement): HTMLElement {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

let toastTimer = 0;
export function toast(text: string, ms = 2200): void {
  document.querySelector('.toast')?.remove();
  const t = h('div.toast', text);
  document.getElementById('app')!.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), ms);
}

export function modal(content: HTMLElement, onClose?: () => void): () => void {
  const m = h('div.modal', h('div.panel', content));
  const close = (): void => {
    m.remove();
    onClose?.();
  };
  m.addEventListener('pointerdown', (e) => {
    if (e.target === m) close();
  });
  document.getElementById('app')!.appendChild(m);
  return close;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
