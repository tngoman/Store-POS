import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { getDb, mapProduct } from '../db.js';
import { requirePerm } from '../auth.js';

export default function inventoryRouter(uploadsPath) {
  const router = Router();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsPath),
    filename: (_req, _file, cb) => cb(null, `${Date.now()}.jpg`),
  });
  const upload = multer({ storage });

  router.get('/products', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM products ORDER BY name').all();
    res.json(rows.map(mapProduct));
  });

  router.get('/product/:productId', (req, res) => {
    const row = getDb()
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(parseInt(req.params.productId, 10));
    res.json(mapProduct(row));
  });

  router.post('/product/sku', (req, res) => {
    const sku = req.body?.skuCode;
    const row = getDb()
      .prepare('SELECT * FROM products WHERE id = ? OR name = ?')
      .get(parseInt(sku, 10) || -1, String(sku || ''));
    res.json(mapProduct(row));
  });

  router.post(
    '/product',
    requirePerm('perm_products'),
    upload.single('imagename'),
    (req, res) => {
      const body = req.body || {};
      let image = body.img || '';

      if (req.file) {
        image = req.file.filename;
      }

      if (String(body.remove) === '1' && body.img) {
        const oldPath = path.join(uploadsPath, body.img);
        try {
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch (err) {
          console.error(err);
        }
        if (!req.file) image = '';
      }

      const stock = body.stock === 'on' || body.stock === 0 || body.stock === '0' ? 0 : 1;
      const quantity = body.quantity === '' || body.quantity == null ? 0 : parseInt(body.quantity, 10);

      if (!body.id) {
        const result = getDb()
          .prepare(
            `INSERT INTO products (name, price, category, quantity, stock, img)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(
            body.name,
            parseFloat(body.price) || 0,
            body.category || '',
            quantity,
            stock,
            image
          );
        const row = getDb().prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
        return res.json(mapProduct(row));
      }

      const id = parseInt(body.id, 10);
      getDb()
        .prepare(
          `UPDATE products SET name = ?, price = ?, category = ?, quantity = ?, stock = ?, img = ?
           WHERE id = ?`
        )
        .run(
          body.name,
          parseFloat(body.price) || 0,
          body.category || '',
          quantity,
          stock,
          image,
          id
        );
      res.sendStatus(200);
    }
  );

  router.delete('/product/:productId', requirePerm('perm_products'), (req, res) => {
    const id = parseInt(req.params.productId, 10);
    const row = getDb().prepare('SELECT img FROM products WHERE id = ?').get(id);
    getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
    if (row?.img) {
      const imgPath = path.join(uploadsPath, row.img);
      try {
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      } catch (err) {
        console.error(err);
      }
    }
    res.sendStatus(200);
  });

  router.post('/products/bulk-delete', requirePerm('perm_products'), (req, res) => {
    const ids = (req.body?.ids || [])
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) {
      return res.status(400).json({ error: 'No product ids provided' });
    }

    const db = getDb();
    let deleted = 0;
    db.transaction(() => {
      const getImg = db.prepare('SELECT img FROM products WHERE id = ?');
      const del = db.prepare('DELETE FROM products WHERE id = ?');
      for (const id of ids) {
        const row = getImg.get(id);
        const result = del.run(id);
        if (result.changes) deleted += 1;
        if (row?.img) {
          const imgPath = path.join(uploadsPath, row.img);
          try {
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
          } catch (err) {
            console.error(err);
          }
        }
      }
    })();

    res.json({ ok: true, deleted });
  });

  return router;
}
