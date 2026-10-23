# Database ERD

This matches `db/migrations/001_initial.sql`. All foreign keys use `ON DELETE RESTRICT`.

```mermaid
erDiagram
    sellers ||--o{ products : owns
    sellers ||--o{ orders : receives
    orders ||--|{ order_items : contains
    products ||--o{ order_items : appears_in

    sellers {
        bigint id PK
        text business_name
        text email UK
        text password_hash
        text phone
        text location
        text storefront_slug UK
        text qr_image_url "nullable"
        timestamptz created_at
    }
    products {
        bigint id PK
        bigint seller_id FK
        text name
        text description
        numeric_12_2 price
        integer stock "non-negative"
        text image_url "nullable"
        boolean is_active
        timestamptz created_at
    }
    orders {
        bigint id PK
        bigint seller_id FK
        text reference UK "192 random bits, 48 hex characters"
        text customer_name
        text customer_phone
        text delivery_address
        numeric_12_2 total_amount
        text status
        text payment_proof_url "nullable"
        text cancellation_reason "required only for Cancelled"
        timestamptz created_at
        timestamptz updated_at
    }
    order_items {
        bigint id PK
        bigint order_id FK
        bigint product_id FK
        text product_name "purchase-time snapshot"
        numeric_12_2 unit_price "purchase-time snapshot"
        integer quantity "positive"
    }
    schema_migrations {
        text name PK
        timestamptz applied_at
    }
```

`numeric_12_2` denotes PostgreSQL `NUMERIC(12,2)`. Money must be positive. `order_items` also has a composite unique constraint on `(order_id, product_id)`; duplicate checkout lines are merged before insertion. The migration runner creates the separate administrative `schema_migrations` table.

Order creation requires at least one item at the API level; the foreign key alone does not require a child row. Product-to-storefront consistency and status transition history are enforced by the service transaction. The database additionally constrains allowed status values, cancellation reason consistency, monetary values, quantities, stock, normalized emails, and reference/slug formats.

Indexes support seller product listings, active storefront products, seller order listings with/without status filters, and product references from order items. Primary keys and unique constraints create their own indexes; the `(order_id, product_id)` unique index also supports fetching items by order.
