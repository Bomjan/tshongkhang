// Keep the matching database constraint in 004_shop_slugs.sql in sync.
export const reservedShopSlugs = new Set([
  'api', 'admin', 'auth', 'login', 'register', 'seller', 'store', 'stores',
  'products', 'cart', 'checkout', 'receipt', 'images', 'assets', 'www',
  'health', 'help', 'support', 'about', 'contact', 'settings',
]);
export const shopSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugFromName(name) {
  let slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63).replace(/-$/g, '') || 'shop';
  if (reservedShopSlugs.has(slug)) slug = `${slug}-shop`;
  return slug;
}

// Call inside the same transaction as the INSERT. Serializing allocation makes
// identical shop names safe even when sellers register at the same time.
export async function allocateShopSlug(client, name, requested) {
  await client.query('SELECT pg_advisory_xact_lock(742902)');
  if (requested) return requested;
  const base = slugFromName(name);
  let slug = base;
  for (let suffix = 2; ; suffix++) {
    const exists = await client.query('SELECT 1 FROM sellers WHERE slug = $1', [slug]);
    if (!exists.rowCount) return slug;
    const tail = `-${suffix}`;
    slug = `${base.slice(0, 63 - tail.length).replace(/-$/, '')}${tail}`;
  }
}
