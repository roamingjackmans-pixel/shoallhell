// Ability cards as HTML: name, level, initiative in the middle, the top half above and the bottom half below.
import { CLASSES } from '../data/classes';
import { monsterDef, SUMMONS } from '../data/monsters';
import type { Card, Consume, Half, MonsterAbility, MonsterStat, Step } from '../game/types';
import { h } from './dom';

const COND_NAME: Record<string, string> = {
  poison: 'Poison',
  wound: 'Wound',
  immobilize: 'Immobilize',
  disarm: 'Disarm',
  stun: 'Stun',
  muddle: 'Muddle',
  strengthen: 'Strengthen',
  invisible: 'Invisible',
  regenerate: 'Regenerate',
};
const AOE: Record<string, string> = { cleave: 'Cleave (2 spaces)', line2: 'Line of 2', line3: 'Line of 3', cone: 'Cone', ring: 'All adjacent', blast: 'Blast 3×3', cross: 'Cross' };

function useText(u: Consume): string {
  const el = u.el === 'any' ? 'any element' : u.el[0]!.toUpperCase() + u.el.slice(1);
  const bits: string[] = [];
  if (u.text) bits.push(u.text);
  else {
    if (u.n) bits.push(`+${u.n}`);
    if (u.range) bits.push(`+${u.range} Range`);
    if (u.targets) bits.push(`+${u.targets} Target`);
    if (u.cond?.length) bits.push(u.cond.map((c) => COND_NAME[c]).join(', '));
    if (u.heal) bits.push(`Heal ${u.heal}`);
    if (u.pierce) bits.push(`Pierce ${u.pierce}`);
    if (u.push) bits.push(`Push ${u.push}`);
    if (u.shield) bits.push(`+${u.shield} Shield`);
  }
  return `Spend ${el}: ${bits.join(', ')}`;
}

export function stepText(st: Step): string {
  switch (st.t) {
    case 'move':
      return `<b>Move ${st.n}</b>${st.jump ? ' · Jump' : ''}`;
    case 'attack': {
      const bits = [`<b>Attack ${st.n}</b>`];
      if (st.range) bits.push(`Range ${st.range}`);
      if (st.all) bits.push('every enemy in range');
      if (st.targets && st.targets > 1) bits.push(`${st.targets} targets`);
      if (st.aoe) bits.push(AOE[st.aoe] ?? st.aoe);
      if (st.pierce) bits.push(`Pierce ${st.pierce}`);
      if (st.push) bits.push(`Push ${st.push}`);
      if (st.pull) bits.push(`Pull ${st.pull}`);
      if (st.type && st.type !== 'physical') bits.push(`<span class="el-${st.type}">${st.type[0]!.toUpperCase() + st.type.slice(1)}</span>`);
      if (st.cond?.length) bits.push(st.cond.map((c) => COND_NAME[c]).join(', '));
      if (st.drain) bits.push(`heal self ${st.drain}`);
      if (st.selfDmg) bits.push(`<span class="bad">suffer ${st.selfDmg}</span>`);
      return bits.join(' · ');
    }
    case 'heal':
      return `<b>Heal ${st.n}</b>${st.self || !st.range ? ' · self' : ` · Range ${st.range}`}${st.all ? ' · all allies' : ''}${st.cond?.length ? ' · ' + st.cond.map((c) => COND_NAME[c]).join(', ') : ''}`;
    case 'shield':
      return `<b>Shield ${st.n}</b>${st.range ? ` · ${st.all ? 'allies within' : 'ally within'} ${st.range}` : ''}`;
    case 'retaliate':
      return `<b>Retaliate ${st.n}</b>${st.range ? ` · Range ${st.range}` : ''}`;
    case 'buff':
      return `<b>${st.cond.map((c) => COND_NAME[c]).join(', ')}</b>${st.range ? ` · ${st.all ? 'allies within' : 'ally within'} ${st.range}` : ' · self'}`;
    case 'loot':
      return `<b>Loot ${st.n}</b>`;
    case 'infuse':
      return `Infuse <b class="el-${st.el}">${st.el[0]!.toUpperCase() + st.el.slice(1)}</b>`;
    case 'summon': {
      const s = SUMMONS[st.id];
      return s ? `<b>Summon ${s.name}</b> <span class="sub">(${s.hp} HP${s.move ? `, Move ${s.move}` : ''}${s.atk ? `, Attack ${s.atk}${s.range ? ` R${s.range}` : ''}` : ''}${s.healer ? `, heals ${s.healer}` : ''})</span>` : 'Summon';
    }
    case 'recover':
      return `<b>Recover ${st.n}</b> <span class="sub">discarded card${st.n > 1 ? 's' : ''}</span>`;
    case 'bless':
      return `<b>Bless ${st.n}</b>${st.range ? ` · ally within ${st.range}` : ' · self'}`;
    case 'curse':
      return `<b>Curse ${st.n}</b> · Range ${st.range}`;
    case 'teleport':
      return `<b>Teleport ${st.n}</b>`;
    case 'xp':
      return '';
  }
}

function halfEl(c: Card, which: 'top' | 'bot', half: Half, cls: string): HTMLElement {
  const el = h(`div.half.${which}`);
  for (const st of half.steps) {
    const txt = stepText(st);
    if (txt) el.appendChild(h('span.step', { html: txt }));
    const u = (st as { use?: Consume }).use;
    if (u) el.appendChild(h(`span.use.el-${u.el === 'any' ? 'holy' : u.el}`, useText(u)));
  }
  if (half.persist) el.appendChild(h('span.persist', `◆ ${half.persist.text}`));
  const xp = half.steps.reduce((n, s) => n + ('xp' in s && typeof s.xp === 'number' ? s.xp : 0), 0) + (half.xp ?? 0);
  if (xp) el.appendChild(h('span.xp', `+${xp} XP`));
  if (half.lost) el.appendChild(h('span.lost', '✖ LOST after use'));
  void c;
  void cls;
  return el;
}

export function cardEl(c: Card, opts: { small?: boolean } = {}): HTMLElement {
  const cls = CLASSES[c.cls];
  const el = h(`div.card${opts.small ? '.small' : ''}`, { style: { '--cls': cls?.color ?? '#555' } as unknown as Record<string, string> });
  el.style.setProperty('--cls', cls?.color ?? '#555');
  el.appendChild(h('div.ch', h('span', c.name), h('span.lvl', `Lv ${c.level}`)));
  el.appendChild(halfEl(c, 'top', c.top, c.cls));
  el.appendChild(h('div.init', String(c.init).padStart(2, '0')));
  el.appendChild(halfEl(c, 'bot', c.bot, c.cls));
  if (c.flavor && !opts.small) el.appendChild(h('div.flavor', c.flavor));
  el.title = `${c.name} — initiative ${c.init}`;
  return el;
}

/** A monster's ability card for this round, with its numbers worked out from the stat line. */
export function abilityEl(monsterId: string, ab: MonsterAbility, stat: MonsterStat | null): HTMLElement {
  const def = monsterDef(monsterId);
  const lines: string[] = [];
  if (ab.summon) lines.push(`<b>${ab.text ?? 'Summons help'}</b>`);
  if (ab.heal) lines.push(`<b>Heal ${ab.heal.n}</b> · ally within ${ab.heal.range}`);
  if (ab.shield) lines.push(`<b>Shield ${ab.shield}</b>`);
  if (ab.retaliate) lines.push(`<b>Retaliate ${ab.retaliate}</b>`);
  if (ab.move !== null) lines.push(`<b>Move ${stat ? Math.max(0, stat.move + ab.move) : (ab.move >= 0 ? '+' : '') + ab.move}</b>${ab.jump ? ' · leaps' : ''}`);
  if (ab.atk !== null) {
    const r = ab.range ?? stat?.range ?? 0;
    const bits = [`<b>Attack ${stat ? Math.max(0, stat.atk + ab.atk) : (ab.atk >= 0 ? '+' : '') + ab.atk}</b>`];
    if (ab.blue) bits.push(`every hero within ${Math.max(1, r)}`);
    else if (r) bits.push(`Range ${r}`);
    if (ab.targets && ab.targets > 1) bits.push(`${ab.targets} targets`);
    if (ab.push) bits.push(`Push ${ab.push}`);
    if (ab.pull) bits.push(`Pull ${ab.pull}`);
    if (ab.type && ab.type !== 'physical') bits.push(`<span class="el-${ab.type}">${ab.type}</span>`);
    if (ab.cond?.length) bits.push(ab.cond.map((c) => COND_NAME[c]).join(', '));
    lines.push(bits.join(' · '));
  }
  if (ab.infuse) lines.push(`Infuse <span class="el-${ab.infuse}">${ab.infuse}</span>`);
  const el = h('div.mcard');
  el.appendChild(h('div.t', h('span', ab.name), h('span.accent', String(ab.init).padStart(2, '0'))));
  if (ab.red) el.appendChild(h('div.redtag', 'RED · ignores Shield'));
  if (ab.blue) el.appendChild(h('div.bluetag', 'BLUE · hits the whole area'));
  for (const l of lines) el.appendChild(h('div', { html: l }));
  el.appendChild(h('div.tiny.dim', def.name));
  return el;
}

export function condName(c: string): string {
  return COND_NAME[c] ?? c;
}
