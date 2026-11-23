import { HttpError } from '../middleware/errors.js';
import { publicSellerColumns, sellerColumns } from '../middleware/auth.js';

export function sellerController(pool) {
  return {
    async list(req, res) {
      const result = await pool.query(`SELECT ${publicSellerColumns} FROM sellers ORDER BY id`);
      res.json(result.rows);
    },
    async get(req, res) {
      const result = await pool.query(`SELECT ${publicSellerColumns} FROM sellers WHERE id = $1`, [req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'Seller not found');
      res.json(result.rows[0]);
    },
    async update(req, res) {
      const { business_name, email, phone, location, description, logo_url } = req.validated.body;
      const result = await pool.query(`UPDATE sellers SET business_name = $1, email = $2, phone = $3,
        location = $4, description = $5, logo_url = $6 WHERE id = $7 RETURNING ${sellerColumns}`,
      [business_name, email, phone, location, description, logo_url, req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'Seller not found');
      res.json(result.rows[0]);
    },
    async remove(req, res) {
      const result = await pool.query('DELETE FROM sellers WHERE id = $1', [req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'Seller not found');
      res.status(204).end();
    },
    async profile(req, res) {
      const result = await pool.query(`SELECT id, slug, business_name, phone, location, description, logo_url
        FROM sellers WHERE id = $1`, [req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'Seller not found');
      res.json(result.rows[0]);
    },
    async updateProfile(req, res) {
      const fields = ['business_name', 'phone', 'location', 'description', 'logo_url']
        .filter(field => req.validated.body[field] !== undefined);
      const values = fields.map(field => req.validated.body[field]);
      const setters = fields.map((field, index) => `${field} = $${index + 1}`);
      values.push(req.validated.params.id);
      const result = await pool.query(`UPDATE sellers SET ${setters.join(', ')} WHERE id = $${values.length}
        RETURNING id, slug, business_name, phone, location, description, logo_url`, values);
      if (!result.rowCount) throw new HttpError(404, 'Seller not found');
      res.json(result.rows[0]);
    },
  };
}
