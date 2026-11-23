import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { migrate } from '../db/migrate.js';
import { reservedShopSlugs } from '../src/config/shop.js';

if (!process.env.TEST_DATABASE_URL && !process.env.PG_CLUSTER_CONF_ROOT) {
  throw new Error('Use TEST_DATABASE_URL or pg_virtualenv to run against a disposable database.');
}
const schema = `test_${process.pid}_${Date.now()}`;
const connection = process.env.TEST_DATABASE_URL ? { connectionString: process.env.TEST_DATABASE_URL } : {};
const admin = new pg.Pool(connection);
let pool, server, base, uploadDirectory;

function client() {
  let cookie = '';
  return async (method, route, body, headers = {}) => {
    const response = await fetch(`${base}/api${route}`, {
      method, headers: { ...(body === undefined ? {} : { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
  };
}
const guest = client();
const registration = (email = 'pema@example.com') => ({ business_name: 'Pema Store', email, password: 'strong-demo-password', location: 'Thimphu' });
async function register(email) {
  const request = client();
  const response = await request('POST', '/auth/register', registration(email));
  assert.equal(response.status, 201);
  return { request, seller: response.body };
}
async function product(request, body = {}) {
  const response = await request('POST', '/products', { name: 'Red rice', price: '125.50', stock: 10, description: 'Local rice', ...body });
  assert.equal(response.status, 201);
  return response.body;
}
const checkout = (item, extra = {}) => ({ checkout_key: randomUUID(), customer_name: 'Sonam', customer_phone: '17123456', customer_address: 'Changzamtog, Thimphu', items: [{ product_id: item.id, quantity: 2 }], ...extra });

before(async () => {
  uploadDirectory = await mkdtemp('/tmp/tshongkhang-api-uploads-');
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({ ...connection, options: `-c search_path=${schema}` });
  await migrate(pool);
  await migrate(pool);
});
beforeEach(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.query('TRUNCATE order_items, orders, seller_sessions, products, users, sellers RESTART IDENTITY');
  server = createApp(pool, { uploadDirectory }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
  if (uploadDirectory) await rm(uploadDirectory, { recursive: true, force: true });
});

test('upgrading a populated mid-review database preserves existing users, sellers and products', async () => {
  const legacySchema = `${schema}_legacy`;
  await admin.query(`CREATE SCHEMA ${legacySchema}`);
  const legacy = new pg.Pool({ ...connection, options: `-c search_path=${legacySchema}` });
  try {
    await legacy.query('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const name of ['001_mid_review.sql', '002_products.sql']) {
      await legacy.query(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8'));
      await legacy.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    }
    await legacy.query("INSERT INTO users (name, email) VALUES ('Existing user','user@example.com')");
    const sellerId = (await legacy.query("INSERT INTO sellers (business_name, email) VALUES ('Existing shop','legacy@example.com') RETURNING id")).rows[0].id;
    await legacy.query("INSERT INTO sellers (business_name, email) VALUES ('Existing shop','duplicate@example.com'), ('Login','reserved@example.com'), ('ཚོང་ཁང་','unicode@example.com')");
    await legacy.query("INSERT INTO products (seller_id, name, price, stock) VALUES ($1, 'Existing rice', 125.50, 7)", [sellerId]);
    await migrate(legacy);
    await migrate(legacy);
    assert.equal((await legacy.query('SELECT name FROM users')).rows[0].name, 'Existing user');
    assert.equal((await legacy.query('SELECT password_hash FROM sellers')).rows[0].password_hash, null);
    assert.deepEqual((await legacy.query('SELECT seller_id, name, price, stock FROM products')).rows[0], {
      seller_id: sellerId, name: 'Existing rice', price: '125.50', stock: 7,
    });
    assert.equal((await legacy.query('SELECT count(*) FROM orders')).rows[0].count, '0');
    assert.deepEqual((await legacy.query('SELECT slug FROM sellers ORDER BY id')).rows.map(row => row.slug),
      ['existing-shop', 'existing-shop-2', 'login-shop', 'shop']);
  } finally {
    await legacy.end();
    await admin.query(`DROP SCHEMA ${legacySchema} CASCADE`);
  }
});

test('seller registration hashes passwords, normalizes email, starts a private session and logout revokes it', async () => {
  const request = client();
  const created = await request('POST', '/auth/register', registration('PEMA@example.com'));
  assert.equal(created.status, 201);
  assert.equal(created.body.email, 'pema@example.com');
  assert.equal(typeof created.body.id, 'string');
  assert.equal(Object.hasOwn(created.body, 'password_hash'), false);
  const cookie = created.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const stored = (await pool.query('SELECT password_hash FROM sellers')).rows[0].password_hash;
  assert.notEqual(stored, registration().password);
  assert.match(stored, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  const token = cookie.split(';')[0].split('=')[1];
  const savedToken = (await pool.query('SELECT token_hash FROM seller_sessions')).rows[0].token_hash;
  assert.notEqual(savedToken, token);
  assert.equal((await request('GET', '/auth/me')).body.id, created.body.id);
  assert.equal((await guest('GET', '/auth/me')).status, 401);
  assert.equal((await request('POST', '/auth/logout', {})).status, 204);
  assert.equal((await request('GET', '/auth/me')).status, 401);
  assert.equal((await guest('GET', '/auth/me', undefined, { Cookie: `tshongkhang_session=${token}` })).status, 401);
});

test('login rejects wrong, unknown and legacy credentials; expired sessions cannot mutate data', async () => {
  const { request } = await register();
  await request('POST', '/auth/logout', {});
  for (const data of [{ email: 'pema@example.com', password: 'wrong' }, { email: 'missing@example.com', password: 'wrong' }]) {
    const result = await request('POST', '/auth/login', data);
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'Email or password is incorrect');
  }
  await pool.query("INSERT INTO sellers (business_name, email, slug) VALUES ('Legacy shop','legacy@example.com','legacy-shop')");
  assert.equal((await request('POST', '/auth/login', { email: 'legacy@example.com', password: 'anything' })).status, 401);
  const loggedIn = await request('POST', '/auth/login', { email: '  PEMA@example.com  ', password: registration().password });
  assert.equal(loggedIn.status, 200);
  await pool.query("UPDATE seller_sessions SET expires_at = now() - interval '1 second'");
  assert.equal((await request('GET', '/auth/me')).status, 401);
  assert.equal((await request('POST', '/products', { name: 'Rice', price: '1.00' })).status, 401);
});

test('registration validates required fields and never claims duplicate or legacy emails', async () => {
  const { request } = await register();
  assert.equal((await guest('POST', '/auth/register', registration('PEMA@example.com'))).status, 409);
  for (const invalid of [{}, { ...registration(), password: 'short' }, { ...registration(), email: 'invalid' }, { ...registration(), business_name: ' ' }, { ...registration(), password: 'x'.repeat(129) }]) {
    assert.equal((await guest('POST', '/auth/register', invalid)).status, 400);
  }
  assert.equal((await request('GET', '/auth/me')).status, 200);
});

test('public storefront exposes profiles and products, never email or credentials; seller profile edits require ownership', async () => {
  const { request, seller } = await register();
  const other = await register('other@example.com');
  for (const route of ['/sellers', `/sellers/${seller.id}`, `/sellers/${seller.id}/profile`]) {
    const response = await guest('GET', route);
    assert.equal(response.status, 200);
    for (const row of Array.isArray(response.body) ? response.body : [response.body]) {
      assert.equal(Object.hasOwn(row, 'email'), false);
      assert.equal(Object.hasOwn(row, 'password_hash'), false);
    }
  }
  const route = `/sellers/${seller.id}/profile`;
  assert.equal((await guest('PATCH', route, { location: 'Paro' })).status, 401);
  assert.equal((await other.request('PATCH', route, { location: 'Paro' })).status, 403);
  assert.equal((await other.request('DELETE', `/sellers/${seller.id}`)).status, 403);
  const updated = await request('PATCH', route, { location: 'Paro', description: 'Local goods', phone: '17123456' });
  assert.equal(updated.status, 200);
  assert.equal((await guest('GET', `/sellers/${seller.id}`)).body.location, 'Paro');
  assert.equal((await request('PATCH', route, {})).status, 400);
  assert.equal((await request('PATCH', route, { email: 'change@example.com' })).status, 400);
  assert.equal((await request('PATCH', route, { logo_url: 'javascript:alert(1)' })).status, 400);
  const replaced = await request('PUT', `/sellers/${seller.id}`, { business_name: 'Renamed store', email: seller.email });
  assert.equal(replaced.status, 200);
  assert.equal(Object.hasOwn(replaced.body, 'password_hash'), false);
  assert.equal((await request('GET', '/auth/me')).body.business_name, 'Renamed store');
});

test('seller can add, read, edit, filter and delete products; other sellers and guests cannot mutate them', async () => {
  const { request, seller } = await register();
  const other = await register('other@example.com');
  const item = await product(request);
  assert.equal(item.seller_id, seller.id);
  assert.equal(item.price, '125.50');
  assert.equal((await guest('GET', `/products/${item.id}`)).body.name, 'Red rice');
  assert.deepEqual((await guest('GET', `/products?seller_id=${seller.id}`)).body.map(row => row.id), [item.id]);
  assert.deepEqual((await guest('GET', `/products?seller_id=${other.seller.id}`)).body, []);
  const body = { name: 'Rice 1kg', price: '130.00', stock: 5 };
  assert.equal((await guest('POST', '/products', body)).status, 401);
  assert.equal((await guest('PUT', `/products/${item.id}`, body)).status, 401);
  assert.equal((await guest('DELETE', `/products/${item.id}`)).status, 401);
  assert.equal((await other.request('PUT', `/products/${item.id}`, body)).status, 404);
  assert.equal((await other.request('DELETE', `/products/${item.id}`)).status, 404);
  assert.equal((await other.request('POST', '/products', { ...body, seller_id: seller.id })).status, 403);
  const updated = await request('PUT', `/products/${item.id}`, body);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.price, '130.00');
  assert.equal(updated.body.description, '');
  assert.equal(updated.body.seller_id, seller.id);
  assert.equal((await request('DELETE', `/sellers/${seller.id}`)).status, 409);
  assert.equal((await request('DELETE', `/products/${item.id}`)).status, 204);
  assert.equal((await guest('GET', `/products/${item.id}`)).status, 404);
  assert.equal((await request('DELETE', `/products/${item.id}`)).status, 404);
  assert.equal((await request('DELETE', `/sellers/${seller.id}`)).status, 204);
  assert.equal((await request('GET', '/auth/me')).status, 401);
});

test('products validate prices, stock, URLs and IDs at the API and database boundary', async () => {
  const { request } = await register();
  const data = { name: 'Rice', price: '125.50' };
  for (const price of [125.5, '0.00', '-1.00', '1.001', '1', '10000000000.00']) {
    assert.equal((await request('POST', '/products', { ...data, price })).status, 400);
  }
  for (const stock of [-1, 1.5, '2', 2147483648]) {
    assert.equal((await request('POST', '/products', { ...data, stock })).status, 400);
  }
  for (const image_url of ['not-a-url', 'javascript:alert(1)']) assert.equal((await request('POST', '/products', { ...data, image_url })).status, 400);
  for (const id of ['abc', '0', '-1', '9223372036854775808']) assert.equal((await guest('GET', `/products/${id}`)).status, 400);
  assert.equal((await guest('GET', '/products?seller_id=abc')).status, 400);
  const item = await product(request);
  await assert.rejects(pool.query('UPDATE products SET stock = -1 WHERE id = $1', [item.id]), { code: '23514' });
  await assert.rejects(pool.query('UPDATE products SET price = 0 WHERE id = $1', [item.id]), { code: '23514' });
});

test('guest checkout saves customer details, snapshots canonical prices and stock, without requiring an account', async () => {
  const { request, seller } = await register();
  const rice = await product(request, { price: '0.10' });
  const tea = await product(request, { name: 'Tea', price: '0.20' });
  const body = checkout(rice, { note: 'Call on arrival', items: [{ product_id: rice.id, quantity: 3 }, { product_id: tea.id, quantity: 2 }] });
  const placed = await guest('POST', `/stores/${seller.id}/orders`, body);
  assert.equal(placed.status, 201);
  assert.equal(placed.body.total, '0.70');
  assert.equal(placed.body.status, 'placed');
  assert.equal(placed.body.items.length, 2);
  assert.equal(Object.hasOwn(placed.body, 'checkout_key'), false);
  const saved = (await pool.query('SELECT * FROM orders WHERE id = $1', [placed.body.id])).rows[0];
  assert.equal(saved.customer_phone, body.customer_phone);
  assert.equal(saved.customer_address, body.customer_address);
  assert.equal(saved.note, body.note);
  assert.equal((await guest('GET', `/products/${rice.id}`)).body.stock, 7);
  assert.equal((await guest('GET', `/products/${tea.id}`)).body.stock, 8);
  assert.equal((await guest('GET', `/orders/${placed.body.id}`)).status, 404);
  await request('PUT', `/products/${rice.id}`, { name: 'Changed rice', price: '999.00', stock: 7 });
  await request('DELETE', `/products/${rice.id}`);
  const snapshot = (await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [placed.body.id])).rows[0];
  assert.equal(snapshot.product_name, 'Red rice');
  assert.equal(snapshot.unit_price, '0.10');
  assert.equal((await request('DELETE', `/sellers/${seller.id}`)).status, 409);
});

test('checkout retries create only one order and reject changed payloads using the same key', async () => {
  const { request, seller } = await register();
  const item = await product(request);
  const body = checkout(item);
  const responses = await Promise.all([guest('POST', `/stores/${seller.id}/orders`, body), guest('POST', `/stores/${seller.id}/orders`, body)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  assert.equal(responses[0].body.id, responses[1].body.id);
  assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '1');
  assert.equal((await guest('GET', `/products/${item.id}`)).body.stock, 8);
  assert.equal((await guest('POST', `/stores/${seller.id}/orders`, { ...body, customer_name: 'Someone else' })).status, 409);
  await request('DELETE', `/products/${item.id}`);
  assert.equal((await guest('POST', `/stores/${seller.id}/orders`, body)).status, 200);
});

test('a displayed total that no longer matches current prices cannot place an order or change stock', async () => {
  const { request, seller } = await register();
  const item = await product(request);
  const body = checkout(item, { expected_total: '251.00' });
  await pool.query('UPDATE products SET price = 150.00 WHERE id = $1', [item.id]);
  assert.equal((await guest('POST', `/stores/${seller.id}/orders`, body)).status, 409);
  assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '0');
  assert.equal((await guest('GET', `/products/${item.id}`)).body.stock, 10);
  assert.equal((await guest('POST', `/stores/${seller.id}/orders`, { ...body, expected_total: '300.00' })).status, 201);
});

test('concurrent checkouts cannot oversell and failed multi-item orders roll back all stock changes', async () => {
  const { request, seller } = await register();
  const scarce = await product(request, { stock: 1 });
  const available = await product(request, { stock: 10 });
  const failed = checkout(available, { items: [{ product_id: available.id, quantity: 3 }, { product_id: scarce.id, quantity: 2 }] });
  assert.equal((await guest('POST', `/stores/${seller.id}/orders`, failed)).status, 409);
  assert.equal((await guest('GET', `/products/${available.id}`)).body.stock, 10);
  assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '0');
  const responses = await Promise.all(Array.from({ length: 2 }, () => guest('POST', `/stores/${seller.id}/orders`, checkout(scarce, { items: [{ product_id: scarce.id, quantity: 1 }] }))));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal((await guest('GET', `/products/${scarce.id}`)).body.stock, 0);
});

test('checkout rejects empty carts, invalid customer details, duplicate items, tampered totals and cross-store products', async () => {
  const { request, seller } = await register();
  const other = await register('other@example.com');
  const item = await product(request);
  const foreign = await product(other.request);
  for (const patch of [{ items: [] }, { customer_name: ' ' }, { customer_phone: 'abc' }, { customer_address: '' }, { items: [{ product_id: item.id, quantity: 0 }] }, { items: [{ product_id: item.id, quantity: 1.5 }] }, { items: [{ product_id: item.id, quantity: 100 }] }, { items: [{ product_id: item.id, quantity: 1 }, { product_id: item.id, quantity: 2 }] }, { total: '0.01' }, { checkout_key: 'bad' }]) {
    assert.equal((await guest('POST', `/stores/${seller.id}/orders`, checkout(item, patch))).status, 400);
  }
  for (const product_id of [foreign.id, '999999']) {
    assert.equal((await guest('POST', `/stores/${seller.id}/orders`, checkout(item, { items: [{ product_id, quantity: 1 }] }))).status, 409);
  }
  assert.equal((await guest('POST', '/stores/999999/orders', checkout(item))).status, 404);
  assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '0');
});

test('auth endpoints limit repeated attempts, reject cross-origin writes and do not expose legacy customer records', async () => {
  const credentials = { email: 'missing@example.com', password: 'incorrect' };
  for (let i = 0; i < 20; i++) assert.equal((await guest('POST', '/auth/login', credentials)).status, 401);
  const limited = await guest('POST', '/auth/login', credentials);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await guest('POST', '/auth/register', registration(), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await guest('POST', '/auth/register', registration(), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await guest('GET', '/users')).status, 404);
  assert.equal((await guest('GET', '/admin')).status, 404);
});

test('frontend routes and assets are served; JSON errors and response headers are safe', async () => {
  const { seller } = await register();
  for (const route of ['/', '/login', '/register', '/seller', `/stores/${seller.id}`, '/products/1', `/cart/${seller.id}`, `/checkout/${seller.id}`, `/${seller.slug}/`]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
  }
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
  const health = await guest('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const malformed = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'Invalid JSON body');
  assert.equal((await fetch(`${base}/api/auth/register`, { method: 'POST', body: 'x=1' })).status, 415);
});

test('shops get unique readable addresses, accept a chosen address and keep it when the display name changes', async () => {
  const { request, seller } = await register();
  assert.equal(seller.slug, 'pema-store');
  const other = await register('second@example.com');
  assert.equal(other.seller.slug, 'pema-store-2');
  const custom = await guest('POST', '/auth/register', { ...registration('custom@example.com'), slug: 'My-Local-Shop' });
  assert.equal(custom.status, 201);
  assert.equal(custom.body.slug, 'my-local-shop');
  const duplicate = await guest('POST', '/auth/register', { ...registration('duplicate@example.com'), slug: 'my-local-shop' });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error, /shop address is already taken/);
  for (const slug of ['api', 'login', 'www', '../seller', 'bad name', '-bad', 'bad-', 'two--hyphens', 'x'.repeat(64)]) {
    assert.equal((await guest('POST', '/auth/register', { ...registration('invalid@example.com'), slug })).status, 400);
  }
  const changed = await request('PATCH', `/sellers/${seller.id}/profile`, { business_name: 'A new name' });
  assert.equal(changed.body.slug, 'pema-store');
  assert.equal((await request('PATCH', `/sellers/${seller.id}/profile`, { slug: 'other-address' })).status, 400);
  for (const slug of reservedShopSlugs) {
    await assert.rejects(pool.query('INSERT INTO sellers (business_name, email, slug) VALUES ($1,$2,$3)',
      ['Reserved', `${slug}@reserved.example`, slug]), { code: '23514' });
  }
});

test('slug allocation handles concurrent registrations and long or non-Latin names', async () => {
  const results = await Promise.all(['first', 'second', 'third'].map(name =>
    client()('POST', '/auth/register', { ...registration(`${name}@example.com`), business_name: 'Same Shop' })));
  assert.deepEqual(results.map(result => result.status), [201, 201, 201]);
  assert.deepEqual(results.map(result => result.body.slug).sort(), ['same-shop', 'same-shop-2', 'same-shop-3']);
  for (const business_name of ['A'.repeat(150), 'ཚོང་ཁང་', 'API']) {
    const result = await client()('POST', '/auth/register', { ...registration(`${business_name === 'API' ? 'reserved' : business_name[0] === 'A' ? 'long' : 'unicode'}@example.com`), business_name });
    assert.equal(result.status, 201);
    assert.ok(result.body.slug.length <= 63);
    assert.match(result.body.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(reservedShopSlugs.has(result.body.slug), false);
  }
});

test('named shop pages resolve and numeric, uppercase and missing-slash links redirect to canonical addresses', async () => {
  const { seller } = await register();
  const profile = await guest('GET', `/shops/${seller.slug}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.id, seller.id);
  assert.equal(Object.hasOwn(profile.body, 'email'), false);
  assert.equal(Object.hasOwn(profile.body, 'password_hash'), false);
  for (const [old, expected] of [
    [`/stores/${seller.id}`, '/pema-store/'], [`/store/${seller.id}`, '/pema-store/'],
    [`/cart/${seller.id}`, '/pema-store/cart/'], [`/checkout/${seller.id}`, '/pema-store/checkout/'],
    ['/pema-store', '/pema-store/'], ['/PEMA-STORE/', '/pema-store/'], ['/pema-store/cart', '/pema-store/cart/'],
  ]) {
    const response = await fetch(`${base}${old}`, { redirect: 'manual' });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), expected);
  }
  for (const route of ['/pema-store/', '/pema-store/cart/', '/pema-store/checkout/', '/login', '/seller']) {
    assert.equal((await fetch(`${base}${route}`)).status, 200);
  }
  assert.equal((await guest('GET', '/shops/unknown-shop')).status, 404);
  assert.equal((await fetch(`${base}/unknown-shop/`)).status, 404);
});


test('seller image uploads validate bytes, require authentication and serve a reusable product image', async () => {
  const { request } = await register();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const headers = { 'Content-Type': 'image/png' };
  assert.equal((await guest('POST', '/uploads/products', png, headers)).status, 401);
  const uploaded = await request('POST', '/uploads/products', png, headers);
  assert.equal(uploaded.status, 201);
  assert.match(uploaded.body.image_url, /^\/images\/uploads\/[a-f0-9-]{36}\.png$/);
  const item = await product(request, { image_url: uploaded.body.image_url });
  assert.equal((await guest('GET', `/products/${item.id}`)).body.image_url, uploaded.body.image_url);
  const image = await fetch(`${base}${uploaded.body.image_url}`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/png/);
  assert.match(image.headers.get('cache-control'), /immutable/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await request('POST', '/uploads/products', Buffer.from('<svg onload="alert(1)"></svg>'.padEnd(64)), headers)).status, 400);
  assert.equal((await request('POST', '/uploads/products', png, { 'Content-Type': 'image/svg+xml' })).status, 415);
  assert.equal((await request('POST', '/uploads/products', png, { ...headers, Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('POST', '/uploads/products', Buffer.alloc(3 * 1024 * 1024 + 1), headers)).status, 413);
  assert.equal((await readdir(uploadDirectory)).length, 1);
});

test('shop address availability is checked without creating accounts', async () => {
  const { seller } = await register();
  assert.deepEqual((await guest('GET', `/shops/${seller.slug}/availability`)).body, { available: false });
  assert.deepEqual((await guest('GET', '/shops/available-shop/availability')).body, { available: true });
  assert.equal((await guest('GET', '/shops/login/availability')).status, 400);
  assert.equal((await pool.query('SELECT count(*) FROM sellers')).rows[0].count, '1');
});
