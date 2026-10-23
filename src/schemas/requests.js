import { z } from 'zod';

const text = max => z.string().trim().min(1).max(max);
const email = z.email().max(254).transform(value => value.toLowerCase());
const phone = z.string().trim().regex(/^\+?[0-9][0-9 ()-]{5,24}$/, 'Enter a valid phone number').nullable();
const imageUrl = z.url().max(2048).refine(value => /^https?:\/\//.test(value),
  'Use an HTTP(S) URL').nullable();

const id = z.string().regex(/^[1-9]\d{0,18}$/).pipe(z.string()
  .refine(value => BigInt(value) <= 9223372036854775807n, 'ID out of range'));
export const idParams = z.object({ id });

// Profiles are fields on the user/seller row, not separate tables.
const userProfileFields = {
  name: text(100), phone, address: z.string().trim().max(500), avatar_url: imageUrl,
};
const sellerProfileFields = {
  business_name: text(150), phone, location: z.string().trim().max(250),
  description: z.string().trim().max(2000), logo_url: imageUrl,
};

// POST and PUT accept the full record. Omitted optional fields get defaults.
export const userSchema = z.strictObject({
  ...userProfileFields, email, phone: phone.default(null),
  address: userProfileFields.address.default(''), avatar_url: imageUrl.default(null),
});
export const sellerSchema = z.strictObject({
  ...sellerProfileFields, email, phone: phone.default(null),
  location: sellerProfileFields.location.default(''),
  description: sellerProfileFields.description.default(''), logo_url: imageUrl.default(null),
});

// PATCH changes only the supplied fields and rejects an empty body.
export const userProfileSchema = z.strictObject(userProfileFields).partial()
  .refine(value => Object.keys(value).length > 0, 'Supply at least one profile field');
export const sellerProfileSchema = z.strictObject(sellerProfileFields).partial()
  .refine(value => Object.keys(value).length > 0, 'Supply at least one profile field');

const productFields = {
  name: text(150), description: z.string().trim().max(2000).default(''),
  // Store money as decimal strings: never convert PostgreSQL NUMERIC to a JS float.
  price: z.string().regex(/^(0|[1-9]\d{0,9})\.\d{2}$/, 'Use a price string such as "125.50"')
    .refine(value => value !== '0.00', 'Price must be positive'),
  stock: z.number().int().min(0).max(2147483647).default(0),
  image_url: imageUrl.default(null),
};
export const createProductSchema = z.strictObject({ seller_id: id, ...productFields });
// Updating product details does not transfer the product to another seller.
export const updateProductSchema = z.strictObject(productFields);
export const productFilterSchema = z.strictObject({ seller_id: id.optional() });
