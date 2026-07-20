import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import bcrypt from 'bcryptjs';

const require = createRequire(import.meta.url);

let SQL = null;
let db = null;
let rawDb = null;
let dbPath = null;
let persistTimer = null;

function persist() {
  if (!rawDb || !dbPath) return;
  const data = rawDb.export();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persist();
    persistTimer = null;
  }, 50);
}

function wrapDb(raw) {
  return {
    exec(sql) {
      raw.exec(sql);
      schedulePersist();
    },
    prepare(sql) {
      return {
        run(...params) {
          raw.run(sql, params);
          schedulePersist();
          const changes = raw.getRowsModified();
          let lastInsertRowid = 0;
          try {
            const stmt = raw.prepare('SELECT last_insert_rowid() AS id');
            if (stmt.step()) {
              lastInsertRowid = stmt.getAsObject().id;
            }
            stmt.free();
          } catch {
            /* ignore */
          }
          return { changes, lastInsertRowid };
        },
        get(...params) {
          const stmt = raw.prepare(sql);
          stmt.bind(params);
          let row = null;
          if (stmt.step()) {
            row = stmt.getAsObject();
          }
          stmt.free();
          return row || undefined;
        },
        all(...params) {
          const stmt = raw.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.free();
          return rows;
        },
      };
    },
    transaction(fn) {
      return (...args) => {
        raw.run('BEGIN');
        try {
          const result = fn(...args);
          raw.run('COMMIT');
          schedulePersist();
          return result;
        } catch (err) {
          raw.run('ROLLBACK');
          throw err;
        }
      };
    },
    pragma() {
      /* no-op for sql.js compatibility */
    },
  };
}

export function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export async function initDatabase(filePath) {
  dbPath = filePath;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!SQL) {
    const wasmPath = path.join(
      path.dirname(require.resolve('sql.js')),
      'sql-wasm.wasm'
    );
    SQL = await initSqlJs({
      locateFile: () => wasmPath,
    });
  }

  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    rawDb = new SQL.Database(fileBuffer);
  } else {
    rawDb = new SQL.Database();
  }
  db = wrapDb(rawDb);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      fullname TEXT NOT NULL DEFAULT '',
      perm_products INTEGER NOT NULL DEFAULT 0,
      perm_categories INTEGER NOT NULL DEFAULT 0,
      perm_transactions INTEGER NOT NULL DEFAULT 0,
      perm_users INTEGER NOT NULL DEFAULT 0,
      perm_settings INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 1,
      img TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      app TEXT NOT NULL DEFAULT 'Standalone Point of Sale',
      store TEXT NOT NULL DEFAULT '',
      address_one TEXT NOT NULL DEFAULT '',
      address_two TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      tax TEXT NOT NULL DEFAULT '',
      symbol TEXT NOT NULL DEFAULT '$',
      percentage REAL NOT NULL DEFAULT 0,
      charge_tax INTEGER NOT NULL DEFAULT 0,
      footer TEXT NOT NULL DEFAULT '',
      img TEXT NOT NULL DEFAULT '',
      till INTEGER NOT NULL DEFAULT 1,
      server_ip TEXT NOT NULL DEFAULT '',
      pexels_api_key TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS media_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'upload',
      pexels_id INTEGER,
      photographer TEXT NOT NULL DEFAULT '',
      alt TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_number TEXT NOT NULL DEFAULT '',
      customer TEXT NOT NULL DEFAULT '0',
      customer_name TEXT NOT NULL DEFAULT '',
      status INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER NOT NULL DEFAULT 0,
      user_name TEXT NOT NULL DEFAULT '',
      till INTEGER NOT NULL DEFAULT 1,
      discount REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      paid REAL NOT NULL DEFAULT 0,
      change REAL NOT NULL DEFAULT 0,
      payment_type INTEGER NOT NULL DEFAULT 1,
      items_json TEXT NOT NULL DEFAULT '[]',
      date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_till ON transactions(till);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  `);

  migrateSchema();
  seedDefaults();
  persist();
  return db;
}

function migrateSchema() {
  const cols = db.prepare('PRAGMA table_info(settings)').all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('pexels_api_key')) {
    db.exec(`ALTER TABLE settings ADD COLUMN pexels_api_key TEXT NOT NULL DEFAULT ''`);
  }
}

function seedDefaults() {
  const admin = db.prepare('SELECT id FROM users WHERE id = 1').get();
  if (!admin) {
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare(
      `INSERT INTO users (id, username, password, fullname, perm_products, perm_categories, perm_transactions, perm_users, perm_settings)
       VALUES (1, 'admin', ?, 'Administrator', 1, 1, 1, 1, 1)`
    ).run(hash);
  }

  const settings = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!settings) {
    db.prepare(
      `INSERT INTO settings (id, app, store, symbol, percentage, charge_tax, till)
       VALUES (1, 'Standalone Point of Sale', 'My Store', '$', 0, 0, 1)`
    ).run();
  }

  const walkIn = db.prepare("SELECT id FROM customers WHERE name = 'Walk-in Customer'").get();
  if (!walkIn) {
    db.prepare(
      `INSERT INTO customers (name, phone, email, address) VALUES ('Walk-in Customer', '', '', '')`
    ).run();
  }
}

export function mapUser(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    username: row.username,
    fullname: row.fullname,
    perm_products: row.perm_products,
    perm_categories: row.perm_categories,
    perm_transactions: row.perm_transactions,
    perm_users: row.perm_users,
    perm_settings: row.perm_settings,
    status: row.status,
  };
}

export function mapProduct(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    price: row.price,
    category: row.category,
    quantity: row.quantity,
    stock: row.stock,
    img: row.img,
  };
}

export function mapCategory(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
  };
}

export function mapCustomer(row) {
  if (!row) return null;
  return {
    _id: String(row.id),
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
  };
}

export function mapTransaction(row) {
  if (!row) return null;
  let items = [];
  try {
    items = JSON.parse(row.items_json || '[]');
  } catch {
    items = [];
  }
  return {
    _id: row.id,
    id: row.id,
    ref_number: row.ref_number,
    customer: row.customer,
    customer_name: row.customer_name,
    status: row.status,
    user_id: row.user_id,
    user: row.user_name,
    till: row.till,
    discount: row.discount,
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
    paid: row.paid,
    change: row.change,
    payment_type: row.payment_type,
    items,
    date: row.date,
  };
}

export function mapSettings(row) {
  if (!row) return null;
  return {
    _id: 1,
    settings: {
      app: row.app,
      store: row.store,
      address_one: row.address_one,
      address_two: row.address_two,
      contact: row.contact,
      tax: row.tax,
      symbol: row.symbol,
      percentage: row.percentage,
      charge_tax: !!row.charge_tax,
      footer: row.footer,
      img: row.img,
      till: row.till,
      ip: row.server_ip,
      pexels_api_key: row.pexels_api_key || '',
    },
  };
}
