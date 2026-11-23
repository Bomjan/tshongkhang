import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import { createPool, transaction } from '../src/config/database.js';
import { hashPassword } from '../src/middleware/auth.js';
import { migrate } from './migrate.js';
import { allocateShopSlug } from '../src/config/shop.js';

export const demoEmail = 'demo@tshongkhang.local';
export const demoPassword = 'Tshongkhang123!';

export async function seedDemo(pool, origin = 'http://localhost:3000') {
  const passwordHash = await hashPassword(demoPassword);
  return transaction(pool, async client => {
    const slug = await allocateShopSlug(client, 'Druk Local Pantry');
    const seller = await client.query(`INSERT INTO sellers (business_name, email, password_hash, location, description, phone, slug)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (email) DO NOTHING RETURNING id`,
    ['Druk Local Pantry', demoEmail, passwordHash, 'Thimphu',
      'A small collection of Bhutan-grown pantry favourites, handmade goods and everyday comforts.', '17123456', slug]);
    if (!seller.rowCount) return { created: false };
    const id = seller.rows[0].id;
    const products = [
      ['Bhutanese red rice · 1 kg', 'Grown in the valleys of Bhutan. A nutty, hearty staple for your everyday meals.', '125.50', 24, 'rice'],
      ['Dried red chillies · 250 g', 'Sun-dried red chillies with a warm, familiar kick. A pantry essential.', '180.00', 18, 'chilli'],
      ['Lemongrass tea · 50 g', 'A gentle, fragrant cup for slow mornings and quiet evenings.', '150.00', 20, 'tea'],
      ['Wildflower honey · 350 g', 'Golden honey with a delicate floral flavour. Lovely with tea or toast.', '450.00', 12, 'honey'],
      ['Handwoven cotton pouch', 'A colourful little home for your everyday essentials. Made in small batches.', '320.00', 8, 'pouch'],
      ['Handmade wooden bowl', 'A simple wooden bowl for the table, finished to let the grain show.', '650.00', 6, 'bowl'],
    ];
    for (const [name, description, price, stock, image] of products) {
      await client.query(`INSERT INTO products (seller_id, name, description, price, stock, image_url)
        VALUES ($1,$2,$3,$4,$5,$6)`, [id, name, description, price, stock, `${origin}/images/${image}.svg`]);
    }
    return { created: true, sellerId: id };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seed is only for local development');
  const origin = new URL(process.env.DEMO_ORIGIN || `http://localhost:${process.env.PORT || 3000}`).origin;
  const pool = createPool(process.env.DATABASE_URL);
  try {
    await migrate(pool);
    const result = await seedDemo(pool, origin);
    console.log(result.created
      ? `Demo shop created. Log in at ${origin}/login with ${demoEmail} / ${demoPassword}`
      : 'Demo email already exists. Existing account and products were left unchanged.');
  } finally { await pool.end(); }
}
