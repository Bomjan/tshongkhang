import pg from 'pg';

export function createPool(connectionString) {
  // pg returns NUMERIC and BIGINT as strings. Do not install float parsers.
  return new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
}

export async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
