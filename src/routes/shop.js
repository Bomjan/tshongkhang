import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { slugParams } from '../schemas/requests.js';
import { publicSellerColumns } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

export function shopRoutes(pool) {
  const router = Router();
  router.get('/:slug/availability', validate(slugParams, 'params'), async (req, res) => {
    const result = await pool.query('SELECT 1 FROM sellers WHERE slug = $1', [req.validated.params.slug]);
    res.json({ available: result.rowCount === 0 });
  });
  router.get('/:slug', validate(slugParams, 'params'), async (req, res) => {
    const result = await pool.query(`SELECT ${publicSellerColumns} FROM sellers WHERE slug = $1`, [req.validated.params.slug]);
    if (!result.rowCount) throw new HttpError(404, 'Shop not found');
    res.json(result.rows[0]);
  });
  return router;
}
