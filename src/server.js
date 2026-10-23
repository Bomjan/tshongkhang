import { readConfig } from './config/env.js';
import { createPool } from './config/database.js';
import { createApp } from './app.js';

const config = readConfig();
const pool = createPool(config.DATABASE_URL);
pool.on('error', error => console.error('Idle database connection failed:', error.message));
await pool.query('SELECT 1');
const server = createApp(pool).listen(config.PORT, () => {
  console.log(`Tshongkhang API listening on port ${config.PORT}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await pool.end();
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
