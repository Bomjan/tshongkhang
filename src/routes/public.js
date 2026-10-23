import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { slugParams, referenceParams, checkoutSchema, proofSchema } from '../schemas/requests.js';

export function publicRoutes(controller) {
  const router = Router();
  router.get('/stores/:slug', validate(slugParams, 'params'), controller.store);
  router.get('/stores/:slug/products', validate(slugParams, 'params'), controller.products);
  router.post('/stores/:slug/orders', validate(slugParams, 'params'), validate(checkoutSchema), controller.checkout);
  router.get('/orders/:reference', validate(referenceParams, 'params'), controller.track);
  router.patch('/orders/:reference/payment-proof', validate(referenceParams, 'params'), validate(proofSchema), controller.proof);
  return router;
}
