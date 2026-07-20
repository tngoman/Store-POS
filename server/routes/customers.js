import { Router } from 'express';
import { getDb, mapCustomer } from '../db.js';

const router = Router();

router.get('/all', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM customers ORDER BY name').all();
  res.json(rows.map(mapCustomer));
});

router.get('/customer/:customerId', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(parseInt(req.params.customerId, 10));
  res.json(mapCustomer(row));
});

router.post('/customer', (req, res) => {
  const body = req.body || {};
  getDb()
    .prepare(
      `INSERT INTO customers (name, phone, email, address) VALUES (?, ?, ?, ?)`
    )
    .run(body.name || '', body.phone || '', body.email || '', body.address || '');
  res.sendStatus(200);
});

router.put('/customer', (req, res) => {
  const body = req.body || {};
  const id = parseInt(body._id ?? body.id, 10);
  getDb()
    .prepare(
      `UPDATE customers SET name = ?, phone = ?, email = ?, address = ? WHERE id = ?`
    )
    .run(body.name || '', body.phone || '', body.email || '', body.address || '', id);
  res.sendStatus(200);
});

router.delete('/customer/:customerId', (req, res) => {
  getDb()
    .prepare('DELETE FROM customers WHERE id = ?')
    .run(parseInt(req.params.customerId, 10));
  res.sendStatus(200);
});

export default router;
