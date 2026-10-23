# Tshongkhang — mid-review CRUD backend

A simple semester-project backend for **users, sellers, and their profiles**, demonstrated through Postman. Built with Node.js, Express, JavaScript ES modules, PostgreSQL, `pg`, dotenv, and Zod.

**Current sprint:** CRUD and profile management only. **Next sprint:** authentication, ownership checks, and admin features. All current endpoints are open for the local demonstration; use sample data.

## Setup

Requirements: Node.js 22+, npm, PostgreSQL 16+, and Postman for the demo.

```sh
npm ci
cp .env.example .env
```

Create a database from a PostgreSQL administrator session (for example `sudo -u postgres psql` on Linux):

```sql
CREATE ROLE tshongkhang LOGIN PASSWORD 'local_password';
CREATE DATABASE tshongkhang_mid_review OWNER tshongkhang;
```

If the role already exists, only create the database. Update `DATABASE_URL` in `.env` for your machine, then:

```sh
npm run migrate
npm start
# Optional: restart automatically during development
npm run dev
```

Default address: `http://localhost:3000/api`. Check `GET /api/health`.

**Moving from the earlier implementation:** use this new empty database. The schema has been simplified; this is not an upgrade migration for the earlier storefront/order database. Do not run it against that database. Nothing automatically drops or converts previous data. The earlier implementation remains in Git history.

## API

No authorization header or token is required. JSON request bodies use `Content-Type: application/json`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check that the API process responds |
| POST | `/api/users` | Create a user record |
| GET | `/api/users` | List users |
| GET | `/api/users/:id` | Read one user |
| PUT | `/api/users/:id` | Replace editable user fields |
| DELETE | `/api/users/:id` | Delete a user and its profile |
| GET | `/api/users/:id/profile` | View profile fields |
| PATCH | `/api/users/:id/profile` | Edit selected profile fields |
| POST | `/api/sellers` | Create a seller record |
| GET | `/api/sellers` | List sellers |
| GET | `/api/sellers/:id` | Read one seller |
| PUT | `/api/sellers/:id` | Replace editable seller fields |
| DELETE | `/api/sellers/:id` | Delete a seller and its profile |
| GET | `/api/sellers/:id/profile` | View business profile fields |
| PATCH | `/api/sellers/:id/profile` | Edit selected business profile fields |

Minimal user body for POST/PUT:

```json
{ "name": "Pema", "email": "pema@example.com" }
```

Optional fields: `phone`, `address`, `avatar_url`.

Minimal seller body for POST/PUT:

```json
{ "business_name": "Pema Store", "email": "shop@example.com" }
```

Optional fields: `phone`, `location`, `description`, `logo_url`.

**PUT replaces the editable record:** required name/business name and email must be supplied; omitted optional fields reset to empty text or null. **PATCH profile edits only supplied fields:** user profiles accept `name`, `phone`, `address`, `avatar_url`; seller profiles accept `business_name`, `phone`, `location`, `description`, `logo_url`. Email changes use PUT. Profile responses omit email and `created_at`; full record endpoints include them.

Profiles are stored on their user/seller row. Creating a record creates its profile fields; deleting the record deletes them. Users and sellers are independent in this checkpoint, with no foreign key between them. The same email can occur once in each table.

Emails are lowercase and unique within each table. Optional phones/images accept `null`; addresses/locations/descriptions accept empty strings. Image URLs must use HTTP(S); image contents are not checked. IDs are positive numeric strings. Unknown body fields and empty profile PATCH requests are rejected.

Status codes: **201** created, **200** success, **204** deleted (no body), **400** invalid input/JSON/ID, **404** missing record/route, **409** duplicate email, **413** oversized JSON, **500** unexpected server error. Errors return `{ "error": "message" }`, with `details` for validation errors.

## Postman demonstration

1. Import [the Postman collection](postman/Tshongkhang-Mid-Review.postman_collection.json).
2. Confirm the collection variable `base_url` is `http://localhost:3000/api`.
3. Select **No Auth**; the imported collection already uses it.
4. Run the collection in order, or send requests in order inside each folder.
5. Create requests automatically save `user_id` and `seller_id`. Each request checks its expected HTTP status.
6. The last requests delete demo records and verify 404. If you stop before deletion, delete the saved record before rerunning the same create request, or change its email.

See [the detailed demonstration guide](docs/postman-demo.md), [curl examples](docs/curl.md), and [the tutor preparation guide](docs/semester-review-guide.md).

## Structure

```text
src/
  app.js             Express setup and route mounting
  server.js          Start/stop server and connect to PostgreSQL
  config/            Environment validation, connection pool, migration transaction helper
  routes/            User and seller endpoint definitions
  controllers/       Small functions containing SQL and HTTP responses
  middleware/        Request validation and centralized errors
  schemas/           Zod request rules
db/
  migrate.js         Apply SQL files once using schema_migrations
  migrations/        Two application tables
tests/              HTTP + PostgreSQL integration tests
postman/            Importable collection
docs/               ERD, demo instructions, technical explanation and tutor questions
```

SQL stays directly in the controllers for this small CRUD checkpoint. No service/repository layer, authentication library, admin module, product module, or order module is needed. See the [schema ERD](docs/erd.md).

## Tests

Use a dedicated database owned by the test role:

```sql
CREATE DATABASE tshongkhang_mid_review_test OWNER tshongkhang;
```

```sh
TEST_DATABASE_URL=postgresql://tshongkhang:local_password@localhost:5432/tshongkhang_mid_review_test npm test
```

Tests create a uniquely named temporary schema and drop only that schema afterward. They check user/seller CRUD, profile changes, validation, duplicate emails, missing records, malformed JSON, and removal of the earlier routes.

On Debian/Ubuntu with PostgreSQL 16 and `postgresql-common`, a disposable database is another option:

```sh
pg_virtualenv -v 16 bash -c 'TEST_DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@localhost:$PGPORT/$PGDATABASE" npm test'
```

## Deferred work

Next sprint: secure account registration/login, password hashing, token authentication, authorization/record ownership, and admin roles. Products, storefront slugs, checkout, orders, stock management, payment verification, notifications, file uploads, and frontend work are not part of this mid-review API. Lists are unpaginated and deletion is permanent in this version.
