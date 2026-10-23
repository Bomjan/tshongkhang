CREATE TABLE sellers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_name TEXT NOT NULL CHECK (length(trim(business_name)) BETWEEN 1 AND 150),
    email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT NOT NULL,
    phone TEXT NOT NULL,
    location TEXT NOT NULL,
    storefront_slug TEXT NOT NULL UNIQUE CHECK (
        length(storefront_slug) BETWEEN 3 AND 80 AND
        storefront_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
    qr_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seller_id BIGINT NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 150),
    description TEXT NOT NULL DEFAULT '',
    price NUMERIC(12,2) NOT NULL CHECK (price > 0),
    stock INTEGER NOT NULL CHECK (stock >= 0),
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_seller_id_id_idx ON products(seller_id, id);
CREATE INDEX products_active_store_idx ON products(seller_id, id) WHERE is_active;

CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seller_id BIGINT NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
    reference TEXT NOT NULL UNIQUE CHECK (reference ~ '^[a-f0-9]{48}$'),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
    status TEXT NOT NULL DEFAULT 'Placed' CHECK (
        status IN ('Placed', 'Payment Confirmed', 'Packed', 'Delivered', 'Cancelled')
    ),
    payment_proof_url TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cancellation_reason_matches_status CHECK (
        (status = 'Cancelled' AND cancellation_reason IS NOT NULL AND
         length(trim(cancellation_reason)) BETWEEN 1 AND 500)
        OR (status <> 'Cancelled' AND cancellation_reason IS NULL)
    )
);
CREATE INDEX orders_seller_created_idx ON orders(seller_id, created_at DESC, id DESC);
CREATE INDEX orders_seller_status_created_idx ON orders(seller_id, status, created_at DESC, id DESC);

CREATE TABLE order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (order_id, product_id)
);
CREATE INDEX order_items_product_idx ON order_items(product_id);
