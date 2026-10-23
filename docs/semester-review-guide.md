# Tshongkhang: mid-review progress and technical guide

**Checkpoint:** semester mid-review, October 2026

**Demonstration tool:** Postman

**Current scope:** simple user, seller, and product CRUD, plus user/seller profile viewing/editing

**Next sprint:** authentication, authorization, and admin

This guide describes the simplified code currently in this repository. The earlier storefront/order implementation is available in Git history, but it is not the implementation being presented at this checkpoint.

## 1. How to introduce the project

> “Tshongkhang is a planned storefront and management system for small businesses in Bhutan. For our mid-review, we have completed the basic backend foundation: creating, reading, updating, and deleting user, seller, and product records, and managing user/seller profiles. We demonstrate these APIs using Postman. Authentication and admin features are planned for the next sprint.”

This separates the long-term idea from the work actually completed. Do not present the current user creation endpoint as secure signup: it creates a database record and does not create login credentials.

## 2. Progress at this checkpoint

| Area | Current state | Evidence to show |
| --- | --- | --- |
| Node.js/Express backend | Implemented | `src/app.js`, `src/server.js` |
| PostgreSQL connection | Implemented | `src/config/database.js` |
| User CRUD | Implemented | `src/routes/user.js`, `src/controllers/user.js` |
| Seller CRUD | Implemented | `src/routes/seller.js`, `src/controllers/seller.js` |
| Product CRUD and seller filtering | Implemented | `src/routes/product.js`, `src/controllers/product.js` |
| User profile viewing/editing | Implemented | User profile GET/PATCH endpoints |
| Seller profile viewing/editing | Implemented | Seller profile GET/PATCH endpoints |
| Validation | Implemented | `src/schemas/requests.js` |
| Error responses | Implemented | `src/middleware/errors.js` |
| SQL migrations and ERD | Implemented | `db/migrations/`, `docs/erd.md` |
| Postman examples | Provided | Importable collection in `postman/` |
| Integration tests | Implemented | `tests/integration.test.js` |
| Authentication and ownership | Next sprint | No passwords, login, JWTs, or protected routes now |
| Admin | Next sprint | No admin routes or role permissions now |
| Checkout, orders, payments | Outside this checkpoint | No active modules/endpoints for them |
| Frontend | Outside this checkpoint | Postman acts as the API client |

The simplified backend uses only four runtime dependencies: `express`, `pg`, `dotenv`, and `zod`. Password/token/rate-limit libraries from the earlier version have been removed.

### What “complete” means here

The agreed CRUD checkpoint is implemented. The overall Tshongkhang product is still incomplete. In particular, these endpoints do not identify the caller or restrict who may edit a record. Demonstrate them locally using sample data.

## 3. The main concepts

| Term | Meaning in this project |
| --- | --- |
| Backend | The program that receives HTTP requests and reads/writes PostgreSQL |
| API | The set of endpoints Postman can call |
| Endpoint | A method plus a URL, such as `POST /api/users` |
| HTTP | The request/response protocol used between Postman and Express |
| JSON | The data format used in request and response bodies |
| CRUD | Create, Read, Update, Delete |
| Route | Connects a URL and HTTP method to its handler |
| Controller | Runs the SQL for a request and sends the HTTP response |
| Middleware | Code that runs during request handling, such as validation |
| Schema | Either the database structure or the Zod rules for input; say which one |
| Migration | A versioned SQL file that creates or changes database structure |
| Primary key | A unique row identifier, such as `users.id` |
| Constraint | A database rule, such as unique email or nonblank name |
| Connection pool | A small collection of database connections reused by requests |

## 4. Why these technologies were selected

| Technology | Role | Why it fits this checkpoint |
| --- | --- | --- |
| Node.js | Runs JavaScript on the server | One language for the backend and request data handling |
| Express | Routes, JSON parsing, middleware, responses | Small amount of code for ordinary CRUD APIs |
| JavaScript ES modules | `import`/`export` between files | Straightforward organization; enabled by `"type": "module"` |
| PostgreSQL | Persistent relational database | Supports constraints, generated IDs, and ordinary SQL |
| `pg` | Connects Node.js to PostgreSQL | Allows SQL to remain visible and easy to explain |
| dotenv | Reads local environment configuration | Keeps machine-specific database credentials out of source code |
| Zod | Validates request bodies and IDs | Gives consistent errors before invalid input reaches SQL |
| Node's test runner | Runs integration tests | No separate test framework dependency |
| Postman | Sends and inspects HTTP requests | Demonstrates the backend without building a frontend |

We deliberately avoid a generic repository layer, an ORM, a service layer, microservices, and a complicated dependency injection setup. For this amount of CRUD, routes, controllers, validation, and SQL are enough.

## 5. Folder structure and what to open during questions

```text
src/
  app.js                     Creates Express and mounts routes
  server.js                  Loads configuration, connects, starts listening
  config/
    env.js                   Validates environment variables
    database.js              pg pool and migration transaction helper
  routes/
    user.js                  User endpoint definitions
    seller.js                Seller endpoint definitions
    product.js               Product endpoint definitions
  controllers/
    user.js                  User SQL and response handling
    seller.js                Seller SQL and response handling
    product.js               Product SQL and response handling
  middleware/
    validate.js              Turns Zod validation failures into HTTP 400
    errors.js                Central error handling and HttpError
  schemas/
    requests.js              Input shapes and validation rules
db/
  migrate.js                 Applies unapplied SQL files
  migrations/
    001_mid_review.sql       Creates users and sellers
    002_products.sql         Adds products linked to sellers
tests/
  integration.test.js        Real PostgreSQL and HTTP tests
postman/
  Tshongkhang-Mid-Review.postman_collection.json
docs/
  erd.md                    Current schema diagram
  postman-demo.md            Presentation steps
  curl.md                   Alternative request examples
  semester-review-guide.md  This guide
```

`app.js` and `server.js` are separate so tests can create the app on a temporary port without starting the normal application server. `createApp(pool)` receives the database pool directly; this is a simple function argument, not a dependency injection framework.

## 6. Database design

There are **three application tables**, plus a small migration bookkeeping table. Users and sellers are independent records in this checkpoint.

### 6.1 `users`

| Field | Type | Purpose and rule |
| --- | --- | --- |
| `id` | BIGINT generated identity | Primary key assigned by PostgreSQL |
| `name` | TEXT | Required, nonblank, maximum 100 characters |
| `email` | TEXT | Required, lowercase, unique within users |
| `phone` | TEXT, nullable | Optional phone number; text preserves `+` and formatting |
| `address` | TEXT | Profile address, default empty string; API maximum 500 characters |
| `avatar_url` | TEXT, nullable | Optional HTTP(S) image URL |
| `created_at` | TIMESTAMPTZ | Creation time, automatically set by PostgreSQL |

### 6.2 `sellers`

| Field | Type | Purpose and rule |
| --- | --- | --- |
| `id` | BIGINT generated identity | Primary key assigned by PostgreSQL |
| `business_name` | TEXT | Required, nonblank, maximum 150 characters |
| `email` | TEXT | Required, lowercase, unique within sellers |
| `phone` | TEXT, nullable | Optional business phone |
| `location` | TEXT | Business location, default empty string; API maximum 250 characters |
| `description` | TEXT | Business introduction, default empty string; API maximum 2,000 characters |
| `logo_url` | TEXT, nullable | Optional HTTP(S) logo URL |
| `created_at` | TIMESTAMPTZ | Creation time, automatically set by PostgreSQL |

### 6.3 `products`

| Field | Type | Purpose and rule |
| --- | --- | --- |
| `id` | BIGINT generated identity | Product primary key |
| `seller_id` | BIGINT foreign key | Required reference to an existing seller |
| `name` | TEXT | Required, nonblank, maximum 150 characters |
| `description` | TEXT | Default empty string; API maximum 2,000 characters |
| `price` | NUMERIC(12,2) | Positive amount, supplied/returned as a decimal string |
| `stock` | INTEGER | Non-negative available quantity; default 0 |
| `image_url` | TEXT, nullable | Optional HTTP(S) product image URL |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

A seller has zero or many products. Each product belongs to one existing seller. The foreign key uses `ON DELETE RESTRICT`: a seller cannot be deleted while products reference it. Delete those products first. An index on `seller_id` helps product filtering.

Product prices use strings such as `"125.50"` and PostgreSQL `NUMERIC(12,2)`, which keeps the amount exact. Numeric JSON prices, zero/negative prices, and extra decimal digits are rejected. There is no order total calculation in this checkpoint.

### 6.4 Why profiles are not separate tables

For this checkpoint, each user has exactly the profile fields on its own row. A seller's business profile works the same way. A separate profile table would add another ID/relationship without adding useful behavior yet.

- POST creates the record and its default/supplied profile fields together.
- GET `/users/:id/profile` returns only that user's profile fields.
- PATCH updates selected fields on that same row.
- DELETE removes the record and therefore removes its profile fields too.

There are no independent POST/DELETE profile endpoints because a profile has no separate lifecycle here. A profile endpoint is a convenient view/edit interface to part of the existing record.

### 6.5 Relationships and indexes

There is currently **no foreign key connecting users and sellers**. A user does not automatically own a seller record, and matching emails do not establish a relationship. The same email may appear once in each table.

Primary keys and unique email constraints create indexes automatically. Products additionally have an index on `seller_id` for filtering and foreign-key lookup. There is no full-text search or pagination yet. The seller-product foreign key enforces a database relationship, not permission to edit that seller's products; authentication and ownership checks are still future work.

When authentication is added, the team must decide whether sellers belong to a common account table or link to user accounts. That future relationship should be added with a migration and ownership checks.

### 6.6 Database constraints versus API validation

Both layers have responsibilities:

- PostgreSQL enforces generated primary keys, unique/lowercase/non-null emails, required names, name length/nonblank checks, and creation timestamps. Products additionally have a seller foreign key and checks on their name, positive price, and non-negative stock.
- Zod additionally checks email format, phone format, allowed URL schemes, numeric ID shape/range, maximum profile text lengths, and allowed request fields.

Not every Zod rule is duplicated as a database constraint. Direct SQL bypasses API validation; do not claim the database rejects every malformed profile value on its own.

## 7. How the server starts

1. `npm start` executes `node src/server.js`.
2. dotenv loads `.env` when configuration is imported.
3. `readConfig()` checks `NODE_ENV`, `PORT`, and `DATABASE_URL`.
4. `createPool()` creates a PostgreSQL connection pool, with up to 10 connections and a 5-second connection timeout.
5. `SELECT 1` checks that a database connection works.
6. `createApp(pool)` configures Express and registers the endpoints.
7. Express listens on PORT, normally 3000.

Startup does not automatically migrate the database. Run `npm run migrate` first. The health endpoint confirms the HTTP process responds; it does not run a new database check for every call.

On SIGINT/SIGTERM, `server.js` stops accepting new connections and closes the pool after the server closes. A 10-second timeout prevents shutdown from hanging indefinitely.

## 8. Request flow: create a user

```text
Postman
  → POST /api/users with JSON
  → Express JSON parser
  → /api/users router
  → Zod validation middleware
  → user controller
  → parameterized INSERT through pg
  → PostgreSQL creates row
  → controller returns 201 with JSON
  → Postman displays the result
```

Example request body:

```json
{
  "name": "Pema",
  "email": "PEMA@example.com",
  "phone": "17123456",
  "address": "Thimphu"
}
```

Zod validates the required fields, normalizes email to lowercase, and supplies `null` for an omitted avatar URL. The middleware stores the clean result in `req.validated.body`. The controller uses those validated values.

The actual insertion pattern is:

```js
const result = await pool.query(
  `INSERT INTO users (name, email, phone, address, avatar_url)
   VALUES ($1,$2,$3,$4,$5) RETURNING *`,
  [name, email, phone, address, avatar_url]
);
res.status(201).json(result.rows[0]);
```

`RETURNING *` gives the created row, including its generated ID and timestamp. No second SELECT is needed.

`await` pauses that handler until the database promise resolves; it does not mean all API requests run one at a time. The database pool can serve other requests concurrently.

## 9. CRUD endpoints and HTTP methods

The two resources use matching patterns:

| Action | User endpoint | Seller endpoint | Success |
| --- | --- | --- | --- |
| Create | POST `/api/users` | POST `/api/sellers` | 201 |
| List | GET `/api/users` | GET `/api/sellers` | 200, array |
| Read one | GET `/api/users/:id` | GET `/api/sellers/:id` | 200, object |
| Replace fields | PUT `/api/users/:id` | PUT `/api/sellers/:id` | 200 |
| Delete | DELETE `/api/users/:id` | DELETE `/api/sellers/:id` | 204, no body |
| Read profile | GET `/api/users/:id/profile` | GET `/api/sellers/:id/profile` | 200 |
| Edit profile fields | PATCH `/api/users/:id/profile` | PATCH `/api/sellers/:id/profile` | 200 |

`:id` is a URL parameter. Express extracts it into `req.params`; validation checks it before the controller uses it.

GET endpoints do not require a JSON body. POST, PUT, and PATCH should use Postman's **Body → raw → JSON** setting.

### PUT versus PATCH: a detail the tutor may test

PUT is implemented as replacement of the editable fields. It requires the name/business name and email. Omitted optional values reset to defaults.

For example:

```json
{ "name": "Pema Dorji", "email": "pema@example.com" }
```

This PUT sets `phone` and `avatar_url` to null and `address` to an empty string. It does not change the ID or creation timestamp.

By contrast, this profile PATCH changes only the address:

```json
{ "address": "Paro" }
```

Other fields stay unchanged. Email cannot be changed using the profile PATCH; use the record PUT instead.

### DELETE behavior

Successful deletion is permanent in this checkpoint. There are no orders needing purchase-history preservation; seller deletion is restricted by its product references. After deletion, GET returns 404. A second DELETE also returns 404; HTTP idempotency means the final resource state stays deleted, not that every response code must match.

Seller deletion now returns 409 if that seller has products because the product foreign key restricts deletion. Delete the products first. User and product deletion remain permanent. If orders are added later, product deletion rules will need review to preserve purchase history.

### Product endpoints

| Action | Endpoint | Success |
| --- | --- | --- |
| Create | POST `/api/products` | 201 |
| List | GET `/api/products` | 200 |
| Filter by seller | GET `/api/products?seller_id=1` | 200, array |
| Read one | GET `/api/products/:id` | 200 |
| Replace details | PUT `/api/products/:id` | 200 |
| Delete | DELETE `/api/products/:id` | 204 |

POST requires `seller_id` as a string, `name`, and `price`. Optional `stock`, `description`, and `image_url` default to 0, empty text, and null. Product PUT accepts the same product-detail fields, but not `seller_id`: it keeps the existing seller. Missing optional values reset on PUT, as in the other resources.

The create controller uses `INSERT ... SELECT ... FROM sellers WHERE id = $1`. If no seller matches, no product is inserted and the API returns 404. The foreign key is the final database integrity check. The list endpoint adds `WHERE seller_id = $1` when the optional filter is supplied. A valid seller ID with no products returns an empty array.

No authentication means the body-supplied seller ID does not establish caller identity. There is no stock reservation, automatic decrement, checkout, or payment flow; stock is simply an editable non-negative number here.

## 10. SQL safety and IDs

Values use placeholders such as `$1`. The values array is passed separately to `pg`, so request strings are treated as data rather than executable SQL.

Do not build SQL like this:

```js
// Incorrect example: do not use request values in SQL text.
// "SELECT * FROM users WHERE email = '" + email + "'"
```

Profile PATCH builds its SET clause from a **fixed list of allowed column names**. SQL placeholders cannot stand in for column identifiers, so the controller takes identifiers only from its own allowlist. Actual field values still use placeholders.

IDs are PostgreSQL BIGINT values and are returned as strings by `pg`. This avoids rounding large database IDs to JavaScript Number values. The ID schema rejects nonnumeric, nonpositive, and out-of-range IDs. Its validation pipeline checks the string format before converting it to BigInt for the range check.

## 11. Validation and errors

| Example | Response | Why |
| --- | --- | --- |
| Missing name or email | 400 | Required input is missing |
| `email: "not-an-email"` | 400 | Invalid email format |
| ID `abc`, `0`, or `-1` | 400 | Invalid identifier |
| Unknown valid ID | 404 | The requested record does not exist |
| Seller deletion while products reference it | 409 | Foreign key restricts deletion |
| Product price as a JSON number | 400 | Supply a decimal string such as `"125.50"` |
| Negative or fractional product stock | 400 | Stock must be a non-negative integer |
| Product creation with a missing seller | 404 | No matching seller exists |
| Reused email in the same table | 409 | A unique constraint rejects the conflict |
| Profile PATCH `{}` | 400 | There is nothing to update |
| Profile PATCH with `email` | 400 | That endpoint does not permit email edits |
| `javascript:` image URL | 400 | Only HTTP(S) image URLs are accepted |
| Malformed JSON | 400 | Express cannot parse the body |
| JSON larger than 32 KiB | 413 | Request exceeds the parser's limit |
| Unexpected database/server failure | 500 | Internal failure; raw error is not returned to the client |

`validate.js` uses Zod's `safeParse`. Valid data proceeds to the controller; invalid data gets a JSON error with field details. Strict objects reject unknown fields, including passwords and role fields that this version does not support.

`HttpError` carries an intentional HTTP status and message, such as 404. The centralized error handler translates known errors and logs unexpected ones server-side. Express 5 forwards errors thrown by async handlers to that error middleware.

For duplicate emails, the database's unique constraint is the final check. This also handles two simultaneous inserts using the same email; a separate “does email exist?” query alone would leave a race.

Image URL validation does not upload/download the image or prove that it exists. Phone validation checks a broad format, not ownership or a verified Bhutanese subscriber number.

## 12. Migrations and persistence

`npm run migrate` reads SQL files in sorted filename order. The migration runner records applied filenames in `schema_migrations`, skips ones already applied, and runs pending changes inside a transaction. An advisory lock prevents two copies of this runner applying migrations simultaneously.

A migration transaction either commits the changes and filename records together or rolls them back. It uses one checked-out database connection and releases it afterward.

The ordinary CRUD controller operations each use one SQL statement, so they do not need a manual multi-statement transaction. PostgreSQL executes each such statement atomically.

Use the new `tshongkhang_mid_review` database for this simplified schema. It is not an automatic migration from the earlier order-system schema. Existing earlier data is not deleted or converted. If you already have the simplified user/seller database, run `npm run migrate` again: `002_products.sql` adds products without replacing your user/seller tables. Future schema changes should get new migration files rather than edits to an already applied file.

Data lives in PostgreSQL rather than in a JavaScript array, so restarting Node.js does not remove it. The local test runner uses temporary schemas; those test records are intentionally cleaned up.

## 13. Postman walkthrough

Import [the collection](../postman/Tshongkhang-Mid-Review.postman_collection.json) and follow [the detailed demo steps](postman-demo.md).

1. Send the health request.
2. Create a user; explain 201 and the generated ID.
3. List users and read the created record.
4. PUT the record with a changed name.
5. Read the profile and PATCH its address.
6. Show an invalid email returning 400 and a duplicate email returning 409.
7. Delete the record; explain why 204 has no response body.
8. GET it again to show 404.
9. Repeat the flow for a seller and business profile.
10. In the Products folder, create its demo seller, create/read/update/filter a product, show the seller deletion restriction, then delete the product and seller.

The collection automatically saves IDs into `user_id`, `seller_id`, `product_seller_id`, and `product_id`. It has 37 requests including health, with expected-status checks. The base URL is a collection variable. No token or authorization header is required.

Deleting the example records lets the collection run again with the same emails. If the demo stops halfway, finish the delete step or change the email before creating again.

## 14. Testing and what the evidence means

`tests/integration.test.js` contains nine integration tests. They use a real HTTP listener and PostgreSQL instead of mocked database results.

| Test area | What is checked |
| --- | --- |
| User lifecycle | Create, list, read, replace, profile edit, clear optional phone, delete, and missing-record responses |
| User validation | Bad bodies/IDs/images, duplicate emails, and unsupported profile edits |
| Seller lifecycle | The equivalent business-record and profile workflow |
| Seller validation | The equivalent validation and uniqueness rules |
| Product CRUD | Create, list, read, replace, seller filtering, and delete |
| Product validation | Decimal-string prices, non-negative integer stock, IDs, images, missing seller, and immutable seller link |
| Product foreign key | Seller deletion blocked until products are removed; database checks stock and price |
| Current scope | Health succeeds and old auth/admin/checkout paths are unavailable |
| JSON parsing | Malformed JSON returns a clear 400 response |

Before running, set TEST_DATABASE_URL to a test database. The role must be able to create a schema. Tests create a uniquely named schema, apply migrations twice to check repeatability, reset records between tests, and drop only their schema afterward.

To show the tutor:

```sh
TEST_DATABASE_URL=postgresql://tshongkhang:local_password@localhost:5432/tshongkhang_mid_review_test npm test
```

A passing test run verifies these implemented behaviors. It is not proof of production security, a load test, or evidence that the planned authentication/admin features already exist. Postman assertions are demonstration checks, while the Node integration suite is the repeatable automated backend check.

## 15. Authentication and admin: next sprint

Current record IDs identify rows; they do not prove who the caller is. Anyone who can reach this local API can list, edit, or delete records. A profile response omitting email does not provide privacy because the full CRUD endpoints remain open.

The next sprint should address:

1. Decide the account model linking users and sellers.
2. Add secure credential storage and login; never store plaintext passwords.
3. Add authentication middleware to establish the caller's identity.
4. Add authorization rules so users/sellers can change only permitted records.
5. Add admin roles and explicitly defined admin permissions.
6. Update tests to verify unauthenticated requests and cross-account access are rejected.
7. Revise the Postman collection with login and authenticated requests.

This is a plan, not a description of existing functionality. Admin is more than an `/admin` URL: it requires a trusted identity and enforced permissions.

## 16. Likely tutor questions and answer practice

### Q1. What did your team finish for the mid-review?

“We implemented user, seller, and product CRUD, profile viewing/editing, PostgreSQL persistence, validation, clear error handling, migrations, and a Postman demonstration. Authentication and admin are next sprint.”

### Q2. Why can you show the project without a frontend?

“The backend exposes HTTP endpoints. Postman sends the same methods, URLs, and JSON bodies that a future frontend would send.”

### Q3. What happens when Postman sends a request?

“Express parses JSON, the router selects a handler, Zod validates the input, the controller executes parameterized SQL using pg, and the controller returns JSON with an HTTP status.”

### Q4. Why are users and sellers separate tables?

“We keep basic personal records and business records separate for this checkpoint. They are independent now; account ownership will be designed with authentication next sprint.”

### Q5. Where is the profile table?

“There is no separate profile table. Profile fields are stored on their user or seller row, which keeps this small version simple. Profile endpoints read or patch those fields.”

### Q6. Does creating a user log the person in?

“No. POST /api/users only creates a record. There are no passwords, login, tokens, or sessions in this sprint.”

### Q7. What is the difference between authentication and authorization?

“Authentication establishes who the caller is. Authorization checks what that caller is allowed to do. Both are future work here.”

### Q8. Can a user currently change another user's profile?

“Yes, because these demonstration APIs are open. We are not claiming account isolation yet. Next sprint we will require identity and ownership checks.”

### Q9. Why use PostgreSQL instead of an array?

“PostgreSQL persists data across server restarts and provides generated IDs and constraints. An in-memory array would lose records when the process stops.”

### Q10. What is a primary key?

“A column uniquely identifying a row. PostgreSQL generates our IDs, and we use them for individual CRUD requests.”

### Q11. What prevents duplicate emails?

“Each table has a UNIQUE email constraint. We normalize emails to lowercase before inserting, and a duplicate returns 409.”

### Q12. Can the same email occur in both tables?

“Yes. Uniqueness is per table, and we have no shared account model yet. That decision will be revisited with authentication.”

### Q13. Why use phone numbers as text?

“They are identifiers rather than quantities. Text preserves plus signs and formatting, and we do not calculate with them.”

### Q14. How do you prevent SQL injection?

“We pass values separately using pg placeholders. For dynamic profile updates, column names come from fixed allowlists rather than request-supplied SQL.”

### Q15. Why use Zod if the database has constraints?

“Zod gives clear field-level errors before a query runs. Database constraints still protect stored data, including uniqueness when requests happen at the same time.”

### Q16. Why does PATCH not erase the rest of the profile?

“The controller includes only supplied, allowed fields in its UPDATE statement. Omitted fields are not assigned.”

### Q17. How is PUT different?

“Our PUT replaces the editable record. Required fields must be supplied, and omitted optional fields reset to defaults.”

### Q18. Why does DELETE return no JSON?

“204 means the operation succeeded with no response body. We verify deletion by reading the record again and receiving 404.”

### Q19. Why is an invalid ID 400 but a missing record 404?

“400 means the identifier is malformed. 404 means it is a valid identifier shape but the requested row was not found.”

### Q20. Why are IDs strings in the JSON response?

“pg returns PostgreSQL BIGINT values as strings so JavaScript does not round large IDs. We keep that behavior.”

### Q21. Why split app.js and server.js?

“app.js builds the app. server.js starts the normal listener. Tests can reuse the app with a test database and temporary port.”

### Q22. What is the connection pool for?

“It reuses database connections instead of opening one for every request. Our application pool allows up to ten connections.”

### Q23. Where are credentials stored?

“In the local .env file through DATABASE_URL. .env is ignored by Git; .env.example documents the variables with sample values.”

### Q24. What does the migration do?

“The first migration creates users and sellers. The second adds products. The runner records applied migration filenames so rerunning it does not recreate the same tables.”

### Q25. What did you test?

“User, seller, and product CRUD, profile editing, validation, duplicate emails, product price/stock rules, seller filtering, the product foreign key, deletion/missing records, malformed JSON, and the current route scope, using PostgreSQL and HTTP.”

### Q26. Does storing an image URL upload an image?

“No. We validate and store the URL only. File uploads and image-content verification are not implemented.”

### Q27. What relationship does the foreign key represent?

“Products reference sellers through seller_id. One seller can have many products, and a seller cannot be deleted while products still reference it. Users and sellers remain separate until the account model is designed.”

### Q28. Is this ready for real customer data?

“No. It is a local CRUD checkpoint. Authentication, permissions, and admin must be implemented before treating these records as protected accounts.”

### Q29. What is the main technical limitation?

“The current API has no caller identity or access control. It also has unpaginated lists, permanent deletion, and no account relationship between users and sellers.”

### Q30. What will you do next?

“Agree on the account model, implement secure authentication and ownership rules, add admin permissions, and extend tests and Postman requests for those features.”

### Q31. Why is product price a string in JSON?

“We store money as PostgreSQL NUMERIC(12,2) and leave it as a decimal string in JavaScript, so we do not introduce floating-point rounding. The API requires exactly two fractional digits.”

### Q32. Why does deleting a seller sometimes return 409?

“Products still reference that seller. The foreign key uses ON DELETE RESTRICT, so we must delete the products before deleting the seller.”

### Q33. Does a seller ID in product creation prove ownership?

“No. It selects the seller record that the product belongs to. Authentication and authorization are still next-sprint work.”

## 17. Suggested preparation order

1. Read this guide's introduction, progress table, and schema sections.
2. Open `src/routes/user.js` and match each route to its Postman request.
3. Follow one create request into `src/controllers/user.js` and the SQL migration.
4. Explain a profile PATCH and the difference from PUT.
5. Run the Postman collection and automated tests.
6. Practice the tutor questions using the code, rather than memorizing claims.
7. Finish by explaining the next sprint honestly: authentication and admin are not done yet.

Keep the presentation focused on the current simple implementation. The best evidence is a request you can send, a database change you can explain, and a test that checks its behavior.
