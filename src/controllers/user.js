import { HttpError } from '../middleware/errors.js';

export function userController(pool) {
  return {
    async create(req, res) {
      const { name, email, phone, address, avatar_url } = req.validated.body;
      const result = await pool.query(`INSERT INTO users (name, email, phone, address, avatar_url)
        VALUES ($1,$2,$3,$4,$5) RETURNING *`, [name, email, phone, address, avatar_url]);
      res.status(201).json(result.rows[0]);
    },
    async list(req, res) {
      const result = await pool.query('SELECT * FROM users ORDER BY id');
      res.json(result.rows);
    },
    async get(req, res) {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'User not found');
      res.json(result.rows[0]);
    },
    async update(req, res) {
      const { name, email, phone, address, avatar_url } = req.validated.body;
      const result = await pool.query(`UPDATE users SET name = $1, email = $2, phone = $3,
        address = $4, avatar_url = $5 WHERE id = $6 RETURNING *`,
      [name, email, phone, address, avatar_url, req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'User not found');
      res.json(result.rows[0]);
    },
    async remove(req, res) {
      const result = await pool.query('DELETE FROM users WHERE id = $1', [req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'User not found');
      res.status(204).end();
    },
    async profile(req, res) {
      const result = await pool.query('SELECT id, name, phone, address, avatar_url FROM users WHERE id = $1',
        [req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'User not found');
      res.json(result.rows[0]);
    },
    async updateProfile(req, res) {
      const fields = ['name', 'phone', 'address', 'avatar_url'].filter(field => req.validated.body[field] !== undefined);
      const values = fields.map(field => req.validated.body[field]);
      const setters = fields.map((field, index) => `${field} = $${index + 1}`);
      values.push(req.validated.params.id);
      const result = await pool.query(`UPDATE users SET ${setters.join(', ')}
        WHERE id = $${values.length} RETURNING id, name, phone, address, avatar_url`, values);
      if (!result.rowCount) throw new HttpError(404, 'User not found');
      res.json(result.rows[0]);
    },
  };
}
