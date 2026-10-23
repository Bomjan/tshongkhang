export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (error.code === '23505') return res.status(409).json({ error: 'Email already exists' });
  if (error.code === '23503') return res.status(409).json({ error: 'Related seller is missing or still has products' });
  console.error('Request failed:', error);
  return res.status(500).json({ error: 'Internal server error' });
}
