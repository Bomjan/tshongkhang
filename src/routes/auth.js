import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas/requests.js';
import { hashPassword, verifyPassword, startSession, endSession, requireSeller, attemptLimit, sellerColumns } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { transaction } from '../config/database.js';
import { allocateShopSlug } from '../config/shop.js';

export function authRoutes(pool) {
  const router = Router();
  const limit = attemptLimit();
  router.post('/register', limit, validate(registerSchema), async (req, res) => {
    const { business_name, email, password, phone, location, description, logo_url, slug: requestedSlug } = req.validated.body;
    const hash = await hashPassword(password);
    const seller = await transaction(pool, async client => {
      const slug = await allocateShopSlug(client, business_name, requestedSlug);
      const result = await client.query(`INSERT INTO sellers
        (business_name, email, password_hash, phone, location, description, logo_url, slug)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${sellerColumns}`,
      [business_name, email, hash, phone, location, description, logo_url, slug]);
      return result.rows[0];
    });
    await startSession(pool, res, seller.id);
    res.status(201).json(seller);
  });
  router.post('/login', limit, validate(loginSchema), async (req, res) => {
    const { email, password } = req.validated.body;
    const result = await pool.query('SELECT password_hash FROM sellers WHERE email = $1', [email]);
    if (!(await verifyPassword(password, result.rows[0]?.password_hash))) {
      throw new HttpError(401, 'Email or password is incorrect');
    }
    const seller = await pool.query(`SELECT ${sellerColumns} FROM sellers WHERE email = $1`, [email]);
    await endSession(pool, req, res);
    await startSession(pool, res, seller.rows[0].id);
    res.json(seller.rows[0]);
  });
  router.get('/me', requireSeller(pool), (req, res) => res.json(req.seller));
  router.post('/logout', async (req, res) => {
    await endSession(pool, req, res);
    res.status(204).end();
  });
  return router;
}
