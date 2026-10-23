export function sellerController(sellers, products, orders) {
  return {
    profile: async (req, res) => res.json(await sellers.profile(req.sellerId)),
    updateProfile: async (req, res) => res.json(await sellers.updateProfile(req.sellerId, req.validated.body)),
    products: async (req, res) => res.json(await products.list(req.sellerId)),
    createProduct: async (req, res) => res.status(201).json(await products.create(req.sellerId, req.validated.body)),
    updateProduct: async (req, res) => res.json(await products.update(req.sellerId, req.validated.params.id, req.validated.body)),
    orders: async (req, res) => res.json(await orders.list(req.sellerId, req.validated.query.status)),
    order: async (req, res) => res.json(await orders.detail(req.sellerId, req.validated.params.id)),
    changeStatus: async (req, res) => res.json(await orders.changeStatus(req.sellerId, req.validated.params.id, req.validated.body)),
  };
}
