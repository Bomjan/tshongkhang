# Postman mid-review demonstration

## Preparation

1. Follow the setup in [README](../README.md), apply migrations, and run `npm start`.
2. Open Postman and select **Import**.
3. Import `postman/Tshongkhang-Mid-Review.postman_collection.json` from this repository.
4. Open the collection variables. `base_url` should be `http://localhost:3000/api`. Leave `user_id` and `seller_id` blank initially.
5. Use **No Auth**. Authentication and admin are next-sprint work.

The collection has a health check and two folders: Users and Sellers. Create requests save their returned IDs to collection variables, so later requests use the correct record. Each request includes a small Postman status assertion.

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

## A simple five-minute presentation

- **First minute:** explain the current sprint: user/seller CRUD and profiles. Login and admin are future work.
- **Second minute:** show the two-table ERD and the route/controller/database flow.
- **Third minute:** demonstrate user creation, reading, PUT, and profile PATCH.
- **Fourth minute:** demonstrate seller CRUD and duplicate/invalid email errors.
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
| 409 on create | Email already exists; change it or delete the earlier demo record |
| 404 on a record | Run create first and inspect the saved collection ID |
| Empty DELETE response | Expected: 204 means successful deletion without JSON |
| Optional fields disappear after PUT | Expected replacement behavior; send the full editable record or use profile PATCH |

To repeat the full collection cleanly, run through its deletion steps before starting again. There is no collection-level reset endpoint and no login step.
