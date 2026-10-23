import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { profileSchema, createProductSchema, updateProductSchema, idParams, orderFilterSchema, statusSchema } from '../schemas/requests.js';

export function sellerRoutes(controller, auth) {
  const router = Router();
  router.use(auth);
  router.get('/profile', controller.profile);
  router.patch('/profile', validate(profileSchema), controller.updateProfile);
  router.post('/products', validate(createProductSchema), controller.createProduct);
  router.get('/products', controller.products);
  router.patch('/products/:id', validate(idParams, 'params'), validate(updateProductSchema), controller.updateProduct);
  router.get('/orders', validate(orderFilterSchema, 'query'), controller.orders);
  router.get('/orders/:id', validate(idParams, 'params'), controller.order);
  router.patch('/orders/:id/status', validate(idParams, 'params'), validate(statusSchema), controller.changeStatus);
  return router;
}
