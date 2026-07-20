import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(os.tmpdir(), `pos-smoke-${Date.now()}`);
const dbPath = path.join(tmp, 'pos.sqlite');
const uploadsPath = path.join(tmp, 'uploads');

fs.mkdirSync(uploadsPath, { recursive: true });

const app = await createServer({
  dbPath,
  uploadsPath,
  jwtSecret: 'smoke-test-secret',
});

const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function req(pathname, options = {}, token) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${pathname}`, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

try {
  const health = await req('/');
  if (health.status !== 'ok') throw new Error('health failed');

  const login = await req('/api/users/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  if (!login.token) throw new Error('no token');
  const token = login.token;

  await req(
    '/api/categories/category',
    { method: 'POST', body: JSON.stringify({ name: 'Drinks' }) },
    token
  );

  const fd = new FormData();
  fd.append('id', '');
  fd.append('name', 'Cola');
  fd.append('price', '2.5');
  fd.append('category', 'Drinks');
  fd.append('quantity', '10');
  fd.append('stock', '1');
  fd.append('img', '');
  await req('/api/inventory/product', { method: 'POST', body: fd }, token);

  const products = await req('/api/inventory/products', {}, token);
  const product = products.find((p) => p.name === 'Cola');
  if (!product) throw new Error('product missing');

  await req(
    '/api/new',
    {
      method: 'POST',
      body: JSON.stringify({
        ref_number: '',
        customer: '0',
        customer_name: 'Walk-in Customer',
        status: 1,
        user_id: 1,
        user: 'Administrator',
        till: 1,
        discount: 0,
        subtotal: 5,
        tax: 0,
        total: 5,
        paid: 5,
        change: 0,
        payment_type: 1,
        items: [{ id: product.id, name: 'Cola', price: 2.5, quantity: 2 }],
        date: new Date().toISOString(),
      }),
    },
    token
  );

  const after = await req(`/api/inventory/product/${product.id}`, {}, token);
  if (after.quantity !== 8) {
    throw new Error(`expected qty 8 after sale, got ${after.quantity}`);
  }

  // Terminal-style: bind host 0.0.0.0 simulation via second request with auth
  const tx = await req(
    `/api/by-date?start=${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}&end=${encodeURIComponent(new Date().toISOString())}&user=0&till=0&status=1`,
    {},
    token
  );
  if (!tx.length) throw new Error('no transactions found');

  console.log('SMOKE OK');
  console.log(JSON.stringify({
    health: health.message,
    user: login.user.username,
    productId: product.id,
    stockAfterSale: after.quantity,
    transactions: tx.length,
  }, null, 2));
} catch (err) {
  console.error('SMOKE FAILED', err);
  process.exitCode = 1;
} finally {
  server.close();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
