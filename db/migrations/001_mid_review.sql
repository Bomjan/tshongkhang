CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    phone TEXT,
    address TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sellers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_name TEXT NOT NULL CHECK (length(trim(business_name)) BETWEEN 1 AND 150),
    email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    phone TEXT,
    location TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
