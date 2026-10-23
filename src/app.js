import express from 'express';
import { userRoutes } from './routes/user.js';
import { sellerRoutes } from './routes/seller.js';
import { productRoutes } from './routes/product.js';
import { errorHandler } from './middleware/errors.js';

export function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (req, res) => res.json({ message: 'Tshongkhang API is running' }));
  app.use('/api/users', userRoutes(pool));
  app.use('/api/sellers', sellerRoutes(pool));
  app.use('/api/products', productRoutes(pool));
  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
