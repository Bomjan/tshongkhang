# Tshongkhang backend

A student-friendly storefront and guest order API for Bhutanese small businesses. Built with Node.js, Express 5, JavaScript ES modules, PostgreSQL, `pg`, bcrypt, JWT, dotenv, and Zod. There is no frontend.

## Local setup

Requirements: Node.js 22 or newer, npm, and PostgreSQL 16 or newer. The curl examples also use `jq`.

1. Install dependencies:

   ```sh
   npm ci
   cp .env.example .env
   ```

2. Create a local database and role. On a Linux PostgreSQL installation, open an administrator session with `sudo -u postgres psql`, then run:

   ```sql
   CREATE ROLE tshongkhang LOGIN PASSWORD 'local_password';
   CREATE DATABASE tshongkhang OWNER tshongkhang;
   ```

3. Edit `.env` with your database URL. Generate a JWT secret using `openssl rand -hex 32` and replace the example value. The application requires a secret of at least 32 characters. Do not commit `.env`.

4. Apply migrations and start the server:

   ```sh
   npm run migrate
   npm start
   # Or, to restart on source changes:
   npm run dev
   ```

The API listens on `http://localhost:3000/api` by default. Configuration is validated at startup, and startup checks the database connection. Apply migrations separately before starting. Migrations run in a transaction, record filenames in `schema_migrations`, and may safely be run again. They are forward-only: add a new SQL file for future changes instead of editing an applied migration.

## Schema and request flow

See the [Mermaid ERD](docs/erd.md) and [SQL migration](db/migrations/001_initial.sql).

- A seller owns products and receives orders. Each order has customer contact/delivery fields because checkout is anonymous.
- `order_items` contains product references plus immutable purchase-time product names and unit prices. Later product edits do not change existing orders. Foreign keys restrict deletions; product deactivation uses `is_active = false`.
- IDs use PostgreSQL `BIGINT`; API responses represent them as strings. Checkout accepts string IDs or safe integer IDs. Monetary values use `NUMERIC(12,2)` and decimal strings such as `"125.50"`. Calculations use `BigInt` integer chhetrum (hundredths of a ngultrum); no floating-point totals or implicit rounding.
- Orders store 24 cryptographically random bytes as a unique 48-character hexadecimal reference (192 bits). A reference grants guest tracking and payment-proof submission access to that one order. Keep it private.

A request passes through JSON parsing, JWT authentication for seller routes, Zod validation, a controller, and a service containing parameterized SQL. Seller identity comes only from a verified JWT subject. Seller product and order queries include that seller ID. Dynamic update column names come from fixed allowlists.

Checkout merges duplicate product IDs before checking stock. One checked-out `pg` client runs `BEGIN`, locks the storefront's requested products using `SELECT ... ORDER BY id FOR UPDATE`, validates availability, calculates the total, creates the order and snapshots, decrements stock, and commits. A failure rolls back all writes. Concurrent checkouts serialize on product locks and see the remaining stock after the previous transaction commits. Requests cannot supply prices, totals, seller IDs, or initial status.

Status updates lock the owned order before checking its current status. Cancellation locks its products in the same ID order as checkout and restores stock in the same transaction as the status change. A later or simultaneous cancellation sees `Cancelled` and returns 409 without restoring stock again. Product stock edits use PostgreSQL row locks as part of `UPDATE`; `stock` is an absolute available-stock count when supplied by the seller.

## Endpoints

All request and response bodies are JSON. Send `Content-Type: application/json` for JSON bodies. Seller endpoints require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Register seller; return profile and JWT |
| POST | `/api/auth/login` | Return JWT |
| GET | `/api/seller/profile` | Own business profile |
| PATCH | `/api/seller/profile` | Update business fields |
| POST | `/api/seller/products` | Create owned product |
| GET | `/api/seller/products` | List all owned products, including inactive |
| PATCH | `/api/seller/products/:id` | Edit or deactivate owned product |
| GET | `/api/stores/:slug` | Public business profile |
| GET | `/api/stores/:slug/products` | Active products only |
| POST | `/api/stores/:slug/orders` | Guest checkout |
| GET | `/api/orders/:reference` | Minimal guest order tracking |
| PATCH | `/api/orders/:reference/payment-proof` | Submit/replace proof while Placed |
| GET | `/api/seller/orders?status=Placed` | List own orders, optionally filtered by status |
| GET | `/api/seller/orders/:id` | Own order details including proof and items |
| PATCH | `/api/seller/orders/:id/status` | Validate transition and update status |

**Registration:** `business_name`, `email`, `password`, `phone`, `location`, `storefront_slug`, optional `qr_image_url`. Email is normalized to lowercase. Passwords require at least 10 characters and at most 72 UTF-8 bytes (bcrypt's input limit). Slugs are 3–80 lowercase letters/digits separated by single hyphens, e.g. `paro-rice-shop`. Duplicate emails or slugs return 409.

**Profile PATCH:** any of `business_name`, `phone`, `location`, `storefront_slug`, `qr_image_url`. Email/password changes are outside this checkpoint. QR/image URLs accept HTTP(S) URLs or `null`; the server stores URLs and does not fetch them or verify their image contents.

**Products:** `name`, `price` (positive decimal string with exactly two fractional digits), `stock` (non-negative integer), optional `description`, `image_url`, `is_active`. PATCH accepts a nonempty subset of these fields. Set `is_active` to `false` to deactivate. There is no product deletion endpoint.

**Checkout:** `customer_name`, `customer_phone`, `delivery_address`, and a nonempty `items` array of `{ "product_id": "1", "quantity": 2 }`. At most 100 input lines per request. The response includes the reference, status, total, timestamps, and snapshots; it omits customer data and proof URLs. Save the reference when checkout succeeds.

**Payment proof:** `{ "payment_proof_url": "https://example.com/proof.png" }`. The status remains `Placed`. Proof may be replaced only before seller confirmation. Sellers inspect it through their order detail endpoint and manually confirm receipt. They may confirm an independently verified payment without an uploaded proof.

**Status PATCH:** `{ "status": "Payment Confirmed" }`. Valid forward transitions are:

```text
Placed → Payment Confirmed → Packed → Delivered
   └───────────┴──────────────┘
                   ↓
               Cancelled
```

`Placed`, `Payment Confirmed`, and `Packed` may transition to `Cancelled` with a nonblank `cancellation_reason` (maximum 500 characters). `Delivered` and `Cancelled` are terminal. Repeating the current status or skipping a step returns 409. Only the seller can change status or cancel. Paid cancellations can require a manual refund arranged outside the application; this backend does not process or track refunds.

**Privacy:** storefront profiles contain only business name, business phone, location, slug, and QR URL. Public product lists contain product fields only. Guest tracking contains reference, status, total, cancellation reason, timestamps, and item snapshots, excluding customer name, phone, delivery address, internal order ID, and payment proof. Sellers should keep cancellation reasons appropriate for customers to read.

**Errors:** `{ "error": "message" }`, with `details` for validation failures. Codes: 201 created, 200 success, 400 invalid request, 401 missing/invalid/expired token or bad credentials, 404 missing or foreign-owned resource, 409 duplicate email/slug, stock conflict or invalid transition, 413 oversized body, 429 authentication rate limit, 500 unexpected server failure. Unknown request-body fields are rejected. JSON bodies are capped at 32 KiB.

JWTs use HS256, a fixed issuer/audience and configurable expiry (default 12 hours). Logout consists of discarding the token; there is no token revocation/refresh or password reset in this checkpoint. Authentication endpoints share a default limit of 20 requests per IP per 15 minutes (including registration). The limiter is in memory for this single-process backend. Express does not trust proxy headers by default.

## Complete curl workflow

See [copyable curl examples](docs/curl.md) for registration, login, profile edits, products, guest checkout, proof submission, seller verification, packing/delivery, status filtering, cancellation, and product deactivation.

## Integration tests

Tests use real PostgreSQL and real HTTP requests through Express. They create a unique temporary schema, migrate it, and drop only that schema afterward. The test role needs `CREATE` on the selected database. Use a dedicated local test database:

```sql
-- Run as a database administrator:
CREATE DATABASE tshongkhang_test OWNER tshongkhang;
```

```sh
TEST_DATABASE_URL=postgresql://tshongkhang:local_password@localhost:5432/tshongkhang_test npm test
```

On Debian/Ubuntu with `postgresql-common` and PostgreSQL 16 installed, a disposable cluster is another option (it needs permission to create local sockets):

```sh
pg_virtualenv -v 16 bash -c 'TEST_DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@localhost:$PGPORT/$PGDATABASE" npm test'
```

Tests cover password hashing/JWT/login, rate limiting, seller isolation, public response privacy, status filters and transitions, duplicate items, snapshots and exact money, inactive/foreign products, partial-write rollback, simultaneous checkouts and cancellations, overlapping carts, foreign keys, and stock constraints. Missing `TEST_DATABASE_URL` fails explicitly rather than silently skipping database tests.

## Project layout

```text
src/
  app.js                  Express wiring, independent of the listening server
  server.js               Startup, configuration, shutdown
  config/                 Environment validation, pg pool, transaction helper
  routes/                 Endpoint definitions
  controllers/            HTTP input/output
  services/               SQL and business rules
  middleware/             JWT, validation, centralized errors
  schemas/                Zod request schemas
db/
  migrate.js              Transactional migration runner
  migrations/             SQL schema
docs/                     ERD and curl workflow
tests/                    PostgreSQL/HTTP integration tests
```

## Checkpoint limits

The requested checkpoint features are implemented. Deliberately excluded: frontend, file uploads, bank gateway integration, notifications, themes, shipping calculations, discounts, customer accounts, deployment, and automated refunds. Image URLs are stored as supplied after URL validation. List endpoints are unpaginated for this checkpoint. There is no checkout idempotency key: retrying a successful checkout creates another order, so save and use its returned reference.
