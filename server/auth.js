import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb, mapUser } from './db.js';

let jwtSecret = 'store-pos-dev-secret';

export function setJwtSecret(secret) {
  jwtSecret = secret || jwtSecret;
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id || user._id,
      username: user.username,
      perm_products: user.perm_products,
      perm_categories: user.perm_categories,
      perm_transactions: user.perm_transactions,
      perm_users: user.perm_users,
      perm_settings: user.perm_settings,
    },
    jwtSecret,
    { expiresIn: '12h' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, jwtSecret);
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.id === 1 || req.user[perm]) {
      return next();
    }
    return res.status(403).json({ error: 'Permission denied' });
  };
}

export function requireAnyPerm(...perms) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.id === 1 || perms.some((perm) => req.user[perm])) {
      return next();
    }
    return res.status(403).json({ error: 'Permission denied' });
  };
}

export function loginUser(username, password) {
  const row = getDb()
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username);
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password)) return null;

  getDb()
    .prepare('UPDATE users SET status = ? WHERE id = ?')
    .run(`Logged In_${new Date().toISOString()}`, row.id);

  return mapUser(row);
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}
