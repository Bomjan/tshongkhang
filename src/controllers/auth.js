export function authController(sellers) {
  return {
    register: async (req, res) => res.status(201).json(await sellers.register(req.validated.body)),
    login: async (req, res) => res.json(await sellers.login(req.validated.body)),
  };
}
