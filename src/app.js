import express from 'express';
import { sellerService } from './services/sellers.js';
import { productService } from './services/products.js';
import { orderService } from './services/orders.js';
import { authController } from './controllers/auth.js';
import { sellerController } from './controllers/seller.js';
import { publicController } from './controllers/public.js';
import { authRoutes } from './routes/auth.js';
import { sellerRoutes } from './routes/seller.js';
import { publicRoutes } from './routes/public.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';

export function createApp(pool, config) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  const sellers = sellerService(pool, config);
  const products = productService(pool);
  const orders = orderService(pool);
  app.use('/api/auth', authRoutes(authController(sellers), config));
  app.use('/api/seller', sellerRoutes(sellerController(sellers, products, orders), authenticate(pool, config)));
  app.use('/api', publicRoutes(publicController(sellers, products, orders)));
  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
