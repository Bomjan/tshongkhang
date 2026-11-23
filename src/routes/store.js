import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { transaction } from '../config/database.js';
import { validate } from '../middleware/validate.js';
import { idParams, checkoutSchema } from '../schemas/requests.js';
import { HttpError } from '../middleware/errors.js';
import { attemptLimit } from '../middleware/auth.js';

const cents = price => BigInt(price.replace('.', ''));
const money = amount => `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;

export function storeRoutes(pool) {
  const router = Router();
  router.post('/:id/orders', attemptLimit(60), validate(idParams, 'params'), validate(checkoutSchema), async (req, res) => {
    const data = req.validated.body;
    const sellerId = req.validated.params.id;
    const result = await transaction(pool, async client => {
      // Serialize retries of the same checkout before checking its saved result.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [data.checkout_key]);
      const existing = await client.query('SELECT * FROM orders WHERE checkout_key = $1', [data.checkout_key]);
      if (existing.rowCount) {
        const order = existing.rows[0];
        const items = await client.query(`SELECT product_id, product_name, unit_price, quantity FROM order_items
          WHERE order_id = $1 ORDER BY product_id`, [order.id]);
        const sameItems = items.rows.length === data.items.length && items.rows.every(item =>
          data.items.some(requested => requested.product_id === item.product_id && requested.quantity === item.quantity));
        if (order.seller_id !== sellerId || order.customer_name !== data.customer_name ||
            order.customer_phone !== data.customer_phone || order.customer_address !== data.customer_address ||
            order.note !== data.note || !sameItems) throw new HttpError(409, 'This checkout was already used. Start a new checkout');
        return { order: { id: order.id, total: order.total, status: order.status, items: items.rows }, replay: true };
      }
      const seller = await client.query('SELECT id FROM sellers WHERE id = $1', [sellerId]);
      if (!seller.rowCount) throw new HttpError(404, 'Store not found');
      // Lock in a consistent order so simultaneous checkouts cannot oversell.
      const products = await client.query(`SELECT * FROM products WHERE id = ANY($1::bigint[])
        AND seller_id = $2 ORDER BY id FOR UPDATE`, [data.items.map(item => item.product_id), sellerId]);
      if (products.rowCount !== data.items.length) throw new HttpError(409, 'Some products are no longer available in this store. Review your cart');
      const items = products.rows.map(product => {
        const quantity = data.items.find(item => item.product_id === product.id).quantity;
        if (product.stock < quantity) throw new HttpError(409, `Only ${product.stock} of ${product.name} available. Review your cart`);
        return { product_id: product.id, product_name: product.name, unit_price: product.price, quantity };
      });
      const total = money(items.reduce((sum, item) => sum + cents(item.unit_price) * BigInt(item.quantity), 0n));
      if (data.expected_total !== undefined && data.expected_total !== total) {
        throw new HttpError(409, 'Product prices have changed. Review your cart before placing the order');
      }
      const orderId = randomUUID();
      await client.query(`INSERT INTO orders
        (id, checkout_key, seller_id, customer_name, customer_phone, customer_address, note, total)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orderId, data.checkout_key, sellerId, data.customer_name, data.customer_phone, data.customer_address, data.note, total]);
      for (const item of items) {
        await client.query(`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
          VALUES ($1,$2,$3,$4,$5)`, [orderId, item.product_id, item.product_name, item.unit_price, item.quantity]);
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.product_id]);
      }
      return { order: { id: orderId, total, status: 'placed', items }, replay: false };
    });
    res.status(result.replay ? 200 : 201).json(result.order);
  });
  return router;
}
