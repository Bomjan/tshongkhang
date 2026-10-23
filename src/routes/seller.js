import { Router } from 'express';
import { sellerController } from '../controllers/seller.js';
import { validate } from '../middleware/validate.js';
import { idParams, sellerSchema, sellerProfileSchema } from '../schemas/requests.js';

export function sellerRoutes(pool) {
  const router = Router();
  const controller = sellerController(pool);
  router.post('/', validate(sellerSchema), controller.create);
  router.get('/', controller.list);
  router.get('/:id', validate(idParams, 'params'), controller.get);
  router.put('/:id', validate(idParams, 'params'), validate(sellerSchema), controller.update);
  router.delete('/:id', validate(idParams, 'params'), controller.remove);
  router.get('/:id/profile', validate(idParams, 'params'), controller.profile);
  router.patch('/:id/profile', validate(idParams, 'params'), validate(sellerProfileSchema), controller.updateProfile);
  return router;
}
