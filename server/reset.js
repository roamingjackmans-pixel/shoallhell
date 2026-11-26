// "Forgot password?": a 6-digit code by email (10 minutes, 3 tries), then a new password signs you in.
// Codes live in memory (a restart just means asking for a new one). The answer never says whether an email has an
// account, and a code can be requested once a minute per email.
import crypto from 'node:crypto';
import { issueSession, publicUser, revokeSessions, setPassword, userByEmail } from './auth.js';
import { emailReady, renderCodeEmail, sendEmail } from './email.js';
import { clientIp, sha256 } from './security.js';

const CODE_MS = 10 * 60 * 1000;
const codes = new Map(); // email -> { hash, exp, tries, sentAt }
const ipHits = new Map(); // ip -> { n, until }

function limited(ip) {
  const now = Date.now();
  const r = ipHits.get(ip);
  if (!r || r.until < now) {
    ipHits.set(ip, { n: 1, until: now + 10 * 60 * 1000 });
    return false;
  }
  r.n++;
  return r.n > 6;
}

export function mountReset(api) {
  api.post('/password/forgot', async (req, res) => {
    if (!emailReady()) return res.status(503).json({ error: 'Password reset by email isn’t switched on yet. Ask the site owner.' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || email.length > 120) return res.status(400).json({ error: 'Type the email you signed up with.' });
    if (limited(clientIp(req))) return res.status(429).json({ error: 'Too many tries. Wait a few minutes.' });
    const prev = codes.get(email);
    if (prev && Date.now() - prev.sentAt < 60000) return res.json({ ok: true, sent: true });
    const user = userByEmail(email);
    if (user) {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      codes.set(email, { hash: sha256(code), exp: Date.now() + CODE_MS, tries: 3, sentAt: Date.now() });
      const { text, html } = renderCodeEmail({ heading: 'Reset your password', lines: [`Hi ${user.name}. Someone (hopefully you) asked to reset the password for your games account.`, 'Type this code in the game. It works for 10 minutes.'], code });
      try {
        await sendEmail({ to: user.email, subject: `Your password reset code: ${code}`, text, html });
      } catch (e) {
        codes.delete(email);
        return res.status(502).json({ error: e.message });
      }
    }
    res.json({ ok: true, sent: true });
  });

  api.post('/password/reset', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const password = req.body?.password;
    const entry = codes.get(email);
    if (!entry || entry.exp < Date.now()) {
      codes.delete(email);
      return res.status(400).json({ error: 'That code has expired. Ask for a new one.' });
    }
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Passwords need at least 8 characters.' });
    if (password.length > 200) return res.status(400).json({ error: 'That password is too long.' });
    const a = Buffer.from(sha256(code));
    const b = Buffer.from(entry.hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      entry.tries--;
      if (entry.tries <= 0) {
        codes.delete(email);
        return res.status(400).json({ error: 'That code isn’t right, and it’s used up. Ask for a new one.' });
      }
      return res.status(400).json({ error: `That code isn’t right. ${entry.tries} ${entry.tries === 1 ? 'try' : 'tries'} left.` });
    }
    const user = userByEmail(email);
    codes.delete(email);
    if (!user) return res.status(400).json({ error: 'That code has expired. Ask for a new one.' });
    setPassword(user, password);
    revokeSessions(user.id);
    res.json({ token: issueSession(user.id), user: publicUser(user) });
  });
}
