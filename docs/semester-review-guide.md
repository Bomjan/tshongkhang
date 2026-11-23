# Tshongkhang Sprint 1–2 review guide

## What to present

“Tshongkhang helps Bhutanese sellers open a small online storefront. Our Sprint 1 demonstration covers seller registration, login, a dashboard and product management. Sprint 2 lets a customer browse a shop, use a cart and place an order with their contact and delivery details.”

| Deliverable | Where to demonstrate |
| --- | --- |
| Frontend, backend and database setup | Start the server and open `/`; explain Express and PostgreSQL. |
| Seller registration and login | `/register`, `/login`, session persistence and logout. |
| Basic seller dashboard | `/seller`, product count, available products, stock and storefront link. |
| Product management | Add, view, edit and delete a product; edit shop details. |
| Public storefront | `/:shopAddress/` (for example `/druk-local-pantry/`), accessible after logging out. |
| Product details | `/products/:productId`, image, price, description and availability. |
| Shopping cart | Add products, change quantity, remove products and refresh to show persistence. |
| Basic checkout | Enter a name, phone and address; place an order and show its reference and total. |

## A short live demonstration

1. Run migrations and start the app. Optionally run `npm run seed:demo` for a sample collection.
2. Register a new shop using an unused email. Add a product with a price, stock, description and an image selected from your computer (or an optional image link).
3. Edit its price. Add and delete a second temporary product to show the complete management flow.
4. Open “View my storefront”, copy its URL, then log out.
5. Browse the public store, open the product detail page and add two items to the cart.
6. Change quantity, refresh, and proceed to checkout. Fill customer details, choose Review order, check or edit the details, and then choose Place order.
7. Show the receipt and reference. Explain that the order and product snapshots are saved in PostgreSQL.
8. Run `npm test` and `npm run test:browser` with a test database to show automated verification.

If the tutor wants database evidence, use a local PostgreSQL session:

```sql
SELECT id, seller_id, customer_name, total, status, created_at FROM orders ORDER BY created_at DESC;
SELECT order_id, product_name, unit_price, quantity FROM order_items ORDER BY id DESC;
```

## How it works

The frontend is plain HTML, CSS and JavaScript served by Express. It calls JSON endpoints on the same origin. PostgreSQL owns persistent seller, product, session and order data. The cart is stored per shop in the browser; checkout does not trust browser prices or stock.

Seller passwords use scrypt with random salts. Random session tokens are stored in HttpOnly, SameSite cookies; only token hashes are stored in the database. Sessions expire after seven days and logout revokes the current session. Public store responses omit email and credentials. Mutations require the logged-in seller to own the target store/product. Cross-origin writes are rejected.

Checkout validates each product belongs to the chosen store. A transaction locks products in ID order, checks stock, calculates the total using integer minor units, saves the order and its line items, and reduces stock. If any item fails, the transaction rolls back. The checkout key makes repeated identical submissions return the existing order. A saved item retains its original name, price and product identifier even if the live product is edited or deleted.

Customer registration is not required. Customers provide details only at checkout; there is no public order-lookup endpoint exposing those details. A receipt URL can be refreshed in the same browser tab using a local copy that omits customer contact details. If a checkout response is lost, the same checkout key safely recovers the existing order. The browser sends the displayed total so a new price requires a cart review before placing an order. Profile fields are stored directly on the seller row. The retained `users` table is legacy data and is not part of this guest checkout flow.

## Scope boundary

Sprint 3 remains: seller order lists/status updates, Bhutan QR and proof upload, final testing and deployment. This implementation does not collect payments, automatically verify payments, provide advanced inventory tools, or add an analytics module. Product stock checks and dashboard counts support the basic flow already in scope.

The demo uses a single Express process, so request limits are in memory. Account recovery, email verification and production operations are beyond this semester checkpoint.
