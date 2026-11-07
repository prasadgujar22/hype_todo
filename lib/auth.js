import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
// OWASP's scrypt fallback profile: 32 MiB, N=2^15, r=8, p=3.
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const FORMAT = 'scrypt:32768:8:3';
// For a missing account, do the same expensive derivation as for a real one.
const DUMMY_SALT = Buffer.alloc(16).toString('base64url');
const DUMMY_HASH = `${FORMAT}:${Buffer.alloc(64).toString('base64url')}`;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), 64, SCRYPT);
  return { passwordSalt: salt, passwordHash: `${FORMAT}:${key.toString('base64url')}` };
}

export async function verifyPassword(password, salt = DUMMY_SALT, encoded = DUMMY_HASH) {
  const parts = typeof encoded === 'string' ? encoded.split(':') : [];
  const validFormat = parts.length === 5 && parts.slice(0, 4).join(':') === FORMAT;
  let expected;
  let saltBytes;
  try {
    expected = validFormat ? Buffer.from(parts[4], 'base64url') : Buffer.alloc(64);
    saltBytes = typeof salt === 'string' ? Buffer.from(salt, 'base64url') : Buffer.alloc(16);
  } catch {
    expected = Buffer.alloc(64);
    saltBytes = Buffer.alloc(16);
  }
  const validInputs = validFormat && expected.length === 64 && saltBytes.length === 16;
  if (!validInputs) {
    expected = Buffer.alloc(64);
    saltBytes = Buffer.alloc(16);
  }
  const actual = await scrypt(password, saltBytes, 64, SCRYPT);
  return timingSafeEqual(actual, expected) && validInputs;
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function readSessionToken(req) {
  const header = req.headers.cookie || '';
  for (const item of header.split(';')) {
    const [name, ...value] = item.trim().split('=');
    if (name === 'hype_session') {
      const token = value.join('=');
      return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
    }
  }
  return null;
}

export function sessionCookie(token, { secure = false, maxAge = 30 * 24 * 60 * 60 } = {}) {
  return `hype_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
