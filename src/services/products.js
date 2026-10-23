import { HttpError } from '../middleware/errors.js';

export function productService(pool) {
  return {
    async create(sellerId, data) {
      const result = await pool.query(`INSERT INTO products
        (seller_id, name, description, price, stock, image_url, is_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [sellerId, data.name, data.description, data.price, data.stock, data.image_url ?? null, data.is_active]);
      return result.rows[0];
    },
    async list(sellerId) {
      const result = await pool.query('SELECT * FROM products WHERE seller_id = $1 ORDER BY id', [sellerId]);
      return result.rows;
    },
    async update(sellerId, id, data) {
      const fields = ['name', 'description', 'price', 'stock', 'image_url', 'is_active']
        .filter(field => data[field] !== undefined);
      const values = fields.map(field => data[field]);
      const setters = fields.map((field, i) => `${field} = $${i + 1}`);
      values.push(id, sellerId);
      const result = await pool.query(`UPDATE products SET ${setters.join(', ')}
        WHERE id = $${values.length - 1} AND seller_id = $${values.length} RETURNING *`, values);
      if (!result.rowCount) throw new HttpError(404, 'Product not found');
      return result.rows[0];
    },
    async publicList(slug) {
      const store = await pool.query('SELECT id FROM sellers WHERE storefront_slug = $1', [slug]);
      if (!store.rowCount) throw new HttpError(404, 'Storefront not found');
      const result = await pool.query(`SELECT id, name, description, price, stock, image_url
        FROM products WHERE seller_id = $1 AND is_active = true ORDER BY id`, [store.rows[0].id]);
      return result.rows;
    },
  };
}
