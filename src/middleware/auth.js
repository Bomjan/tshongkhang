import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';

export function authenticate(pool, config) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.get('Authorization') || '');
    if (!match) throw new HttpError(401, 'A Bearer token is required');
    let claims;
    try {
      claims = jwt.verify(match[1], config.JWT_SECRET, {
        algorithms: ['HS256'], issuer: 'tshongkhang', audience: 'seller',
      });
      if (typeof claims.sub !== 'string' || !/^[1-9]\d{0,18}$/.test(claims.sub)) throw new Error('Invalid subject');
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }
    const seller = await pool.query('SELECT id FROM sellers WHERE id = $1', [claims.sub]);
    if (!seller.rowCount) throw new HttpError(401, 'Seller no longer exists');
    req.sellerId = claims.sub;
    next();
  };
}
