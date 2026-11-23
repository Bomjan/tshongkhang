# Setup and tests

## Local database

Requirements: Node.js 22+, npm and PostgreSQL 16+. PostgreSQL must be running before migration/startup.

```sh
npm ci
cp .env.example .env
```

From a PostgreSQL administrator session (for example `sudo -u postgres psql` on Linux):

```sql
CREATE ROLE tshongkhang LOGIN PASSWORD 'local_password';
CREATE DATABASE tshongkhang_mid_review OWNER tshongkhang;
CREATE DATABASE tshongkhang_test OWNER tshongkhang;
```

Skip objects that already exist. Set `DATABASE_URL` in `.env`, then:

```sh
npm run migrate
npm run seed:demo  # optional local sample data
npm start
```

Open `http://localhost:3000`. The API is at `/api`; `GET /api/health` checks the web server. `npm run dev` restarts the server when code changes. Startup checks the database connection; migrations are an explicit command.

The optional seed creates `Druk Local Pantry`, six products and `demo@tshongkhang.local` / `Tshongkhang123!`. It never resets or modifies an existing account with that email. Demo product illustrations are served locally; for another public hostname set `DEMO_ORIGIN` before the first seed. The seed is blocked when `NODE_ENV=production`.

## Upgrading

For the simplified mid-review database with migrations `001` and `002`, run `npm run migrate`. Migration `003_sprint_two.sql` adds password hashes, sessions, orders and order items without deleting existing data. Migration `004_shop_slugs.sql` adds unique shop addresses and backfills existing shops. The migration runner records applied filenames and runs new migrations transactionally.

Existing sellers have a null password hash. Use a **new email** to register a demo seller. The app intentionally provides no unauthenticated way to set a password on an old seller. Existing `/api/users` CRUD routes are no longer mounted because they exposed customer records without authentication. The old table remains in the database to preserve its data. This migration is not for older, differently structured storefront databases from Git history.

## Tests

Use a dedicated test database:

```sh
TEST_DATABASE_URL=postgresql://tshongkhang:local_password@localhost:5432/tshongkhang_test npm test
npx playwright install chromium
TEST_DATABASE_URL=postgresql://tshongkhang:local_password@localhost:5432/tshongkhang_test npm run test:browser
```

Both suites create a unique schema and drop only their schema afterward. The API suite covers registration/login/logout, password/session storage, expiration, ownership, public profile privacy, product CRUD/validation, guest checkout, decimal totals, retries, concurrent stock changes, transaction rollback and request protection. The browser suite covers actual desktop and mobile seller/customer flows, image loading, cart persistence/removal, login errors and saved database orders.

On Debian/Ubuntu with `postgresql-common`, run against a disposable cluster:

```sh
pg_virtualenv -t -v 16 npm test
pg_virtualenv -t -v 16 npm run test:browser
```

Browser screenshots go to `/tmp/tshongkhang-browser-<pid>`; override with `SCREENSHOT_DIR`. To use an existing compatible Chromium binary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Browser regressions also cover changing a quantity immediately before clicking an action, mobile dashboard controls, long shop names, password visibility, price changes during checkout, delayed responses, and recovering a lost checkout response after refreshing with no stock left. Receipts persist in the same tab's session storage without customer contact details; there is no public order lookup. When recovering an unconfirmed submission after refresh, re-enter the original details and note so the server can return the same order.

Production hosting and payment are Sprint 3. Production sessions require HTTPS (`Secure` cookies). Authentication limits are in memory and intended for the single-server semester demo.

## Shop addresses

The demo storefront is `/druk-local-pantry/`. Each seller can choose an optional address at registration; use 1–63 lowercase letters, digits and single hyphens. Addresses such as `login`, `api` and `cart` are reserved. Without a chosen address the app generates one from the shop name and suffixes duplicates (`pema-store`, `pema-store-2`). The dashboard displays the canonical shop URL and includes a Copy link button. Editing the display name preserves the address.

`/<shop-address>/cart/` and `/<shop-address>/checkout/` use the same existing cart and order data. `/stores/:id`, `/store/:id`, `/cart/:id` and `/checkout/:id` return permanent redirects to the named routes. `GET /api/shops/:slug` resolves a public shop without exposing credentials or email. The order API continues to use internal seller IDs. Unknown shops return 404.

The current implementation uses path-based addresses. `shop-name.tshongkhang.com` would also need wildcard DNS, wildcard HTTPS and host-based shop resolution; no DNS or production hosting has been changed.

## Seller workspace and images

The seller workspace has Products (`/seller`) and Shop details (`/seller/shop`) pages. Setup guidance reflects the seller’s actual product and contact details. Product lists support searching and stock filtering; the public shop supports search, price/name sorting and an in-stock filter. Filters are reflected in the URL so browser Back restores the browsing context.

Choose an image from your computer when adding or editing a product or shop logo. The browser previews and resizes JPG, PNG or WebP images (up to 10 MB input). The authenticated upload endpoint accepts up to 3 MB per processed image, validates the content signature, generates a random filename and stores it in `uploads/products/`. The folder is ignored by Git and is served under `/images/uploads/`. Keep this folder on persistent storage when deploying; production hosting remains Sprint 3. Direct HTTP(S) image links are still supported under “Or use an image link”.

Checkout proceeds from cart to contact details, then Review order, then Place order. Editing details or visiting the cart preserves the customer’s draft within the current page’s memory; customer details are not written to browser storage. The receipt explains the next steps, provides a copyable reference and shows a shop contact link when available. Unsaved seller edits require confirmation before discarding. Cart changes in another tab do not close an unsaved product editor.
