# Sprint 1–2 Postman demonstration

1. Follow [setup](setup.md), run migrations and start the app.
2. Import [the collection](../postman/Tshongkhang-Mid-Review.postman_collection.json).
3. Keep `base_url` as `http://localhost:3000/api`. Set `seller_email` to an unused email before registration; `seller_password` must have at least eight characters.
4. Run Health, Register, My session, Create product, Public products and Public product details. The collection saves `seller_id` and `product_id` automatically.
5. Edit and delete the product only after completing the order demonstration. The server derives product ownership from the session; a seller ID is not a credential.
6. Run Place guest order. Its checkout key is generated once if blank. Repeating the request returns the same order rather than creating another. Clear `checkout_key` to demonstrate a separate new order.
7. Run Logout and Login. Postman’s cookie jar must remain enabled: it sends the HttpOnly session cookie automatically. No bearer token is needed.

Public seller/product reads and guest order placement work without cookies. Product writes and seller profile changes require the owning seller’s cookie. A normal new order returns `201`; an identical checkout retry returns `200`.

The browser at `http://localhost:3000` is the primary demonstration because it also covers the dashboard, storefront, cart and checkout forms. The API collection supplements that workflow.
