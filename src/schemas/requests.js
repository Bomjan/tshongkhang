import { z } from 'zod';

export const statuses = ['Placed', 'Payment Confirmed', 'Packed', 'Delivered', 'Cancelled'];
const text = max => z.string().trim().min(1).max(max);
const phone = z.string().trim().regex(/^\+?[0-9][0-9 ()-]{5,24}$/, 'Enter a valid phone number');
const imageUrl = z.url().max(2048).refine(value => ['https:', 'http:'].includes(new URL(value).protocol), 'Use an HTTP(S) URL').nullable();
const slug = z.string().min(3).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
// Keep IDs as strings: PostgreSQL BIGINT can exceed JavaScript's safe integer range.
const id = z.string().regex(/^[1-9]\d{0,18}$/).refine(value => BigInt(value) <= 9223372036854775807n, 'ID out of range');
const productId = z.union([id, z.number().int().positive().max(Number.MAX_SAFE_INTEGER).transform(String)]);
const password = z.string().min(10).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');
const email = z.email().max(254).transform(value => value.toLowerCase());
const profileFields = {
  business_name: text(150), phone, location: text(250), storefront_slug: slug,
  qr_image_url: imageUrl,
};
export const registerSchema = z.strictObject({
  ...profileFields, qr_image_url: imageUrl.optional(), email, password,
});
export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes'),
});
const nonemptyPatch = schema => schema.partial().refine(value => Object.keys(value).length > 0, 'Supply at least one field');
export const profileSchema = nonemptyPatch(z.strictObject(profileFields));
const productFields = {
  name: text(150), description: z.string().trim().max(5000).default(''),
  price: z.string().regex(/^(0|[1-9]\d{0,9})\.\d{2}$/, 'Use a decimal string, e.g. "125.50"')
    .refine(value => value !== '0.00', 'Price must be positive'),
  stock: z.number().int().min(0).max(2147483647),
  image_url: imageUrl.optional(), is_active: z.boolean().default(true),
};
export const createProductSchema = z.strictObject(productFields);
// Remove defaults from PATCH so omitted fields stay unchanged.
export const updateProductSchema = nonemptyPatch(z.strictObject({
  ...productFields, description: z.string().trim().max(5000), is_active: z.boolean(),
}));
export const checkoutSchema = z.strictObject({
  customer_name: text(150), customer_phone: phone, delivery_address: text(1000),
  items: z.array(z.strictObject({ product_id: productId, quantity: z.number().int().min(1).max(2147483647) })).min(1).max(100),
});
export const proofSchema = z.strictObject({ payment_proof_url: imageUrl.unwrap() });
export const statusSchema = z.strictObject({
  status: z.enum(statuses), cancellation_reason: text(500).optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'Cancelled' && !value.cancellation_reason) {
    ctx.addIssue({ code: 'custom', path: ['cancellation_reason'], message: 'Cancellation requires a reason' });
  }
  if (value.status !== 'Cancelled' && value.cancellation_reason !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['cancellation_reason'], message: 'Reason is only valid for cancellation' });
  }
});
export const idParams = z.object({ id });
export const slugParams = z.object({ slug });
export const referenceParams = z.object({ reference: z.string().regex(/^[a-f0-9]{48}$/) });
export const orderFilterSchema = z.strictObject({ status: z.enum(statuses).optional() });
