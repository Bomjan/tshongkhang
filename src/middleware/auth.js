import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './errors.js';

const scrypt = promisify(scryptCallback);
const cookieName = 'tshongkhang_session';
const sessionSeconds = 60 * 60 * 24 * 7;
export const sellerColumns = 'id, slug, business_name, email, phone, location, description, logo_url, created_at';
export const publicSellerColumns = 'id, slug, business_name, phone, location, description, logo_url, created_at';

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  // Do the expensive work even for an unknown email or a legacy account.
  const [salt, expected] = (stored || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const actual = await scrypt(password, salt, 64);
  const saved = Buffer.from(expected, 'hex');
  return saved.length === actual.length && timingSafeEqual(actual, saved) && Boolean(stored);
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function readToken(req) {
  const cookie = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`));
  const token = cookie?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}

const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });

export async function startSession(pool, res, sellerId) {
  const token = randomBytes(32).toString('hex');
  await pool.query('DELETE FROM seller_sessions WHERE expires_at <= now()');
  await pool.query(`INSERT INTO seller_sessions (token_hash, seller_id, expires_at)
    VALUES ($1, $2, now() + interval '7 days')`, [tokenHash(token), sellerId]);
  res.cookie(cookieName, token, { ...cookieOptions(), maxAge: sessionSeconds * 1000 });
}

export async function endSession(pool, req, res) {
  const token = readToken(req);
  if (token) await pool.query('DELETE FROM seller_sessions WHERE token_hash = $1', [tokenHash(token)]);
  res.clearCookie(cookieName, cookieOptions());
}

export function requireSeller(pool) {
  return async (req, res, next) => {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Log in to continue');
    const result = await pool.query(`SELECT ${sellerColumns.split(', ').map(field => `s.${field}`).join(', ')}
      FROM seller_sessions ss JOIN sellers s ON s.id = ss.seller_id
      WHERE ss.token_hash = $1 AND ss.expires_at > now()`, [tokenHash(token)]);
    if (!result.rowCount) throw new HttpError(401, 'Your session has expired. Log in again');
    req.seller = result.rows[0];
    next();
  };
}

export function ownSeller(req, res, next) {
  if (req.seller.id !== req.validated.params.id) throw new HttpError(403, 'You can only change your own store');
  next();
}

// A small in-memory limit is sufficient for the single-server semester demo.
export function attemptLimit(max = 20, windowMs = 15 * 60 * 1000) {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + windowMs };
    if (attempts.size >= 10000 && !attempts.has(key)) throw new HttpError(429, 'Too many requests. Try again later');
    attempts.set(key, entry);
    if (++entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      throw new HttpError(429, 'Too many attempts. Try again later');
    }
    next();
  };
}
