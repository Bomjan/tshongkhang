import { Router } from 'express';
import { productController } from '../controllers/product.js';
import { validate } from '../middleware/validate.js';
import { idParams, createProductSchema, updateProductSchema, productFilterSchema } from '../schemas/requests.js';

export function productRoutes(pool) {
  const router = Router();
  const controller = productController(pool);
  router.post('/', validate(createProductSchema), controller.create);
  router.get('/', validate(productFilterSchema, 'query'), controller.list);
  router.get('/:id', validate(idParams, 'params'), controller.get);
  router.put('/:id', validate(idParams, 'params'), validate(updateProductSchema), controller.update);
  router.delete('/:id', validate(idParams, 'params'), controller.remove);
  return router;
}
