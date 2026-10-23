import { HttpError } from '../middleware/errors.js';

export function productController(pool) {
  return {
    async create(req, res) {
      const { seller_id, name, description, price, stock, image_url } = req.validated.body;
      // INSERT ... SELECT creates a product only when the selected seller exists.
      const result = await pool.query(`INSERT INTO products (seller_id, name, description, price, stock, image_url)
        SELECT id, $2, $3, $4, $5, $6 FROM sellers WHERE id = $1 RETURNING *`,
      [seller_id, name, description, price, stock, image_url]);
      if (!result.rowCount) throw new HttpError(404, 'Seller not found');
      res.status(201).json(result.rows[0]);
    },
    async list(req, res) {
      const sellerId = req.validated.query.seller_id;
      const result = sellerId
        ? await pool.query('SELECT * FROM products WHERE seller_id = $1 ORDER BY id', [sellerId])
        : await pool.query('SELECT * FROM products ORDER BY id');
      res.json(result.rows);
    },
    async get(req, res) {
      const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'Product not found');
      res.json(result.rows[0]);
    },
    async update(req, res) {
      const { name, description, price, stock, image_url } = req.validated.body;
      const result = await pool.query(`UPDATE products SET name = $1, description = $2, price = $3,
        stock = $4, image_url = $5 WHERE id = $6 RETURNING *`,
      [name, description, price, stock, image_url, req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'Product not found');
      res.json(result.rows[0]);
    },
    async remove(req, res) {
      const result = await pool.query('DELETE FROM products WHERE id = $1', [req.validated.params.id]);
      if (!result.rowCount) throw new HttpError(404, 'Product not found');
      res.status(204).end();
    },
  };
}
