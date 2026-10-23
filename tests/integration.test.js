import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { migrate } from '../db/migrate.js';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a PostgreSQL test database (see README).');
}
const schema = `test_${process.pid}_${Date.now()}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let pool, server, base;

async function request(method, route, body) {
  const response = await fetch(`${base}/api${route}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  await migrate(pool);
  await migrate(pool);
  server = createApp(pool).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await pool.query('TRUNCATE users, sellers RESTART IDENTITY');
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

for (const resource of [
  { route: '/users', nameField: 'name', profileField: 'address' },
  { route: '/sellers', nameField: 'business_name', profileField: 'location' },
]) {
  test(`${resource.route}: create, list, read, replace, profile edit and delete without authentication`, async () => {
    const data = { [resource.nameField]: 'Pema', email: 'PEMA@example.com', phone: '17123456' };
    const created = await request('POST', resource.route, data);
    assert.equal(created.status, 201);
    assert.equal(created.body.email, 'pema@example.com');
    assert.equal(typeof created.body.id, 'string');
    const url = `${resource.route}/${created.body.id}`;
    const listed = await request('GET', resource.route);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.map(row => row.id), [created.body.id]);
    assert.equal((await request('GET', url)).body[resource.nameField], 'Pema');

    const replaced = await request('PUT', url, { ...data, [resource.nameField]: 'New name' });
    assert.equal(replaced.status, 200);
    assert.equal(replaced.body[resource.nameField], 'New name');
    assert.equal(replaced.body[resource.profileField], '');
    const changed = await request('PATCH', `${url}/profile`, { [resource.profileField]: 'Paro' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body[resource.profileField], 'Paro');
    assert.equal(changed.body[resource.nameField], 'New name');
    assert.equal(Object.hasOwn(changed.body, 'email'), false);
    const profile = await request('GET', `${url}/profile`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body[resource.profileField], 'Paro');
    assert.equal(Object.hasOwn(profile.body, 'email'), false);
    assert.equal((await request('GET', url)).body[resource.profileField], 'Paro');

    const cleared = await request('PATCH', `${url}/profile`, { phone: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.phone, null);
    const removed = await request('DELETE', url);
    assert.equal(removed.status, 204);
    assert.equal(removed.body, null);
    for (const [method, route, body] of [
      ['GET', url], ['GET', `${url}/profile`], ['PUT', url, data],
      ['PATCH', `${url}/profile`, { phone: null }], ['DELETE', url],
    ]) assert.equal((await request(method, route, body)).status, 404);
    assert.deepEqual((await request('GET', resource.route)).body, []);
  });

  test(`${resource.route}: validates fields and IDs and rejects duplicate emails`, async () => {
    const data = { [resource.nameField]: 'Pema', email: 'pema@example.com' };
    assert.equal((await request('POST', resource.route, data)).status, 201);
    assert.equal((await request('POST', resource.route, { ...data, email: 'PEMA@example.com' })).status, 409);
    for (const invalid of [
      {}, { ...data, email: 'invalid' }, { ...data, [resource.nameField]: ' ' },
      { ...data, password: 'not-supported' }, { ...data, phone: 'abc' },
    ]) assert.equal((await request('POST', resource.route, invalid)).status, 400);
    for (const id of ['abc', '0', '-1', '9223372036854775808']) {
      assert.equal((await request('GET', `${resource.route}/${id}`)).status, 400);
    }
    const url = `${resource.route}/1/profile`;
    assert.equal((await request('PATCH', url, {})).status, 400);
    assert.equal((await request('PATCH', url, { email: 'other@example.com' })).status, 400);
    assert.equal((await request('PATCH', url, { [resource.profileField]: 'x'.repeat(501) })).status, 400);
    const imageField = resource.route === '/users' ? 'avatar_url' : 'logo_url';
    assert.equal((await request('PATCH', url, { [imageField]: 'javascript:alert(1)' })).status, 400);
    assert.equal((await request('PATCH', url, { [imageField]: 'not-a-url' })).status, 400);
  });
}

test('health route works and authentication, admin and commerce routes are absent', async () => {
  assert.equal((await request('GET', '/health')).status, 200);
  assert.equal((await request('POST', '/auth/login', {})).status, 404);
  assert.equal((await request('GET', '/admin')).status, 404);
  assert.equal((await request('GET', '/seller/products')).status, 404);
  assert.equal((await request('POST', '/stores/shop/orders', {})).status, 404);
});

test('malformed JSON returns a clear error', async () => {
  const response = await fetch(`${base}/api/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken',
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Invalid JSON body');
});
