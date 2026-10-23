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

## Product CRUD

Create a seller first and replace the seller/product IDs below with the returned IDs. Delete products before deleting their seller.

```sh
BASE=http://localhost:3000/api
curl -sS -X POST "$BASE/sellers" -H 'Content-Type: application/json' \
  -d '{"business_name":"Rice Shop","email":"rice-shop@example.com"}'
curl -sS -X POST "$BASE/products" -H 'Content-Type: application/json' \
  -d '{"seller_id":"1","name":"Red rice 1kg","price":"125.50","stock":10}'
curl -sS "$BASE/products"
curl -sS "$BASE/products?seller_id=1"
curl -sS "$BASE/products/1"
curl -sS -X PUT "$BASE/products/1" -H 'Content-Type: application/json' \
  -d '{"name":"Red rice 1kg - updated","price":"130.00","stock":8}'
curl -i -X DELETE "$BASE/products/1"
curl -i -X DELETE "$BASE/sellers/1"
```
