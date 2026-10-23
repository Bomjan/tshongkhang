# Mid-review database ERD

The current application has three application tables. Sellers own products; users remain separate. User/seller profiles are fields on their respective tables, so there is no separate profile table or relationship to maintain.

```mermaid
erDiagram
    sellers ||--o{ products : lists

    users {
        bigint id PK
        text name
        text email UK
        text phone "nullable"
        text address "default empty string"
        text avatar_url "nullable"
        timestamptz created_at
    }
    sellers {
        bigint id PK
        text business_name
        text email UK
        text phone "nullable"
        text location "default empty string"
        text description "default empty string"
        text logo_url "nullable"
        timestamptz created_at
    }
    products {
        bigint id PK
        bigint seller_id FK
        text name
        text description "default empty string"
        numeric_12_2 price "positive"
        integer stock "non-negative, default 0"
        text image_url "nullable"
        timestamptz created_at
    }
    schema_migrations {
        text name PK
        timestamptz applied_at
    }
```

The [SQL migration](../db/migrations/001_mid_review.sql) creates `users` and `sellers`. The migration runner creates the administrative `schema_migrations` table to remember applied files. The [product migration](../db/migrations/002_products.sql) adds `products` with a `seller_id` foreign key to `sellers.id` using `ON DELETE RESTRICT`. A seller can have zero or many products, and each product has one seller. Products must be deleted before their seller. Users have no relationship to sellers yet. `numeric_12_2` denotes PostgreSQL `NUMERIC(12,2)`.

An index on `products.seller_id` supports seller filtering. Product checks require a nonblank name, positive price, and non-negative stock. Primary keys are generated identities. Unique email constraints automatically create indexes; primary keys are indexed as well. Emails must be lowercase, names must be nonblank, and names/emails/creation times cannot be null. Optional phones and image URLs may be null. Zod provides additional API validation for emails, phone formatting, URL schemes, and text length limits.

Future authentication work must decide whether to link sellers to user accounts or introduce a shared account table. That relationship is not implemented here.
