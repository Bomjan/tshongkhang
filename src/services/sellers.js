import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { HttpError } from '../middleware/errors.js';

const profileColumns = 'id, business_name, email, phone, location, storefront_slug, qr_image_url, created_at';

export function sellerService(pool, config) {
  // Compare a real hash even for unknown emails to reduce account-enumeration timing differences.
  const dummyHash = bcrypt.hash('dummy-password-never-used-to-login', config.BCRYPT_ROUNDS);
  function token(seller) {
    return jwt.sign({}, config.JWT_SECRET, {
      algorithm: 'HS256', subject: seller.id, issuer: 'tshongkhang', audience: 'seller',
      expiresIn: config.JWT_EXPIRES_IN,
    });
  }
  return {
    async register(data) {
      const hash = await bcrypt.hash(data.password, config.BCRYPT_ROUNDS);
      const result = await pool.query(`INSERT INTO sellers
        (business_name, email, password_hash, phone, location, storefront_slug, qr_image_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${profileColumns}`,
      [data.business_name, data.email, hash, data.phone, data.location, data.storefront_slug, data.qr_image_url ?? null]);
      const seller = result.rows[0];
      return { seller, token: token(seller) };
    },
    async login(data) {
      const result = await pool.query('SELECT * FROM sellers WHERE email = $1', [data.email]);
      const seller = result.rows[0];
      const matches = await bcrypt.compare(data.password, seller?.password_hash ?? await dummyHash);
      if (!seller || !matches) throw new HttpError(401, 'Invalid email or password');
      return { token: token(seller) };
    },
    async profile(sellerId) {
      const result = await pool.query(`SELECT ${profileColumns} FROM sellers WHERE id = $1`, [sellerId]);
      return result.rows[0];
    },
    async updateProfile(sellerId, data) {
      // Explicit allowlist: request keys never become unchecked SQL identifiers.
      const fields = ['business_name', 'phone', 'location', 'storefront_slug', 'qr_image_url']
        .filter(field => data[field] !== undefined);
      const values = fields.map(field => data[field]);
      const setters = fields.map((field, i) => `${field} = $${i + 1}`);
      values.push(sellerId);
      const result = await pool.query(`UPDATE sellers SET ${setters.join(', ')}
        WHERE id = $${values.length} RETURNING ${profileColumns}`, values);
      if (!result.rowCount) throw new HttpError(404, 'Seller not found');
      return result.rows[0];
    },
    async store(slug) {
      const result = await pool.query(`SELECT business_name, phone, location, storefront_slug, qr_image_url
        FROM sellers WHERE storefront_slug = $1`, [slug]);
      if (!result.rowCount) throw new HttpError(404, 'Storefront not found');
      return result.rows[0];
    },
  };
}
