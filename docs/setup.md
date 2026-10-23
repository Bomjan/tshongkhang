# Setup and tests

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

If you already use the simplified mid-review database, run `npm run migrate` again to apply `002_products.sql`. Existing users and sellers are preserved.

## Tests

Use a dedicated database owned by the test role:

```sql
CREATE DATABASE tshongkhang_mid_review_test OWNER tshongkhang;
```

```sh
TEST_DATABASE_URL=postgresql://tshongkhang:local_password@localhost:5432/tshongkhang_mid_review_test npm test
```

Tests create a uniquely named temporary schema and drop only that schema afterward. The nine tests check user/seller/product CRUD, profile changes, validation, duplicate emails, missing records, seller filtering, product foreign keys, malformed JSON, and removal of the earlier routes.

On Debian/Ubuntu with PostgreSQL 16 and `postgresql-common`, a disposable database is another option:

```sh
pg_virtualenv -v 16 bash -c 'TEST_DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@localhost:$PGPORT/$PGDATABASE" npm test'
```
