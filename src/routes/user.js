import { Router } from 'express';
import { userController } from '../controllers/user.js';
import { validate } from '../middleware/validate.js';
import { idParams, userSchema, userProfileSchema } from '../schemas/requests.js';

export function userRoutes(pool) {
  const router = Router();
  const controller = userController(pool);
  router.post('/', validate(userSchema), controller.create);
  router.get('/', controller.list);
  router.get('/:id', validate(idParams, 'params'), controller.get);
  router.put('/:id', validate(idParams, 'params'), validate(userSchema), controller.update);
  router.delete('/:id', validate(idParams, 'params'), controller.remove);
  router.get('/:id/profile', validate(idParams, 'params'), controller.profile);
  router.patch('/:id/profile', validate(idParams, 'params'), validate(userProfileSchema), controller.updateProfile);
  return router;
}
