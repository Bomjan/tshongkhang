import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { migrate } from '../db/migrate.js';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a PostgreSQL database where the test role may CREATE SCHEMA (see README).');
}
const config = {
  JWT_SECRET: 'integration-only-secret-at-least-32-characters', JWT_EXPIRES_IN: '1h',
  BCRYPT_ROUNDS: 10, AUTH_RATE_LIMIT_MAX: 1000,
};
const schema = `test_${process.pid}_${Date.now()}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let pool, server, base, sellerA, sellerB;

async function request(method, route, body, token, origin = base) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function register(slug) {
  const result = await request('POST', '/auth/register', {
    business_name: slug, email: `${slug}@example.com`, password: 'a-strong-password-123',
    phone: '+97517123456', location: 'Thimphu', storefront_slug: slug,
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
async function product(seller = sellerA, overrides = {}) {
  const result = await request('POST', '/seller/products', {
    name: 'Red rice', price: '100.25', stock: 10, ...overrides,
  }, seller.token);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
function cart(items) {
  return { customer_name: 'Pema', customer_phone: '17123456', delivery_address: 'Changzamtog, Thimphu', items };
}
async function checkout(items, slug = 'store-a') {
  return request('POST', `/stores/${slug}/orders`, cart(items));
}
async function placedOrder(p) {
  const result = await checkout([{ product_id: p.id, quantity: 1 }]);
  assert.equal(result.status, 201);
  const { rows } = await pool.query('SELECT id FROM orders WHERE reference = $1', [result.body.reference]);
  return { ...result.body, id: rows[0].id };
}
async function transition(order, status, reason, token = sellerA.token) {
  return request('PATCH', `/seller/orders/${order.id}/status`, {
    status, ...(reason === undefined ? {} : { cancellation_reason: reason }),
  }, token);
}
async function stock(p) {
  return (await pool.query('SELECT stock FROM products WHERE id = $1', [p.id])).rows[0].stock;
}

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`, max: 12 });
  await migrate(pool);
  await migrate(pool); // Re-running migrations must be safe.
  server = createApp(pool, config).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await pool.query('TRUNCATE order_items, orders, products, sellers RESTART IDENTITY');
  sellerA = await register('store-a');
  sellerB = await register('store-b');
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

test('registration hashes passwords, login validates credentials, and JWT protects seller routes', async () => {
  const stored = (await pool.query('SELECT password_hash FROM sellers WHERE id = $1', [sellerA.seller.id])).rows[0];
  assert.notEqual(stored.password_hash, 'a-strong-password-123');
  assert.ok(await bcrypt.compare('a-strong-password-123', stored.password_hash));
  assert.equal(sellerA.seller.password_hash, undefined);
  assert.equal((await request('GET', '/seller/profile')).status, 401);
  assert.equal((await request('GET', '/seller/profile', undefined, 'broken')).status, 401);
  const expired = jwt.sign({}, config.JWT_SECRET, { subject: sellerA.seller.id, issuer: 'tshongkhang', audience: 'seller', expiresIn: -1 });
  assert.equal((await request('GET', '/seller/profile', undefined, expired)).status, 401);
  assert.equal((await request('POST', '/auth/login', { email: 'store-a@example.com', password: 'wrong' })).status, 401);
  assert.equal((await request('POST', '/auth/login', { email: 'store-a@example.com', password: 'x'.repeat(73) })).status, 400);
  assert.equal((await request('POST', '/auth/login', { email: 'store-a@example.com', password: 'ཀ'.repeat(25) })).status, 400);
  const login = await request('POST', '/auth/login', { email: 'STORE-A@example.com', password: 'a-strong-password-123' });
  assert.equal(login.status, 200);
  assert.equal((await request('GET', '/seller/profile', undefined, login.body.token)).body.id, sellerA.seller.id);
  const duplicate = await request('POST', '/auth/register', {
    business_name: 'Duplicate', email: 'store-a@example.com', password: 'another-password',
    phone: '17123456', location: 'Paro', storefront_slug: 'duplicate-store',
  });
  assert.equal(duplicate.status, 409);
});

test('profile updates are scoped to the authenticated seller and reject identity injection', async () => {
  assert.equal((await request('PATCH', '/seller/profile', { business_name: 'Changed A' }, sellerA.token)).status, 200);
  assert.equal((await request('GET', '/seller/profile', undefined, sellerB.token)).body.business_name, 'store-b');
  assert.equal((await request('PATCH', '/seller/profile', { id: sellerB.seller.id }, sellerA.token)).status, 400);
  assert.equal((await request('PATCH', '/seller/profile', { storefront_slug: 'store-b' }, sellerA.token)).status, 409);
});

test('seller isolation covers product edits, lists, order details, status changes and order lists', async () => {
  const a = await product();
  const b = await product(sellerB);
  const order = await placedOrder(a);
  assert.equal((await request('PATCH', `/seller/products/${a.id}`, { stock: 0 }, sellerB.token)).status, 404);
  const products = await request('GET', '/seller/products', undefined, sellerB.token);
  assert.deepEqual(products.body.map(p => p.id), [b.id]);
  assert.equal((await request('GET', `/seller/orders/${order.id}`, undefined, sellerB.token)).status, 404);
  assert.equal((await transition(order, 'Cancelled', 'Not mine', sellerB.token)).status, 404);
  assert.deepEqual((await request('GET', '/seller/orders', undefined, sellerB.token)).body, []);
  assert.equal(await stock(a), 9);
  assert.equal((await checkout([{ product_id: b.id, quantity: 1 }])).status, 400);
  assert.equal((await checkout([{ product_id: a.id, quantity: 1 }, { product_id: b.id, quantity: 1 }])).status, 400);
  assert.equal(await stock(a), 9);
  assert.equal(await stock(b), 10);
});

test('duplicate products merge, money is exact, and order items preserve names and prices', async () => {
  const p = await product(sellerA, { price: '0.10' });
  const q = await product(sellerA, { price: '0.20' });
  const result = await checkout([{ product_id: p.id, quantity: 1 }, { product_id: Number(p.id), quantity: 2 }, { product_id: q.id, quantity: 1 }]);
  assert.equal(result.status, 201);
  assert.equal(result.body.total_amount, '0.50');
  assert.equal(result.body.items.length, 2);
  assert.equal(result.body.items.find(item => item.product_id === p.id).quantity, 3);
  assert.equal(await stock(p), 7);
  await request('PATCH', `/seller/products/${p.id}`, { name: 'New name', price: '999.99' }, sellerA.token);
  const tracked = await request('GET', `/orders/${result.body.reference}`);
  assert.equal(tracked.body.items[0].product_name, 'Red rice');
  assert.equal(tracked.body.items[0].unit_price, '0.10');
});

test('invalid quantities, client prices, inactive products and excessive totals are rejected', async () => {
  const p = await product();
  for (const quantity of [0, -1, 1.2, '2', 2147483648]) {
    assert.equal((await checkout([{ product_id: p.id, quantity }])).status, 400);
  }
  assert.equal((await checkout([{ product_id: p.id, quantity: 1, price: '0.01' }])).status, 400);
  assert.equal((await checkout([{ product_id: p.id, quantity: 7 }, { product_id: p.id, quantity: 7 }])).status, 409);
  assert.equal((await checkout([])).status, 400);
  await request('PATCH', `/seller/products/${p.id}`, { is_active: false }, sellerA.token);
  assert.equal((await checkout([{ product_id: p.id, quantity: 1 }])).status, 409);
  const huge = await product(sellerA, { price: '9999999999.99', stock: 2 });
  assert.equal((await checkout([{ product_id: huge.id, quantity: 2 }])).status, 400);
  assert.equal(await stock(huge), 2);
  assert.equal((await request('POST', '/seller/products', { name: 'Bad money', price: 0.1, stock: 1 }, sellerA.token)).status, 400);
  assert.equal(await stock(p), 10);
});

test('a failed multi-item order leaves no order, items, or stock changes', async () => {
  const a = await product();
  const b = await product(sellerA, { stock: 0 });
  const result = await checkout([{ product_id: a.id, quantity: 1 }, { product_id: b.id, quantity: 1 }]);
  assert.equal(result.status, 409);
  assert.equal(await stock(a), 10);
  assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '0');
  assert.equal((await pool.query('SELECT count(*) FROM order_items')).rows[0].count, '0');
});

test('a database failure after inserting the first item rolls back every write', async () => {
  const a = await product();
  const b = await product();
  // Fault injection exercises rollback after order/item creation and a stock decrement.
  await pool.query(`CREATE FUNCTION reject_second_item() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.product_id = ${b.id} THEN
      RAISE EXCEPTION 'injected overflow' USING ERRCODE = '22003';
    END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER fail_item BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION reject_second_item()');
  try {
    assert.equal((await checkout([{ product_id: a.id, quantity: 1 }, { product_id: b.id, quantity: 1 }])).status, 409);
    assert.equal(await stock(a), 10);
    assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '0');
    assert.equal((await pool.query('SELECT count(*) FROM order_items')).rows[0].count, '0');
  } finally {
    await pool.query('DROP TRIGGER fail_item ON order_items');
    await pool.query('DROP FUNCTION reject_second_item()');
  }
});

test('concurrent checkouts cannot oversell the last unit', async () => {
  const p = await product(sellerA, { stock: 1 });
  const results = await Promise.all(Array.from({ length: 8 }, () => checkout([{ product_id: p.id, quantity: 1 }])));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 7);
  assert.equal(await stock(p), 0);
  assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '1');
});

test('overlapping carts in opposite product order do not deadlock or oversell', async () => {
  const a = await product(sellerA, { stock: 1 });
  const b = await product(sellerA, { stock: 1 });
  const results = await Promise.all([
    checkout([{ product_id: a.id, quantity: 1 }, { product_id: b.id, quantity: 1 }]),
    checkout([{ product_id: b.id, quantity: 1 }, { product_id: a.id, quantity: 1 }]),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(await stock(a), 0);
  assert.equal(await stock(b), 0);
});

test('payment proof remains unconfirmed, is seller-visible, and does not expose guest details publicly', async () => {
  const p = await product();
  const order = await placedOrder(p);
  const proof = await request('PATCH', `/orders/${order.reference}/payment-proof`, { payment_proof_url: 'https://example.com/proof.png' });
  assert.equal(proof.status, 200);
  assert.equal(proof.body.status, 'Placed');
  const detail = await request('GET', `/seller/orders/${order.id}`, undefined, sellerA.token);
  assert.equal(detail.body.payment_proof_url, 'https://example.com/proof.png');
  assert.equal(detail.body.customer_name, 'Pema');
  const tracked = (await request('GET', `/orders/${order.reference}`)).body;
  for (const field of ['customer_name', 'customer_phone', 'delivery_address', 'payment_proof_url', 'id', 'seller_id']) {
    assert.equal(Object.hasOwn(tracked, field), false);
  }
  const store = (await request('GET', '/stores/store-a')).body;
  assert.deepEqual(Object.keys(store).sort(), ['business_name', 'location', 'phone', 'qr_image_url', 'storefront_slug']);
  assert.equal((await request('GET', `/orders/${'0'.repeat(48)}`)).status, 404);
  assert.match(order.reference, /^[0-9a-f]{48}$/);
  assert.equal((await request('PATCH', `/orders/${order.reference}/payment-proof`, { payment_proof_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await transition(order, 'Payment Confirmed')).status, 200);
  assert.equal((await request('PATCH', `/orders/${order.reference}/payment-proof`, { payment_proof_url: 'https://example.com/changed.png' })).status, 409);
});

test('order sequence, status filters, required reasons and terminal states are enforced', async () => {
  const order = await placedOrder(await product());
  for (const state of ['Placed', 'Packed', 'Delivered']) assert.equal((await transition(order, state)).status, 409);
  assert.equal((await transition(order, 'Cancelled')).status, 400);
  assert.equal((await transition(order, 'Cancelled', '  ')).status, 400);
  assert.equal((await transition(order, 'Payment Confirmed', 'Wrong use of reason')).status, 400);
  assert.equal((await transition(order, 'Payment Confirmed')).status, 200);
  assert.equal((await transition(order, 'Placed')).status, 409);
  const filtered = await request('GET', '/seller/orders?status=Payment%20Confirmed', undefined, sellerA.token);
  assert.deepEqual(filtered.body.map(o => o.id), [order.id]);
  assert.deepEqual((await request('GET', '/seller/orders?status=Placed', undefined, sellerA.token)).body, []);
  assert.equal((await request('GET', '/seller/orders?status=Unknown', undefined, sellerA.token)).status, 400);
  assert.equal((await transition(order, 'Packed')).status, 200);
  assert.equal((await transition(order, 'Delivered')).status, 200);
  assert.equal((await transition(order, 'Cancelled', 'Too late')).status, 409);
  assert.equal((await transition(order, 'Packed')).status, 409);
});

test('cancellation from every permitted status restores stock once, including inactive products', async () => {
  for (const start of ['Placed', 'Payment Confirmed', 'Packed']) {
    const p = await product();
    const order = await placedOrder(p);
    if (start !== 'Placed') await transition(order, 'Payment Confirmed');
    if (start === 'Packed') await transition(order, 'Packed');
    await request('PATCH', `/seller/products/${p.id}`, { is_active: false }, sellerA.token);
    const cancelled = await transition(order, 'Cancelled', 'Customer requested cancellation');
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.cancellation_reason, 'Customer requested cancellation');
    assert.equal(await stock(p), 10);
    assert.equal((await transition(order, 'Cancelled', 'Retry')).status, 409);
    assert.equal((await transition(order, 'Payment Confirmed')).status, 409);
    assert.equal(await stock(p), 10);
  }
});

test('simultaneous cancellations restore stock exactly once', async () => {
  const p = await product();
  const order = await placedOrder(p);
  const results = await Promise.all(Array.from({ length: 8 }, () => transition(order, 'Cancelled', 'Cancel request')));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 7);
  assert.equal(await stock(p), 10);
});

test('cancellation and checkout on the same product keep inventory consistent', async () => {
  const p = await product(sellerA, { stock: 1 });
  const order = await placedOrder(p);
  const [cancel, buy] = await Promise.all([
    transition(order, 'Cancelled', 'Changed mind'), checkout([{ product_id: p.id, quantity: 1 }]),
  ]);
  assert.equal(cancel.status, 200);
  assert.ok([201, 409].includes(buy.status));
  assert.equal(await stock(p), buy.status === 201 ? 0 : 1);
});

test('simultaneous delivery and cancellation allow only one terminal transition', async () => {
  const p = await product();
  const order = await placedOrder(p);
  await transition(order, 'Payment Confirmed');
  await transition(order, 'Packed');
  const results = await Promise.all([
    transition(order, 'Delivered'), transition(order, 'Cancelled', 'Cancel before delivery'),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const final = (await request('GET', `/seller/orders/${order.id}`, undefined, sellerA.token)).body;
  assert.ok(['Delivered', 'Cancelled'].includes(final.status));
  assert.equal(await stock(p), final.status === 'Cancelled' ? 10 : 9);
});

test('deactivation hides products and foreign keys prevent deleting purchase history', async () => {
  const p = await product();
  await placedOrder(p);
  await request('PATCH', `/seller/products/${p.id}`, { is_active: false }, sellerA.token);
  assert.deepEqual((await request('GET', '/stores/store-a/products')).body, []);
  assert.equal((await request('GET', '/seller/products', undefined, sellerA.token)).body[0].is_active, false);
  await assert.rejects(pool.query('DELETE FROM products WHERE id = $1', [p.id]), { code: '23503' });
  await assert.rejects(pool.query('UPDATE products SET stock = -1 WHERE id = $1', [p.id]), { code: '23514' });
});

test('authentication routes apply rate limiting', async () => {
  const limited = createApp(pool, { ...config, AUTH_RATE_LIMIT_MAX: 2 }).listen(0, '127.0.0.1');
  await once(limited, 'listening');
  const origin = `http://127.0.0.1:${limited.address().port}`;
  try {
    const login = () => request('POST', '/auth/login', { email: 'store-a@example.com', password: 'wrong' }, undefined, origin);
    assert.equal((await login()).status, 401);
    assert.equal((await login()).status, 401);
    assert.equal((await login()).status, 429);
  } finally {
    await new Promise(resolve => limited.close(resolve));
  }
});
