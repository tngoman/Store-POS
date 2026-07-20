import { Router } from 'express';
import { getDb, mapCategory } from '../db.js';
import { requirePerm } from '../auth.js';

const router = Router();

router.get('/all', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM categories ORDER BY name').all();
  res.json(rows.map(mapCategory));
});

router.post('/category', requirePerm('perm_categories'), (req, res) => {
  const name = req.body?.name;
  if (!name) return res.status(400).json({ error: 'Name required' });
  getDb().prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  res.sendStatus(200);
});

router.put('/category', requirePerm('perm_categories'), (req, res) => {
  const id = parseInt(req.body?.id ?? req.body?._id, 10);
  const name = req.body?.name;
  getDb().prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
  res.sendStatus(200);
});

router.delete('/category/:categoryId', requirePerm('perm_categories'), (req, res) => {
  getDb()
    .prepare('DELETE FROM categories WHERE id = ?')
    .run(parseInt(req.params.categoryId, 10));
  res.sendStatus(200);
});

export default router;
