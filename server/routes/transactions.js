import { Router } from 'express';
import { getDb, mapTransaction } from '../db.js';
import { requirePerm } from '../auth.js';

const router = Router();

function decrementInventory(items, db) {
  for (const item of items || []) {
    const id = parseInt(item.id ?? item._id, 10);
    const qty = parseInt(item.quantity, 10) || 0;
    if (!id || !qty) continue;
    const product = db.prepare('SELECT id, quantity, stock FROM products WHERE id = ?').get(id);
    if (!product || product.stock === 0) continue;
    const updated = Math.max(0, (product.quantity || 0) - qty);
    db.prepare('UPDATE products SET quantity = ? WHERE id = ?').run(updated, id);
  }
}

router.get('/all', requirePerm('perm_transactions'), (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM transactions ORDER BY date DESC').all();
  res.json(rows.map(mapTransaction));
});

router.get('/on-hold', (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM transactions
       WHERE ref_number != '' AND status = 0
       ORDER BY date DESC`
    )
    .all();
  res.json(rows.map(mapTransaction));
});

router.get('/customer-orders', (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM transactions
       WHERE customer != '0' AND status = 0 AND (ref_number IS NULL OR ref_number = '')
       ORDER BY date DESC`
    )
    .all();
  res.json(rows.map(mapTransaction));
});

router.get('/by-date', requirePerm('perm_transactions'), (req, res) => {
  const startDate = new Date(String(req.query.start || ''));
  const endDate = new Date(String(req.query.end || ''));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Invalid start or end date' });
  }

  const start = startDate.toISOString();
  const end = endDate.toISOString();
  const statusRaw = parseInt(String(req.query.status), 10);
  const status = Number.isFinite(statusRaw) ? statusRaw : 1;
  const userId = parseInt(String(req.query.user), 10) || 0;
  const till = parseInt(String(req.query.till), 10) || 0;

  let sql = `SELECT * FROM transactions WHERE date >= ? AND date <= ? AND status = ?`;
  const params = [start, end, status];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  if (till) {
    sql += ' AND till = ?';
    params.push(till);
  }
  sql += ' ORDER BY date DESC';

  const rows = getDb().prepare(sql).all(...params);
  res.json(rows.map(mapTransaction));
});

router.post('/new', (req, res) => {
  const body = req.body || {};
  const items = body.items || [];
  const paid = parseFloat(body.paid) || 0;
  const total = parseFloat(body.total) || 0;

  const db = getDb();
  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO transactions (
          ref_number, customer, customer_name, status, user_id, user_name, till,
          discount, subtotal, tax, total, paid, change, payment_type, items_json, date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.ref_number || '',
        String(body.customer ?? '0'),
        body.customer_name || '',
        parseInt(body.status, 10) ?? 1,
        parseInt(body.user_id, 10) || 0,
        body.user || body.user_name || '',
        parseInt(body.till, 10) || 1,
        parseFloat(body.discount) || 0,
        parseFloat(body.subtotal) || 0,
        parseFloat(body.tax) || 0,
        total,
        paid,
        parseFloat(body.change) || 0,
        parseInt(body.payment_type, 10) || 1,
        JSON.stringify(items),
        body.date || new Date().toISOString()
      );

    if (paid >= total && (parseInt(body.status, 10) === 1 || body.status === undefined)) {
      decrementInventory(items, db);
    }

    return result.lastInsertRowid;
  });

  const id = insert();
  res.json({ ok: true, id });
});

router.put('/new', (req, res) => {
  const body = req.body || {};
  const id = parseInt(body._id ?? body.id, 10);
  const items = body.items || [];
  const paid = parseFloat(body.paid) || 0;
  const total = parseFloat(body.total) || 0;
  const status = parseInt(body.status, 10) ?? 1;

  const db = getDb();
  const update = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    db.prepare(
      `UPDATE transactions SET
        ref_number = ?, customer = ?, customer_name = ?, status = ?, user_id = ?, user_name = ?, till = ?,
        discount = ?, subtotal = ?, tax = ?, total = ?, paid = ?, change = ?, payment_type = ?, items_json = ?, date = ?
       WHERE id = ?`
    ).run(
      body.ref_number || '',
      String(body.customer ?? '0'),
      body.customer_name || '',
      status,
      parseInt(body.user_id, 10) || 0,
      body.user || body.user_name || '',
      parseInt(body.till, 10) || 1,
      parseFloat(body.discount) || 0,
      parseFloat(body.subtotal) || 0,
      parseFloat(body.tax) || 0,
      total,
      paid,
      parseFloat(body.change) || 0,
      parseInt(body.payment_type, 10) || 1,
      JSON.stringify(items),
      body.date || new Date().toISOString(),
      id
    );

    // Decrement stock when completing a previously unpaid/hold order
    if (existing && existing.status === 0 && status === 1 && paid >= total) {
      decrementInventory(items, db);
    }
  });

  update();
  res.sendStatus(200);
});

router.post('/delete', (req, res) => {
  const orderId = parseInt(req.body?.orderId ?? req.body?._id, 10);
  getDb().prepare('DELETE FROM transactions WHERE id = ?').run(orderId);
  res.sendStatus(200);
});

router.get('/transaction/:transactionId', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(parseInt(req.params.transactionId, 10));
  res.json(mapTransaction(row));
});

export default router;
