import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas/requests.js';

export function authRoutes(controller, config) {
  const router = Router();
  router.use(rateLimit({
    windowMs: 15 * 60 * 1000, limit: config.AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Try again later.' },
  }));
  router.post('/register', validate(registerSchema), controller.register);
  router.post('/login', validate(loginSchema), controller.login);
  return router;
}
