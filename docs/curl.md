# Sprint 1–2 curl examples

Use a fresh seller email. curl saves the seller session in a local cookie file; keep that file private.

```sh
BASE=http://localhost:3000/api
COOKIE_JAR=/tmp/tshongkhang-demo-cookies.txt
curl -sS "$BASE/health"
curl -sS -c "$COOKIE_JAR" "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d '{"business_name":"Pema Store","email":"pema-new@example.com","password":"semester-demo-password","location":"Thimphu"}'
curl -sS -b "$COOKIE_JAR" "$BASE/auth/me"

# Use the returned seller ID in the public storefront filter.
curl -sS -b "$COOKIE_JAR" "$BASE/products" -H 'Content-Type: application/json' \
  -d '{"name":"Red rice 1kg","price":"125.50","stock":10,"description":"Bhutanese rice"}'
curl -sS "$BASE/sellers"
curl -sS "$BASE/products?seller_id=1"
curl -sS "$BASE/products/1"
curl -sS -b "$COOKIE_JAR" -X PUT "$BASE/products/1" -H 'Content-Type: application/json' \
  -d '{"name":"Red rice 1kg","price":"130.00","stock":10}'

# Guest checkout: replace seller/product IDs. Reuse the key only for a retry of this exact order.
curl -sS "$BASE/stores/1/orders" -H 'Content-Type: application/json' \
  -d '{"checkout_key":"9d645d6f-7b3f-4b45-9c9f-69df05414649","customer_name":"Sonam","customer_phone":"17123456","customer_address":"Changzamtog, Thimphu","items":[{"product_id":"1","quantity":2}]}'

curl -i -b "$COOKIE_JAR" -X DELETE "$BASE/products/1"
curl -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE/auth/logout" -H 'Content-Type: application/json' -d '{}'
curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"pema-new@example.com","password":"semester-demo-password"}'
```

Orders retain item names and prices when catalog products are changed or deleted. Seller order viewing/status management is Sprint 3.
