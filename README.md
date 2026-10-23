# Tshongkhang

Simple Node.js, Express, and PostgreSQL backend for user, seller, product, and profile CRUD. Authentication and admin are planned for the next sprint.

## Run

Requires Node.js 22+ and PostgreSQL 16+. Follow [database setup](docs/setup.md), then:

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL in .env
npm run migrate
npm start
```

API: `http://localhost:3000/api`

- [Postman collection](postman/Tshongkhang-Mid-Review.postman_collection.json) · [Demo guide](docs/postman-demo.md)
- [Technical explanation and tutor questions](docs/semester-review-guide.md)
- [Database ERD](docs/erd.md) · [Tests](docs/setup.md#tests)
