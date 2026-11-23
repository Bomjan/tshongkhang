import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { migrate } from '../db/migrate.js';
import { seedDemo } from '../db/seed.js';

if (!process.env.TEST_DATABASE_URL && !process.env.PG_CLUSTER_CONF_ROOT) {
  throw new Error('Use TEST_DATABASE_URL or pg_virtualenv to run browser tests.');
}
const schema = `browser_${process.pid}_${Date.now()}`;
const connection = process.env.TEST_DATABASE_URL ? { connectionString: process.env.TEST_DATABASE_URL } : {};
const admin = new pg.Pool(connection);
const screenshots = process.env.SCREENSHOT_DIR || `/tmp/tshongkhang-browser-${process.pid}`;
let pool, server, base, browser, seeded, uploadDirectory;

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({ ...connection, options: `-c search_path=${schema}` });
  await migrate(pool);
  uploadDirectory = await mkdtemp('/tmp/tshongkhang-browser-uploads-');
  server = createApp(pool, { uploadDirectory }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : { channel: 'chromium' }) });
  await mkdir(screenshots, { recursive: true });
});
beforeEach(async () => {
  await pool.query('TRUNCATE order_items, orders, seller_sessions, products, users, sellers RESTART IDENTITY');
  seeded = await seedDemo(pool, base);
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
  if (uploadDirectory) await rm(uploadDirectory, { recursive: true, force: true });
  console.log(`Screenshots: ${screenshots}`);
});

test('desktop: seller registers, manages products, then a guest checks out and the order is saved', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${base}/register`);
    await page.getByLabel('Shop name').fill('Sonam Local Shop');
    await page.getByLabel('Email address').fill('sonam@example.com');
    await page.getByLabel('Password', { exact: true }).fill('my-secure-password');
    await page.getByLabel('Town or dzongkhag').fill('Paro');
    await page.getByRole('button', { name: 'Create my shop' }).click();
    await expect(page.getByRole('heading', { name: 'Sonam Local Shop' })).toBeVisible();
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    let modal = page.getByRole('dialog');
    await modal.getByLabel('Product name').fill('Demo red rice');
    await modal.getByLabel('Description').fill('Rice grown close to home.');
    await modal.getByLabel('Price (Nu.)').fill('125.50');
    await modal.getByLabel('Stock available').fill('8');
    await modal.locator('.image-link-details summary').click();
    await modal.getByLabel('Product image URL').fill(`${base}/images/rice.svg`);
    await modal.getByRole('button', { name: 'Add product', exact: true }).click();
    await expect(page.locator('tbody').getByRole('link', { name: 'Demo red rice', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Demo red rice' }).click();
    modal = page.getByRole('dialog');
    await modal.getByLabel('Price (Nu.)').fill('130.25');
    await modal.getByRole('button', { name: 'Save product' }).click();
    await expect(page.getByRole('cell', { name: 'Nu. 130.25', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    modal = page.getByRole('dialog');
    await modal.getByLabel('Product name').fill('Temporary product');
    await modal.getByLabel('Price (Nu.)').fill('1.00');
    await modal.getByLabel('Stock available').fill('1');
    await modal.getByRole('button', { name: 'Add product', exact: true }).click();
    await expect(page.locator('tbody').getByRole('link', { name: 'Temporary product', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Temporary product' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete product', exact: true }).click();
    await expect(page.locator('tbody').getByRole('link', { name: 'Temporary product', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit shop details' }).click();
    await page.getByRole('main').getByLabel('About your shop').fill('Good food from Paro.');
    await page.getByRole('main').getByRole('button', { name: 'Save shop details' }).click();
    await expect(page.getByLabel('About your shop')).toHaveValue('Good food from Paro.');
    await page.getByRole('navigation', { name: 'Seller workspace' }).getByRole('link', { name: 'Products', exact: true }).click();
    await capture(page, { path: `${screenshots}/seller-dashboard.png`, fullPage: true });
    await page.getByRole('link', { name: 'View my storefront' }).click();
    await expect(page.getByRole('heading', { name: 'Sonam Local Shop' })).toBeVisible();
    await expect(page).toHaveURL(`${base}/sonam-local-shop/`);
    const storePath = new URL(page.url()).pathname;
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Seller login' })).toBeVisible();
    await page.goto(`${base}${storePath}`);
    await page.getByRole('link', { name: 'Demo red rice', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Quantity for Demo red rice', exact: true }).fill('2');
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Cart (2)' })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'View cart', exact: true }).click();
    await expect(page).toHaveURL(`${base}/sonam-local-shop/cart/`);
    await page.reload();
    await expect(page.getByLabel('Quantity for Demo red rice', { exact: true })).toHaveValue('2');
    await page.getByRole('link', { name: 'Continue to checkout' }).click();
    await expect(page).toHaveURL(`${base}/sonam-local-shop/checkout/`);
    await page.getByLabel('Full name').fill('Pema Dorji');
    await page.getByLabel('Phone number').fill('17123456');
    await page.getByLabel('Delivery address').fill('Building 4, Paro town, Paro');
    await page.getByLabel('Note for the seller').fill('Please call before delivery.');
    await capture(page, { path: `${screenshots}/checkout.png`, fullPage: true });
    await placeOrder(page);
    await expect(page.getByRole('heading', { name: 'Your order is placed.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cart (0)' })).toBeVisible();
    await capture(page, { path: `${screenshots}/order-confirmation.png`, fullPage: true });
    assert.match(page.url(), /\/receipt\/[a-f0-9-]{36}$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your order is placed.' })).toBeVisible();
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('receipt_'))
      .some(key => /Pema Dorji|17123456|Please call/.test(sessionStorage.getItem(key)))), false);
    const result = await pool.query('SELECT * FROM orders');
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].total, '260.50');
    assert.equal(result.rows[0].customer_name, 'Pema Dorji');
    assert.equal(result.rows[0].note, 'Please call before delivery.');
    assert.equal((await pool.query("SELECT stock FROM products WHERE name = 'Demo red rice'")).rows[0].stock, 6);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('mobile: demo shop images, search, cart changes, removal, empty state and seller login work', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base);
    await expect(page.getByRole('heading', { name: 'Meet your local shops' })).toBeVisible();
    await capture(page, { path: `${screenshots}/home-mobile.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('link', { name: 'Visit shop' }).click();
    await expect(page.locator('.product-card')).toHaveCount(6);
    for (const image of await page.locator('.catalog-image').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, { path: `${screenshots}/storefront-mobile.png`, fullPage: true });
    await page.getByRole('searchbox', { name: 'Search products' }).fill('lemongrass');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    await page.getByRole('link', { name: 'Cart (1)' }).click();
    await page.getByLabel('Quantity for Lemongrass tea · 50 g', { exact: true }).fill('3');
    await page.getByLabel('Quantity for Lemongrass tea · 50 g', { exact: true }).press('Tab');
    await expect(page.getByRole('link', { name: 'Cart (3)' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove Lemongrass tea' }).click();
    await expect(page.getByRole('heading', { name: 'Your cart is waiting' })).toBeVisible();
    await page.goto(`${base}/seller`);
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    await page.getByLabel('Email address').fill('demo@tshongkhang.local');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect');
    await page.getByLabel('Password', { exact: true }).fill('Tshongkhang123!');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Druk Local Pantry' })).toBeVisible();
    await capture(page, { path: `${screenshots}/dashboard-mobile.png`, fullPage: true });
    const edit = page.getByRole('button', { name: 'Edit Bhutanese red rice' });
    await edit.scrollIntoViewIfNeeded();
    const box = await edit.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    await edit.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, { path: `${screenshots}/edit-product-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Close dialog' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal((await seedDemo(pool, base)).created, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

async function cartFixture(page) {
  const item = (await pool.query('SELECT * FROM products WHERE seller_id = $1 ORDER BY id LIMIT 1', [seeded.sellerId])).rows[0];
  await page.goto(`${base}/products/${item.id}`);
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await page.getByRole('main').getByRole('link', { name: 'View cart', exact: true }).click();
  return item;
}

async function placeOrder(page) {
  const review = page.getByRole('button', { name: 'Review order', exact: true });
  if (await review.isVisible()) await review.click();
  await page.getByRole('button', { name: 'Place order' }).click();
}

async function fillCheckout(page) {
  await page.getByRole('link', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Full name').fill('Customer Demo');
  await page.getByLabel('Phone number').fill('+975 17123456');
  await page.getByLabel('Delivery address').fill('Thimphu town');
}

test('cart: changing a quantity then clicking Remove or Checkout takes effect on the first click', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const item = await cartFixture(page);
    await page.getByLabel(`Quantity for ${item.name}`, { exact: true }).fill('3');
    await page.getByRole('button', { name: `Remove ${item.name}` }).click();
    await expect(page.getByRole('heading', { name: 'Your cart is waiting' })).toBeVisible();
    await cartFixture(page);
    await page.getByLabel(`Quantity for ${item.name}`, { exact: true }).fill('2');
    await page.getByRole('link', { name: 'Continue to checkout' }).click();
    await expect(page.getByRole('heading', { name: 'Your contact & delivery details' })).toBeVisible();
    await expect(page.locator('[data-order-total]')).toHaveText('Nu. 251.00');
    await expect(page.getByRole('button', { name: 'Review order' })).toBeVisible();
  } finally { await context.close(); }
});

test('checkout: changed prices require review and do not save an unexpected order', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const item = await cartFixture(page);
    await fillCheckout(page);
    await pool.query('UPDATE products SET price = 250.00 WHERE id = $1', [item.id]);
    await placeOrder(page);
    await expect(page.getByRole('alert')).toHaveText('Product prices have changed. Review your cart before placing the order');
    assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '0');
    await page.getByRole('link', { name: 'Review updated prices and availability' }).click();
    await expect(page.locator('[data-order-total]')).toHaveText('Nu. 250.00');
    await capture(page, { path: `${screenshots}/cart-desktop.png`, fullPage: true });
  } finally { await context.close(); }
});

test('checkout: a lost response can recover after refresh even when the order consumed the last stock', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let first = true;
  try {
    const item = await cartFixture(page);
    await pool.query('UPDATE products SET stock = 1 WHERE id = $1', [item.id]);
    await fillCheckout(page);
    await page.route('**/api/stores/*/orders', async route => {
      if (first) {
        first = false;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await placeOrder(page);
    await expect(page.getByRole('alert')).toContainText('try again to safely check the same submission');
    await expect(page.getByLabel('Full name')).toHaveAttribute('readonly', '');
    await page.reload();
    await expect(page.getByText('A previous submission may have gone through.')).toBeVisible();
    await page.getByLabel('Full name').fill('Customer Demo');
    await page.getByLabel('Phone number').fill('+975 17123456');
    await page.getByLabel('Delivery address').fill('Thimphu town');
    await placeOrder(page);
    await expect(page.getByRole('heading', { name: 'Your order is placed.' })).toBeVisible();
    assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '1');
    assert.equal((await pool.query('SELECT stock FROM products WHERE id = $1', [item.id])).rows[0].stock, 0);
  } finally { await context.close(); }
});

test('checkout: a delayed completion preserves the current page and products added after submission', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  try {
    const item = await cartFixture(page);
    await fillCheckout(page);
    await page.route('**/api/stores/*/orders', async route => {
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    });
    await placeOrder(page);
    await expect.poll(async () => (await pool.query('SELECT count(*) FROM orders')).rows[0].count).toBe('1');
    await page.getByRole('link', { name: 'Browse shops', exact: true }).click();
    await page.getByRole('link', { name: 'Visit shop', exact: true }).click();
    await page.locator(`[data-add="${item.id}"]`).click();
    await expect(page.getByRole('link', { name: 'Cart (2)' })).toBeVisible();
    release();
    await expect(page.locator('#toast')).toContainText('Your order has been saved');
    await expect(page.getByRole('heading', { name: 'Druk Local Pantry' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cart (1)' })).toBeVisible();
    await page.getByRole('link', { name: 'View receipt' }).click();
    await expect(page.getByRole('heading', { name: 'Your order is placed.' })).toBeVisible();
  } finally { release(); await context.close(); }
});

test('small screens: long names, password visibility and cart-to-checkout layouts remain usable', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/login`);
    await page.getByLabel('Password', { exact: true }).fill('Tshongkhang123!');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await capture(page, { path: `${screenshots}/login-mobile.png`, fullPage: true });
    await pool.query('UPDATE sellers SET business_name = $1 WHERE id = $2', ['A'.repeat(150), seeded.sellerId]);
    await page.goto(`${base}/stores/${seeded.sellerId}`);
    await expect(page).toHaveURL(`${base}/druk-local-pantry/`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const item = await cartFixture(page);
    await page.getByLabel(`Quantity for ${item.name}`, { exact: true }).fill('2');
    await fillCheckout(page);
    await capture(page, { path: `${screenshots}/checkout-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Review order', exact: true }).click();
    await capture(page, { path: `${screenshots}/checkout-review-mobile.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await context.close(); }
});

test('registration accepts a chosen shop address and the dashboard shares the canonical storefront link', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${base}/register`);
    await page.getByLabel('Shop name', { exact: true }).fill('Himalaya Crafts');
    await page.getByLabel('Shop address (optional)').fill('himalaya-crafts');
    await page.getByLabel('Email address').fill('crafts@example.com');
    await page.getByLabel('Password', { exact: true }).fill('semester-demo-password');
    await page.getByRole('button', { name: 'Create my shop' }).click();
    await expect(page.getByRole('heading', { name: 'Himalaya Crafts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View my storefront' })).toHaveAttribute('href', '/himalaya-crafts/');
    await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'View my storefront' }).click();
    await page.reload();
    await expect(page).toHaveURL(`${base}/himalaya-crafts/`);
    await expect(page.getByRole('heading', { name: 'Himalaya Crafts' })).toBeVisible();
  } finally { await context.close(); }
});

async function capture(page, options) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot(options);
}

async function loginSeller(page) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Email address').fill('demo@tshongkhang.local');
  await page.getByLabel('Password', { exact: true }).fill('Tshongkhang123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Druk Local Pantry' })).toBeVisible();
}

test('seller workspace: a real image can be selected, previewed, saved and served; unsaved edits need an explicit discard', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${base}/druk-local-pantry/`);
    const photo = await page.locator('.product-card .product-picture').first().screenshot();
    await loginSeller(page);
    await page.getByRole('button', { name: 'Edit Bhutanese red rice' }).click();
    let modal = page.getByRole('dialog', { name: 'Edit product', exact: true });
    await modal.getByLabel('Choose image file').setInputFiles({ name: 'rice.png', mimeType: 'image/png', buffer: photo });
    await expect(modal.locator('.image-preview img')).toHaveAttribute('src', /^blob:/);
    await capture(page, { path: `${screenshots}/image-upload-preview.png` });
    await modal.getByRole('button', { name: 'Save product' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const saved = (await pool.query("SELECT image_url, description FROM products WHERE name = 'Bhutanese red rice · 1 kg'")).rows[0];
    assert.match(saved.image_url, /^\/images\/uploads\/[a-f0-9-]{36}\.webp$/);
    const result = await fetch(`${base}${saved.image_url}`);
    assert.equal(result.status, 200);
    assert.match(result.headers.get('content-type'), /image\/webp/);
    await page.getByRole('button', { name: 'Edit Bhutanese red rice' }).click();
    modal = page.getByRole('dialog', { name: 'Edit product', exact: true });
    await modal.getByLabel('Description').fill('An edit that should not be saved.');
    const shoppingTab = await context.newPage();
    await shoppingTab.goto(`${base}/druk-local-pantry/`);
    await shoppingTab.locator('[data-add]').first().click();
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Description')).toHaveValue('An edit that should not be saved.');
    await shoppingTab.close();
    await modal.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.getByRole('dialog', { name: 'Discard your changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(modal.getByLabel('Description')).toHaveValue('An edit that should not be saved.');
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(modal).not.toBeVisible();
    assert.equal((await pool.query("SELECT description FROM products WHERE name = 'Bhutanese red rice · 1 kg'")).rows[0].description, saved.description);
    await page.getByRole('navigation', { name: 'Seller workspace' }).getByRole('link', { name: 'Shop details' }).click();
    await page.getByLabel('About your shop').fill('Pantry favourites from Thimphu.');
    await page.getByRole('navigation', { name: 'Seller workspace' }).getByRole('link', { name: 'Products', exact: true }).click();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByLabel('About your shop')).toHaveValue('Pantry favourites from Thimphu.');
    await page.getByRole('button', { name: 'Save shop details' }).click();
    await expect(page.getByLabel('About your shop')).toHaveValue('Pantry favourites from Thimphu.');
    await capture(page, { path: `${screenshots}/shop-settings-desktop.png`, fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('discovery: product sorting, availability, search and browser back restore the shopping context', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await pool.query("UPDATE products SET stock = 0 WHERE name = 'Lemongrass tea · 50 g'");
    await page.goto(`${base}/druk-local-pantry/`);
    await page.getByRole('combobox', { name: 'Sort products' }).selectOption('price-low');
    await expect(page.locator('.product-card h3').first()).toHaveText('Bhutanese red rice · 1 kg');
    await page.getByRole('combobox', { name: 'Sort products' }).selectOption('price-high');
    await expect(page.locator('.product-card h3').first()).toHaveText('Handmade wooden bowl');
    await page.getByRole('checkbox', { name: 'In stock only' }).check();
    await expect(page.locator('.product-card')).toHaveCount(5);
    await page.getByRole('searchbox', { name: 'Search products' }).fill('no-matches');
    await expect(page.getByRole('heading', { name: 'No products match just yet' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('searchbox', { name: 'Search products' }).fill('rice');
    await page.getByRole('link', { name: 'Bhutanese red rice · 1 kg', exact: true }).click();
    await page.goBack();
    await expect(page.getByRole('searchbox', { name: 'Search products' })).toHaveValue('rice');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.goto(base);
    await page.getByRole('searchbox', { name: 'Search shops and products' }).fill('honey');
    await expect(page.locator('#market-products .product-card')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Search shops and products' }).fill('nothing-to-find');
    await expect(page.getByRole('heading', { name: 'No shops match your search' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await capture(page, { path: `${screenshots}/home-desktop.png`, fullPage: true });
  } finally { await context.close(); }
});

test('checkout review: edits and a cart round-trip keep details in memory and only Place order creates an order', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    const item = await cartFixture(page);
    await fillCheckout(page);
    await expect(page.getByRole('button', { name: 'Place order' })).not.toBeVisible();
    await page.getByRole('button', { name: 'Review order', exact: true }).click();
    await expect(page.locator('#review-details')).toContainText('Customer Demo');
    assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '0');
    await page.getByRole('button', { name: 'Edit details', exact: true }).click();
    await page.getByLabel('Delivery address').fill('Updated address, Paro');
    await page.getByRole('link', { name: 'Back to cart', exact: true }).click();
    await page.getByRole('button', { name: `Increase quantity for ${item.name}`, exact: true }).click();
    await page.getByRole('link', { name: 'Continue to checkout' }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('Customer Demo');
    await expect(page.getByLabel('Delivery address')).toHaveValue('Updated address, Paro');
    await page.getByRole('button', { name: 'Review order', exact: true }).click();
    await expect(page.locator('#review-details')).toContainText('Updated address, Paro');
    await expect(page.locator('[data-order-total]')).toHaveText('Nu. 251.00');
    await capture(page, { path: `${screenshots}/checkout-review-desktop.png`, fullPage: true });
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('heading', { name: 'Your order is placed.' })).toBeVisible();
    assert.equal((await pool.query('SELECT customer_address FROM orders')).rows[0].customer_address, 'Updated address, Paro');
    assert.equal(await page.evaluate(() => Object.values(sessionStorage).some(value => value.includes('Updated address, Paro'))), false);
  } finally { await context.close(); }
});

test('mobile navigation and registration show a live shop address and clear availability feedback', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Seller login', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Open a shop', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeVisible();
    await page.getByLabel('Shop name', { exact: true }).fill('Druk Local Pantry');
    await expect(page.getByLabel('Shop address (optional)')).toHaveValue('druk-local-pantry');
    await expect(page.locator('#address-availability')).toHaveText('Already in use. Choose another address.');
    await page.getByLabel('Shop address (optional)').fill('my-new-bhutan-shop');
    await expect(page.locator('#address-preview')).toContainText('/my-new-bhutan-shop/');
    await expect(page.locator('#address-availability')).toHaveText('This address is available');
    await capture(page, { path: `${screenshots}/registration-mobile.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await context.close(); }
});
