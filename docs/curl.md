# Complete curl workflow

Run the server and migrations first. These examples use Bash, curl, and `jq`. Use a new slug/email if running them again. All money is in Bhutanese ngultrum, with two decimal digits.

```sh
BASE=http://localhost:3000/api
SLUG=thimphu-rice-shop
EMAIL=rice-shop@example.com

# 1. Register a seller. The response also contains a JWT.
curl -fsS "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"business_name\":\"Thimphu Rice Shop\",\"email\":\"$EMAIL\",\"password\":\"student-demo-password-123\",\"phone\":\"+97517123456\",\"location\":\"Thimphu\",\"storefront_slug\":\"$SLUG\"}" | jq

# 2. Login. Keep the returned token private.
TOKEN=$(curl -fsS "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"student-demo-password-123\"}" | jq -r '.token')

# 3. View and update the business profile.
curl -fsS "$BASE/seller/profile" -H "Authorization: Bearer $TOKEN" | jq
curl -fsS -X PATCH "$BASE/seller/profile" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"location":"Changzamtog, Thimphu","qr_image_url":"https://example.com/merchant-qr.png"}' | jq

# 4. Create a product and save its string ID.
PRODUCT=$(curl -fsS "$BASE/seller/products" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Red rice 1kg","description":"Bhutanese red rice","price":"125.50","stock":10,"image_url":"https://example.com/rice.jpg"}')
PRODUCT_ID=$(printf '%s' "$PRODUCT" | jq -r '.id')
curl -fsS "$BASE/seller/products" -H "Authorization: Bearer $TOKEN" | jq

# 5. Visit the public storefront without authentication.
curl -fsS "$BASE/stores/$SLUG" | jq
curl -fsS "$BASE/stores/$SLUG/products" | jq

# 6. Guest checkout: the server uses the database price, not a client total.
# Two identical lines merge into one item of quantity 2; total is "251.00".
ORDER=$(curl -fsS "$BASE/stores/$SLUG/orders" \
  -H 'Content-Type: application/json' \
  -d "{\"customer_name\":\"Pema\",\"customer_phone\":\"17123456\",\"delivery_address\":\"Changzamtog, Thimphu\",\"items\":[{\"product_id\":\"$PRODUCT_ID\",\"quantity\":1},{\"product_id\":\"$PRODUCT_ID\",\"quantity\":1}]}")
printf '%s\n' "$ORDER" | jq
REFERENCE=$(printf '%s' "$ORDER" | jq -r '.reference')

# 7. Track the order and submit payment proof. Status stays Placed.
curl -fsS "$BASE/orders/$REFERENCE" | jq
curl -fsS -X PATCH "$BASE/orders/$REFERENCE/payment-proof" \
  -H 'Content-Type: application/json' \
  -d '{"payment_proof_url":"https://example.com/payment-proof.png"}' | jq

# 8. Seller lists orders and finds the internal ID (not exposed in guest tracking).
SELLER_ORDERS=$(curl -fsS "$BASE/seller/orders?status=Placed" -H "Authorization: Bearer $TOKEN")
printf '%s\n' "$SELLER_ORDERS" | jq
ORDER_ID=$(printf '%s' "$SELLER_ORDERS" | jq -r --arg ref "$REFERENCE" '.[] | select(.reference == $ref) | .id')
curl -fsS "$BASE/seller/orders/$ORDER_ID" -H "Authorization: Bearer $TOKEN" | jq

# 9. After independently verifying receipt of payment, seller confirms it.
curl -fsS -X PATCH "$BASE/seller/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"Payment Confirmed"}' | jq

# Filtering supports all five status values; encode spaces.
curl -fsS --get "$BASE/seller/orders" --data-urlencode 'status=Payment Confirmed' \
  -H "Authorization: Bearer $TOKEN" | jq

# 10. Pack, then deliver. Steps cannot be skipped or reversed.
curl -fsS -X PATCH "$BASE/seller/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"Packed"}' | jq
curl -fsS -X PATCH "$BASE/seller/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"Delivered"}' | jq
curl -fsS "$BASE/orders/$REFERENCE" | jq

# 11. Create a second order to demonstrate cancellation before delivery.
CANCEL_REF=$(curl -fsS "$BASE/stores/$SLUG/orders" \
  -H 'Content-Type: application/json' \
  -d "{\"customer_name\":\"Sonam\",\"customer_phone\":\"17123457\",\"delivery_address\":\"Thimphu\",\"items\":[{\"product_id\":\"$PRODUCT_ID\",\"quantity\":1}]}" | jq -r '.reference')
CANCEL_ID=$(curl -fsS "$BASE/seller/orders" -H "Authorization: Bearer $TOKEN" \
  | jq -r --arg ref "$CANCEL_REF" '.[] | select(.reference == $ref) | .id')
curl -fsS -X PATCH "$BASE/seller/orders/$CANCEL_ID/status" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"Cancelled","cancellation_reason":"Customer requested cancellation"}' | jq
# The one reserved unit is restored. Repeating cancellation returns 409.
# Cancellation is also allowed after Payment Confirmed or Packed;
# any refund then needs to be handled manually outside this application.

# 12. Edit and deactivate the product; existing order snapshots remain intact.
curl -fsS -X PATCH "$BASE/seller/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Red rice 1kg - new label","price":"130.00","is_active":false}' | jq
curl -fsS "$BASE/stores/$SLUG/products" | jq
curl -fsS "$BASE/orders/$REFERENCE" | jq
```

The final public product list is empty if this is the store's only product. The delivered order still shows `Red rice 1kg` at `125.50` per unit. A second seller's JWT cannot read or modify these products/orders. Knowing only the storefront slug does not grant access to customer details, order references, or payment proofs.
