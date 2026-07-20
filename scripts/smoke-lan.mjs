import path from 'path';
import fs from 'fs';
import os from 'os';
import { createServer } from '../server/index.js';

const tmp = path.join(os.tmpdir(), `pos-lan-smoke-${Date.now()}`);
const dbPath = path.join(tmp, 'pos.sqlite');
const uploadsPath = path.join(tmp, 'uploads');
fs.mkdirSync(uploadsPath, { recursive: true });

const app = await createServer({
  dbPath,
  uploadsPath,
  jwtSecret: 'lan-smoke-secret',
});

// Network Server mode: bind all interfaces
const server = app.listen(0, '0.0.0.0');
await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address();

async function client(host, pathname, options = {}, token) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`http://${host}:${port}${pathname}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${pathname} ${res.status} ${JSON.stringify(data)}`);
  return data;
}

try {
  // Simulate terminal hitting the server via loopback (LAN path)
  const health = await client('127.0.0.1', '/');
  if (health.status !== 'ok') throw new Error('server not reachable');

  const login = await client('127.0.0.1', '/api/users/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });

  // Unauthenticated write should fail
  const denied = await fetch(`http://127.0.0.1:${port}/api/categories/category`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X' }),
  });
  if (denied.status !== 401) throw new Error(`expected 401, got ${denied.status}`);

  await client(
    '127.0.0.1',
    '/api/categories/category',
    { method: 'POST', body: JSON.stringify({ name: 'Snacks' }) },
    login.token
  );

  console.log('LAN SMOKE OK');
  console.log(JSON.stringify({ bound: '0.0.0.0', port, authRequired: true }, null, 2));
} catch (err) {
  console.error('LAN SMOKE FAILED', err);
  process.exitCode = 1;
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
