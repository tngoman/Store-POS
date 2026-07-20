import { Router } from 'express';
import { getDb, mapUser } from '../db.js';
import {
  authenticate,
  requirePerm,
  loginUser,
  signToken,
  hashPassword,
} from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = loginUser(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  const token = signToken(user);
  res.json({ user, token });
});

router.get('/check', (_req, res) => {
  const admin = getDb().prepare('SELECT id FROM users WHERE id = 1').get();
  res.json({ ready: !!admin });
});

router.use(authenticate);

router.get('/user/:userId', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(parseInt(req.params.userId, 10));
  res.json(mapUser(row));
});

router.get('/logout/:userId', (req, res) => {
  getDb()
    .prepare('UPDATE users SET status = ? WHERE id = ?')
    .run(`Logged Out_${new Date().toISOString()}`, parseInt(req.params.userId, 10));
  res.sendStatus(200);
});

router.get('/all', requirePerm('perm_users'), (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM users ORDER BY id').all();
  res.json(rows.map(mapUser));
});

router.delete(
  '/user/:userId',
  requirePerm('perm_users'),
  (req, res) => {
    const id = parseInt(req.params.userId, 10);
    if (id === 1) {
      return res.status(400).json({ error: 'Cannot delete the default admin' });
    }
    getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
    res.sendStatus(200);
  }
);

router.post('/post', requirePerm('perm_users'), (req, res) => {
  const body = req.body || {};
  const perms = {
    perm_products: body.perm_products ? 1 : 0,
    perm_categories: body.perm_categories ? 1 : 0,
    perm_transactions: body.perm_transactions ? 1 : 0,
    perm_users: body.perm_users ? 1 : 0,
    perm_settings: body.perm_settings ? 1 : 0,
  };

  if (!body.id) {
    const result = getDb()
      .prepare(
        `INSERT INTO users (username, password, fullname, perm_products, perm_categories, perm_transactions, perm_users, perm_settings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.username,
        hashPassword(body.password || 'password'),
        body.fullname || '',
        perms.perm_products,
        perms.perm_categories,
        perms.perm_transactions,
        perms.perm_users,
        perms.perm_settings
      );
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    return res.json(mapUser(row));
  }

  const id = parseInt(body.id, 10);
  if (body.password) {
    getDb()
      .prepare(
        `UPDATE users SET username = ?, password = ?, fullname = ?,
         perm_products = ?, perm_categories = ?, perm_transactions = ?, perm_users = ?, perm_settings = ?
         WHERE id = ?`
      )
      .run(
        body.username,
        hashPassword(body.password),
        body.fullname || '',
        perms.perm_products,
        perms.perm_categories,
        perms.perm_transactions,
        perms.perm_users,
        perms.perm_settings,
        id
      );
  } else {
    getDb()
      .prepare(
        `UPDATE users SET username = ?, fullname = ?,
         perm_products = ?, perm_categories = ?, perm_transactions = ?, perm_users = ?, perm_settings = ?
         WHERE id = ?`
      )
      .run(
        body.username,
        body.fullname || '',
        perms.perm_products,
        perms.perm_categories,
        perms.perm_transactions,
        perms.perm_users,
        perms.perm_settings,
        id
      );
  }
  res.sendStatus(200);
});

export default router;
