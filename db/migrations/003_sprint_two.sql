-- Existing CRUD-only sellers keep their profiles but cannot log in until credentials
-- are provisioned by the database owner. Registration never claims an existing email.
ALTER TABLE sellers ADD COLUMN password_hash TEXT;

CREATE TABLE seller_sessions (
    token_hash TEXT PRIMARY KEY,
    seller_id BIGINT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX seller_sessions_seller_idx ON seller_sessions(seller_id);
CREATE INDEX seller_sessions_expiry_idx ON seller_sessions(expires_at);

CREATE TABLE orders (
    id UUID PRIMARY KEY,
    checkout_key UUID NOT NULL UNIQUE,
    seller_id BIGINT NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    total NUMERIC(16,2) NOT NULL CHECK (total > 0),
    status TEXT NOT NULL DEFAULT 'placed' CHECK (status = 'placed'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_seller_idx ON orders(seller_id);

CREATE TABLE order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- Snapshot identifier: deleting a catalog product must not erase an order.
    product_id BIGINT NOT NULL,
    product_name TEXT NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price > 0),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99)
);
CREATE INDEX order_items_order_idx ON order_items(order_id);
