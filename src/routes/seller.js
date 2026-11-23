import { Router } from 'express';
import { sellerController } from '../controllers/seller.js';
import { validate } from '../middleware/validate.js';
import { idParams, sellerSchema, sellerProfileSchema } from '../schemas/requests.js';
import { requireSeller, ownSeller } from '../middleware/auth.js';

export function sellerRoutes(pool) {
  const router = Router();
  const controller = sellerController(pool);
  router.get('/', controller.list);
  router.get('/:id', validate(idParams, 'params'), controller.get);
  router.put('/:id', requireSeller(pool), validate(idParams, 'params'), ownSeller, validate(sellerSchema), controller.update);
  router.delete('/:id', requireSeller(pool), validate(idParams, 'params'), ownSeller, controller.remove);
  router.get('/:id/profile', validate(idParams, 'params'), controller.profile);
  router.patch('/:id/profile', requireSeller(pool), validate(idParams, 'params'), ownSeller, validate(sellerProfileSchema), controller.updateProfile);
  return router;
}
