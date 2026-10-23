export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    req.validated ??= {};
    req.validated[source] = result.data;
    next();
  };
}
