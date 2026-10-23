# Simple CRUD curl examples

The primary review tool is [Postman](postman-demo.md). These commands show the same basic user workflow without authentication. Replace `1` with the ID returned by POST if necessary.

```sh
BASE=http://localhost:3000/api
curl -sS "$BASE/health"

# Create
curl -sS -X POST "$BASE/users" -H 'Content-Type: application/json' \
  -d '{"name":"Pema","email":"pema@example.com","phone":"17123456","address":"Thimphu"}'

# List and read
curl -sS "$BASE/users"
curl -sS "$BASE/users/1"

# Replace editable record fields
curl -sS -X PUT "$BASE/users/1" -H 'Content-Type: application/json' \
  -d '{"name":"Pema Dorji","email":"pema@example.com","phone":"17123456","address":"Thimphu"}'

# Read and edit profile
curl -sS "$BASE/users/1/profile"
curl -sS -X PATCH "$BASE/users/1/profile" -H 'Content-Type: application/json' \
  -d '{"address":"Paro"}'

# Delete (204: no response body)
curl -i -X DELETE "$BASE/users/1"

# Seller: same operations, different fields
curl -sS -X POST "$BASE/sellers" -H 'Content-Type: application/json' \
  -d '{"business_name":"Pema Store","email":"shop@example.com","location":"Thimphu"}'
curl -sS "$BASE/sellers"
curl -sS "$BASE/sellers/1"
curl -sS -X PUT "$BASE/sellers/1" -H 'Content-Type: application/json' \
  -d '{"business_name":"Pema Grocery","email":"shop@example.com","location":"Thimphu"}'
curl -sS "$BASE/sellers/1/profile"
curl -sS -X PATCH "$BASE/sellers/1/profile" -H 'Content-Type: application/json' \
  -d '{"location":"Paro","description":"A local grocery shop"}'
curl -i -X DELETE "$BASE/sellers/1"
```
