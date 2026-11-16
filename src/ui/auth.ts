// Sign in / create an account with email and password (like Roleplay20), or play offline on this device.
import { startOffline, startOnline, type Session } from '../app';
import { SUBTITLE } from '../data/story';
import { api } from '../net/api';
import { clear, h } from './dom';
import { titleArt } from './titleArt';

export function authScreen(root: HTMLElement, done: (s: Session) => void): () => void {
  clear(root);
  const screen = h('div.screen');
  root.appendChild(screen);
  const stopArt = titleArt(screen);
  let mode: 'login' | 'signup' = 'login';
  const err = h('div.err');
  const email = h('input', { type: 'email', placeholder: 'Email', autocomplete: 'email', style: { width: '100%' } }) as HTMLInputElement;
  const pass = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', style: { width: '100%' } }) as HTMLInputElement;
  const pass2 = h('input', { type: 'password', placeholder: 'Password again', autocomplete: 'new-password', style: { width: '100%' } }) as HTMLInputElement;
  const name = h('input', { type: 'text', placeholder: 'Your name in the union (optional)', maxlength: '24', style: { width: '100%' } }) as HTMLInputElement;
  const go = h('button.primary.big', { style: { width: '100%' } }, 'Sign in') as HTMLButtonElement;
  const tabs = h('div.tabs');
  const extra = h('div.col');
  const form = h(
    'form.col',
    { style: { width: '100%' } },
    email,
    pass,
    extra,
    err,
    go,
  );
  const panel = h(
    'div.panel.col',
    { style: { width: 'min(420px, 92vw)', gap: '10px', background: 'rgba(20,18,26,.92)' } },
    tabs,
    form,
    h('div.small.dim.center', 'Your union, heroes and campaign are saved to your account and follow you to any device.'),
    h('button', { onclick: () => done(startOffline()) }, 'Play offline on this device'),
    h('div.tiny.dim.center', 'Offline play saves in this browser only, and online co-op needs an account.'),
  );
  const wrap = h(
    'div.col',
    { style: { position: 'relative', minHeight: '100%', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '6vh', gap: '18px' } },
    h('h1.logo', 'SHOAL', h('span', 'L'), 'HELL'),
    h('div.tagline', SUBTITLE),
    panel,
  );
  screen.appendChild(wrap);

  const setMode = (m: 'login' | 'signup'): void => {
    mode = m;
    clear(tabs);
    tabs.append(
      h(`button${m === 'login' ? '.on' : ''}`, { type: 'button', onclick: () => setMode('login') }, 'Sign in'),
      h(`button${m === 'signup' ? '.on' : ''}`, { type: 'button', onclick: () => setMode('signup') }, 'Create account'),
    );
    clear(extra);
    if (m === 'signup') {
      pass.placeholder = 'Password (8+ characters)';
      pass.autocomplete = 'new-password';
      extra.append(pass2, name);
    } else {
      pass.placeholder = 'Password';
      pass.autocomplete = 'current-password';
    }
    go.textContent = m === 'login' ? 'Sign in' : 'Create account';
    err.textContent = '';
  };
  setMode('login');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (mode === 'signup' && pass.value !== pass2.value) {
      err.textContent = 'The two passwords don’t match.';
      return;
    }
    go.disabled = true;
    try {
      const r = mode === 'login' ? await api.login(email.value, pass.value) : await api.signup(email.value, pass.value, name.value);
      startOnline(r.user, null, 0, r.token);
      const me = await api.me();
      done(startOnline(me.user, me.profile, me.rev));
    } catch (x) {
      err.textContent = x instanceof Error ? x.message : 'Something went wrong.';
    } finally {
      go.disabled = false;
    }
  });
  setTimeout(() => email.focus(), 50);
  return stopArt;
}
