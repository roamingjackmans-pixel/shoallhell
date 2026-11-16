// Password hashing (scrypt), random tokens and client IP detection (from Roleplay20).
import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, SCRYPT).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(String(password), salt, expected.length, SCRYPT);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function randomId(prefix = '', bytes = 9) {
  return prefix + crypto.randomBytes(bytes).toString('base64url').replace(/[-_]/g, 'x');
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('base64url');
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function clientIp(reqOrSocket) {
  const remote = reqOrSocket.socket?.remoteAddress || reqOrSocket.conn?.remoteAddress || reqOrSocket.handshake?.address || '';
  const headers = reqOrSocket.headers || reqOrSocket.handshake?.headers || {};
  if (process.env.FLY_APP_NAME && headers['fly-client-ip']) return String(headers['fly-client-ip']).trim();
  if (LOOPBACK.has(remote)) {
    const xff = headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return remote.replace('::ffff:', '') || 'unknown';
}
