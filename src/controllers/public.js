export function publicController(sellers, products, orders) {
  return {
    store: async (req, res) => res.json(await sellers.store(req.validated.params.slug)),
    products: async (req, res) => res.json(await products.publicList(req.validated.params.slug)),
    checkout: async (req, res) => res.status(201).json(await orders.checkout(req.validated.params.slug, req.validated.body)),
    track: async (req, res) => res.json(await orders.track(req.validated.params.reference)),
    proof: async (req, res) => res.json(await orders.submitProof(req.validated.params.reference, req.validated.body.payment_proof_url)),
  };
}
