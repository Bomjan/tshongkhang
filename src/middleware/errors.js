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
  if (error.code === '23505') return res.status(409).json({ error: 'Email or storefront slug already exists' });
  if (error.code === '22003') return res.status(409).json({ error: 'Value exceeds the supported range' });
  console.error('Request failed:', error);
  return res.status(500).json({ error: 'Internal server error' });
}
