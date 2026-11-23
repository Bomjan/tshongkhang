import express from 'express';
import { fileURLToPath } from 'node:url';
import { sellerRoutes } from './routes/seller.js';
import { productRoutes } from './routes/product.js';
import { errorHandler } from './middleware/errors.js';
import { authRoutes } from './routes/auth.js';
import { storeRoutes } from './routes/store.js';
import { shopRoutes } from './routes/shop.js';
import { shopSlugPattern, reservedShopSlugs } from './config/shop.js';
import { validate } from './middleware/validate.js';
import { idParams } from './schemas/requests.js';
import { HttpError } from './middleware/errors.js';
import { uploadRoutes } from './routes/upload.js';

export function createApp(pool, { uploadDirectory = fileURLToPath(new URL('../uploads/products/', import.meta.url)) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: https: http:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
        return res.status(403).json({ error: 'Requests must come from this website' });
      }
      const imageUpload = /^\/api\/uploads\/products\/?$/.test(req.path) && req.is(['image/jpeg', 'image/png', 'image/webp']);
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json') && !imageUpload) {
        return res.status(415).json({ error: 'Use application/json' });
      }
    }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (req, res) => res.json({ message: 'Tshongkhang API is running' }));
  app.use('/api/auth', authRoutes(pool));
  app.use('/api/sellers', sellerRoutes(pool));
  app.use('/api/products', productRoutes(pool));
  app.use('/api/stores', storeRoutes(pool));
  app.use('/api/shops', shopRoutes(pool));
  app.use('/api/uploads', uploadRoutes(pool, uploadDirectory));
  app.use('/images/uploads', express.static(uploadDirectory, { immutable: true, maxAge: '1y', dotfiles: 'deny' }));
  const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
  app.use(express.static(publicDirectory));
  app.get(['/stores/:id', '/store/:id', '/cart/:id', '/checkout/:id'], validate(idParams, 'params'), async (req, res) => {
    const result = await pool.query('SELECT slug FROM sellers WHERE id = $1', [req.validated.params.id]);
    if (!result.rowCount) throw new HttpError(404, 'Shop not found');
    const section = req.path.split('/')[1];
    const suffix = section === 'cart' || section === 'checkout' ? `${section}/` : '';
    res.redirect(308, `/${result.rows[0].slug}/${suffix}`);
  });
  app.get(['/', '/login', '/register', '/seller', '/seller/shop', '/products/:id', '/receipt/:id'],
    (req, res) => res.sendFile(`${publicDirectory}/index.html`));
  app.get(['/:slug', '/:slug/cart', '/:slug/checkout'], async (req, res, next) => {
    const slug = req.params.slug.toLowerCase();
    if (slug.length > 63 || !shopSlugPattern.test(slug) || reservedShopSlugs.has(slug)) return next();
    const result = await pool.query('SELECT id FROM sellers WHERE slug = $1', [slug]);
    if (!result.rowCount) return res.status(404).sendFile(`${publicDirectory}/index.html`);
    const section = req.path.split('/')[2];
    const canonical = `/${slug}/${section ? `${section}/` : ''}`;
    if (req.path !== canonical) return res.redirect(308, canonical);
    res.sendFile(`${publicDirectory}/index.html`);
  });
  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
