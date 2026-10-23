import { randomBytes } from 'node:crypto';
import { transaction } from '../config/database.js';
import { HttpError } from '../middleware/errors.js';
import { toCents, fromCents, MAX_CENTS } from './money.js';

const nextStatus = { Placed: 'Payment Confirmed', 'Payment Confirmed': 'Packed', Packed: 'Delivered' };
const cancellable = new Set(['Placed', 'Payment Confirmed', 'Packed']);

async function itemsFor(client, orderId) {
  const result = await client.query(`SELECT product_id, product_name, unit_price, quantity
    FROM order_items WHERE order_id = $1 ORDER BY product_id`, [orderId]);
  return result.rows;
}

// The reference is a bearer capability. Still omit customer contact details, address and proof.
function trackingView(order, items) {
  return {
    reference: order.reference, status: order.status, total_amount: order.total_amount,
    cancellation_reason: order.cancellation_reason, created_at: order.created_at,
    updated_at: order.updated_at, items,
  };
}

export function orderService(pool) {
  return {
    async checkout(slug, data) {
      const quantities = new Map();
      for (const item of data.items) {
        const quantity = (quantities.get(item.product_id) ?? 0) + item.quantity;
        if (quantity > 2147483647) throw new HttpError(400, 'Combined quantity is too large');
        quantities.set(item.product_id, quantity);
      }
      return transaction(pool, async client => {
        const store = await client.query('SELECT id FROM sellers WHERE storefront_slug = $1', [slug]);
        if (!store.rowCount) throw new HttpError(404, 'Storefront not found');
        const sellerId = store.rows[0].id;
        // Stable row-lock order prevents deadlocks for carts listing products in different orders.
        const products = await client.query(`SELECT id, name, price, stock, is_active FROM products
          WHERE seller_id = $1 AND id = ANY($2::bigint[]) ORDER BY id FOR UPDATE`,
        [sellerId, [...quantities.keys()]]);
        if (products.rowCount !== quantities.size) throw new HttpError(400, 'All products must belong to this storefront');
        let total = 0n;
        for (const product of products.rows) {
          if (!product.is_active) throw new HttpError(409, 'An ordered product is inactive');
          const quantity = quantities.get(product.id);
          if (product.stock < quantity) throw new HttpError(409, `Insufficient stock for ${product.name}`);
          total += toCents(product.price) * BigInt(quantity);
        }
        if (total > MAX_CENTS) throw new HttpError(400, 'Order total exceeds the supported amount');
        const result = await client.query(`INSERT INTO orders
          (seller_id, reference, customer_name, customer_phone, delivery_address, total_amount)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [sellerId, randomBytes(24).toString('hex'), data.customer_name, data.customer_phone,
          data.delivery_address, fromCents(total)]);
        const order = result.rows[0];
        for (const product of products.rows) {
          const quantity = quantities.get(product.id);
          await client.query(`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
            VALUES ($1,$2,$3,$4,$5)`, [order.id, product.id, product.name, product.price, quantity]);
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2 AND seller_id = $3',
            [quantity, product.id, sellerId]);
        }
        return trackingView(order, await itemsFor(client, order.id));
      });
    },
    async track(reference) {
      const result = await pool.query('SELECT * FROM orders WHERE reference = $1', [reference]);
      if (!result.rowCount) throw new HttpError(404, 'Order not found');
      const order = result.rows[0];
      return trackingView(order, await itemsFor(pool, order.id));
    },
    async submitProof(reference, url) {
      // A conditional UPDATE takes the same row lock used by status changes.
      const result = await pool.query(`UPDATE orders SET payment_proof_url = $1, updated_at = now()
        WHERE reference = $2 AND status = 'Placed' RETURNING reference, status, updated_at`, [url, reference]);
      if (result.rowCount) return result.rows[0];
      const exists = await pool.query('SELECT id FROM orders WHERE reference = $1', [reference]);
      if (!exists.rowCount) throw new HttpError(404, 'Order not found');
      throw new HttpError(409, 'Payment proof can only be submitted while the order is Placed');
    },
    async list(sellerId, status) {
      const result = await pool.query(`SELECT * FROM orders
        WHERE seller_id = $1 AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC, id DESC`, [sellerId, status ?? null]);
      return result.rows;
    },
    async detail(sellerId, id) {
      const result = await pool.query('SELECT * FROM orders WHERE id = $1 AND seller_id = $2', [id, sellerId]);
      if (!result.rowCount) throw new HttpError(404, 'Order not found');
      return { ...result.rows[0], items: await itemsFor(pool, id) };
    },
    async changeStatus(sellerId, id, data) {
      return transaction(pool, async client => {
        const result = await client.query(`SELECT * FROM orders
          WHERE id = $1 AND seller_id = $2 FOR UPDATE`, [id, sellerId]);
        if (!result.rowCount) throw new HttpError(404, 'Order not found');
        const order = result.rows[0];
        if (data.status === 'Cancelled') {
          if (!cancellable.has(order.status)) throw new HttpError(409, 'This order cannot be cancelled');
          // Lock products in the same order as checkout. The order lock ensures restoration runs once.
          const items = await itemsFor(client, id);
          await client.query(`SELECT id FROM products WHERE seller_id = $1
            AND id = ANY($2::bigint[]) ORDER BY id FOR UPDATE`, [sellerId, items.map(item => item.product_id)]);
          for (const item of items) {
            await client.query(`UPDATE products SET stock = stock + $1
              WHERE id = $2 AND seller_id = $3`, [item.quantity, item.product_id, sellerId]);
          }
        } else if (nextStatus[order.status] !== data.status) {
          throw new HttpError(409, 'Invalid order status transition');
        }
        const updated = await client.query(`UPDATE orders
          SET status = $1, cancellation_reason = $2, updated_at = now()
          WHERE id = $3 AND seller_id = $4 RETURNING *`,
        [data.status, data.cancellation_reason ?? null, id, sellerId]);
        return updated.rows[0];
      });
    },
  };
}
