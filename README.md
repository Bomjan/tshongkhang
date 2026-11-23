# Tshongkhang

A semester-sized marketplace for small Bhutanese shops, implemented through **Sprint 2**. The frontend, Express API and PostgreSQL database run together on one server.

| Sprint | Working demonstration |
| --- | --- |
| 1 | Seller registers or logs in, opens a dashboard, and adds, views, edits or deletes their products. |
| 2 | Customer opens a seller’s storefront, views product images/details, manages a cart and places a guest order. |
| 3 — future work | Seller order management, Bhutan QR/payment proof, final deployment. |

## Run locally

Requires Node.js 22+ and a running PostgreSQL 16+ database. See [database setup](docs/setup.md).

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL in .env to your local database.
npm run migrate
# Optional: add a sample shop and six illustrated products.
npm run seed:demo
npm start
```

Open **http://localhost:3000**. Shops have public addresses such as **http://localhost:3000/druk-local-pantry/**, with `/druk-local-pantry/cart/` and `/druk-local-pantry/checkout/` for ordering. Register your own shop, or use the optional demo account: `demo@tshongkhang.local` / `Tshongkhang123!`.

Existing mid-review databases upgrade with `npm run migrate`; existing users, sellers and products are preserved. Legacy seller records have no password and cannot log in: register a new shop with a different email. Registration never takes over an existing account. The old unauthenticated `/api/users` and seller-creation endpoints are retired; guest contact details are saved with each order.

## Verification and review

```sh
TEST_DATABASE_URL=postgresql://.../tshongkhang_test npm test
npx playwright install chromium
TEST_DATABASE_URL=postgresql://.../tshongkhang_test npm run test:browser
```

Tests use and remove an isolated schema. On Debian/Ubuntu, use a disposable database instead:

```sh
pg_virtualenv -t -v 16 npm test
pg_virtualenv -t -v 16 npm run test:browser
```

- [Sprint 1–2 demo and technical guide](docs/semester-review-guide.md)
- [Setup and tests](docs/setup.md)
- [Postman collection](postman/Tshongkhang-Mid-Review.postman_collection.json) · [Postman guide](docs/postman-demo.md) · [curl examples](docs/curl.md)
- [Database ERD](docs/erd.md)

Passwords use salted scrypt hashes; seller sessions use expiring HttpOnly cookies. Product changes require ownership. Checkout validates stock and calculates decimal totals from database prices in a transaction, stores product snapshots and handles repeated submissions using a checkout key. No payment is collected, and there is no customer account requirement.

Shop addresses are unique and stable. Registration accepts an optional `slug`; otherwise the app generates one from the shop name, adding a suffix for duplicate names. Migration `004_shop_slugs.sql` assigns existing shops addresses without changing their IDs, products, orders or carts. Old numeric storefront/cart/checkout URLs redirect to the named routes. Custom subdomains are not configured; they require hosting, DNS and TLS configuration plus host-based shop routing.

The interface includes a seller workspace, image uploads with previews, search and stock filters, responsive product browsing, and a Details → Review → Place order checkout. Uploaded images are saved locally in the Git-ignored `uploads/products/` folder. See the setup guide for storage and deployment notes.
