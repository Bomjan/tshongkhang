# Postman mid-review demonstration

## Preparation

1. Follow the setup in [README](../README.md), apply migrations, and run `npm start`.
2. Open Postman and select **Import**.
3. Import `postman/Tshongkhang-Mid-Review.postman_collection.json` from this repository.
4. Open the collection variables. `base_url` should be `http://localhost:3000/api`. Leave `user_id` and `seller_id` blank initially.
5. Use **No Auth**. Authentication and admin are next-sprint work.

The collection has a health check and three folders: Users, Sellers, and Products. Create requests save their returned IDs to collection variables, so later requests use the correct record. Each request includes a small Postman status assertion.

## Present the user workflow

| Step | Request | What to explain | Expected result |
| --- | --- | --- | --- |
| 1 | POST `/users` | Create a user with JSON | 201 and a generated ID |
| 2 | GET `/users` | Read all users | 200 and an array |
| 3 | GET `/users/{{user_id}}` | Read one user using a URL parameter | 200 and one object |
| 4 | PUT `/users/{{user_id}}` | Replace editable fields | 200 and updated object |
| 5 | GET `/users/{{user_id}}/profile` | Read profile fields from the same row | 200, without email/created_at |
| 6 | PATCH `/users/{{user_id}}/profile` | Change address without replacing other fields | 200 and updated profile |
| 7 | GET profile again | Show that the change persisted | Address is Paro |
| 8 | POST duplicate email | Demonstrate database uniqueness | 409 |
| 9 | POST invalid email | Demonstrate Zod input validation | 400 |
| 10 | PATCH empty profile | Show invalid updates are rejected | 400 |
| 11 | DELETE `/users/{{user_id}}` | Delete the record and its profile | 204, empty body |
| 12 | GET deleted record | Show missing-record handling | 404 |

Repeat the same flow in the Sellers folder. Seller JSON uses `business_name`, `location`, `description`, and `logo_url` instead of the user-specific profile fields.

## Product workflow

The Products folder creates its own seller and saves `product_seller_id`, then:

1. Creates a product and saves `product_id` (201).
2. Lists all products and filters with `?seller_id={{product_seller_id}}` (200).
3. Reads and updates the product with PUT (200). Price is a string such as `"125.50"`.
4. Shows a numeric price rejected with 400 and a missing seller rejected with 404.
5. Attempts to delete a seller that still has products and shows 409.
6. Deletes the product (204), checks it is gone (404), then deletes the seller (204).

The collection now has 37 requests. Product seller IDs come from the body at this checkpoint; they are a database relationship, not proof of the caller's identity. Product PUT changes product details without changing its seller.

## A simple five-minute presentation

- **First minute:** explain the current sprint: user/seller/product CRUD and profiles. Login and admin are future work.
- **Second minute:** show the three-table ERD and the route/controller/database flow.
- **Third minute:** demonstrate user creation, reading, PUT, and profile PATCH.
- **Fourth minute:** demonstrate seller/product CRUD, the foreign key, and validation errors.
- **Fifth minute:** show deletion, missing-record handling, test results, and next sprint's plan.

Use invented demonstration data. The endpoints currently allow anyone with API access to read/change records; profile response fields being narrower does not provide access control.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Connection refused | Server is running and `base_url` uses its PORT |
| Database connection error | PostgreSQL, DATABASE_URL, role/password and database name |
| Relation does not exist | Run `npm run migrate` against the fresh mid-review database |
| Relation already exists during migration | You may be using the earlier database; use a new empty mid-review database |
| 400 on POST/PUT | Required fields, valid email and Body → raw → JSON |
| 400 on profile PATCH | Nonempty JSON and allowed profile fields only |
| 409 on seller deletion | Delete the seller's products first |
| 400 on product price | Send a string with exactly two decimal digits, e.g. `"125.50"` |
| 409 on create | Email already exists; change it or delete the earlier demo record |
| 404 on a record | Run create first and inspect the saved collection ID |
| Empty DELETE response | Expected: 204 means successful deletion without JSON |
| Optional fields disappear after PUT | Expected replacement behavior; send the full editable record or use profile PATCH |

To repeat the full collection cleanly, run through its deletion steps before starting again. There is no collection-level reset endpoint and no login step.
