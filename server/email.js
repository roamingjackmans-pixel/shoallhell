// Sending email (password-reset codes) for the shared accounts. Uses Resend (https://resend.com) when
// RESEND_API_KEY and EMAIL_FROM are set; EMAIL_PROVIDER=file writes each email to <data>/outbox (tests);
// with neither, email is off and "Forgot password?" says so. Modelled on Roleplay20's server/email.js.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.js';

const provider = () => process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? 'resend' : 'off');

export function emailReady() {
  return provider() === 'file' || (provider() === 'resend' && !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function renderCodeEmail({ heading, lines, code }) {
  const text = [heading, '', ...lines, '', `Your code: ${code}`].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#15111a;padding:24px;font-family:Georgia,serif;color:#efe6d6">
<div style="max-width:520px;margin:0 auto;background:#1e1826;border:1px solid #3a3040;border-radius:12px;padding:24px">
<div style="font-size:20px;font-weight:bold;letter-spacing:.04em">josephjackman.com <span style="color:#e0b354">games</span></div>
<h2 style="font-size:18px;margin:14px 0">${esc(heading)}</h2>
${lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:8px 0">${esc(l)}</p>`).join('\n')}
<div style="font-family:Consolas,monospace;font-size:34px;letter-spacing:10px;font-weight:bold;text-align:center;background:#2a2230;border-radius:10px;padding:14px;margin:16px 0;color:#f2c76e">${esc(code)}</div>
<p style="font-size:12px;color:#a89cb0">If you didn't ask for this, you can ignore it: your password stays the same.</p>
</div></body></html>`;
  return { text, html };
}

export async function sendEmail({ to, subject, text, html }) {
  if (!emailReady()) throw new Error('Email is not set up on this server.');
  if (provider() === 'file') {
    const dir = path.join(DATA_DIR, 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`), JSON.stringify({ to, subject, text, html, at: Date.now() }, null, 2));
    return { ok: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (await res.json()).message || msg;
    } catch {
      /* not JSON */
    }
    console.error('[email] Resend refused the email:', msg);
    throw new Error("The email couldn't be sent. Try again in a minute.");
  }
  return { ok: true };
}
