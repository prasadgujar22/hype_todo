import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createApp } from './lib/app.js';
import { createStore } from './lib/store.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT must be an integer between 0 and 65535.');
  process.exit(1);
}

// pg reads DATABASE_URL or standard PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.
const pool = new pg.Pool({
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
  max: 10,
  connectionTimeoutMillis: 10_000,
});
let store;
try {
  store = await createStore(pool);
} catch {
  console.error('Could not initialize PostgreSQL. Check the database connection and credentials.');
  await pool.end();
  process.exit(1);
}
const app = createApp({
  store,
  publicDir: path.join(root, 'public'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  allowedHosts: ['localhost', '127.0.0.1', '[::1]', ...(process.env.ALLOWED_HOSTS || '').split(',')],
  healthCheck: () => pool.query('SELECT 1'),
});
const server = createServer({ requestTimeout: 30_000, headersTimeout: 15_000 }, app.handler);
server.maxHeadersCount = 100;
server.on('error', (error) => {
  console.error('Unable to start server:', error.message);
  process.exit(1);
});
server.listen(port, host, () => {
  const address = server.address();
  console.log(`HYPE is listening on http://${host}:${address.port}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
