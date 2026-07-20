import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAnyPerm } from '../auth.js';

const router = Router();

const DEMO_CATEGORIES = ['Soft drinks', 'Snacks', 'Dairy', 'Bakery', 'Household'];

const DEMO_PRODUCTS = [
  { name: 'Coca-Cola 440ml', price: 18.99, category: 'Soft drinks', quantity: 48 },
  { name: 'Sprite 440ml', price: 17.99, category: 'Soft drinks', quantity: 36 },
  { name: 'Still water 500ml', price: 12.5, category: 'Soft drinks', quantity: 60 },
  { name: 'Simba chips 120g', price: 19.99, category: 'Snacks', quantity: 40 },
  { name: 'Nik Naks 55g', price: 9.99, category: 'Snacks', quantity: 50 },
  { name: 'Chocolate bar', price: 14.5, category: 'Snacks', quantity: 45 },
  { name: 'Milk 2L', price: 28.99, category: 'Dairy', quantity: 24 },
  { name: "Eggs 18's", price: 42.0, category: 'Dairy', quantity: 20 },
  { name: 'Cheddar cheese 250g', price: 49.99, category: 'Dairy', quantity: 15 },
  { name: 'White bread loaf', price: 17.99, category: 'Bakery', quantity: 30 },
  { name: 'Brown bread loaf', price: 19.99, category: 'Bakery', quantity: 24 },
  { name: 'Vetkoek (each)', price: 8.5, category: 'Bakery', quantity: 40 },
  { name: 'Dishwashing liquid 750ml', price: 34.99, category: 'Household', quantity: 18 },
  { name: 'Toilet soap bar', price: 15.5, category: 'Household', quantity: 32 },
  { name: 'Toilet paper 9s', price: 79.99, category: 'Household', quantity: 12 },
];

const DEMO_CUSTOMERS = [
  { name: 'Thabo Molefe', phone: '082 555 0101', email: 'thabo@example.com', address: 'Sandton' },
  { name: 'Aisha Khan', phone: '083 555 0202', email: 'aisha@example.com', address: 'Cape Town' },
  { name: 'Johan van Wyk', phone: '084 555 0303', email: 'johan@example.com', address: 'Pretoria' },
];

router.post('/seed', requireAnyPerm('perm_products', 'perm_settings'), (_req, res) => {
  const db = getDb();

  const result = db.transaction(() => {
    let categoriesAdded = 0;
    let productsAdded = 0;
    let customersAdded = 0;

    for (const name of DEMO_CATEGORIES) {
      const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
      if (!existing) {
        db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
        categoriesAdded += 1;
      }
    }

    const insertProduct = db.prepare(
      `INSERT INTO products (name, price, category, quantity, stock, img)
       VALUES (?, ?, ?, ?, 1, '')`
    );
    for (const p of DEMO_PRODUCTS) {
      const existing = db.prepare('SELECT id FROM products WHERE name = ?').get(p.name);
      if (!existing) {
        insertProduct.run(p.name, p.price, p.category, p.quantity);
        productsAdded += 1;
      }
    }

    const insertCustomer = db.prepare(
      `INSERT INTO customers (name, phone, email, address) VALUES (?, ?, ?, ?)`
    );
    for (const c of DEMO_CUSTOMERS) {
      const existing = db.prepare('SELECT id FROM customers WHERE name = ?').get(c.name);
      if (!existing) {
        insertCustomer.run(c.name, c.phone, c.email, c.address);
        customersAdded += 1;
      }
    }

    return { categoriesAdded, productsAdded, customersAdded };
  })();

  res.json({
    ok: true,
    ...result,
    message: `Added ${result.productsAdded} products, ${result.categoriesAdded} categories, ${result.customersAdded} customers`,
  });
});

router.post('/clear', requireAnyPerm('perm_products', 'perm_settings'), (req, res) => {
  const body = req.body || {};
  const clearProducts = body.products !== false;
  const clearCategories = body.categories !== false;
  const clearCustomers = body.customers !== false;
  const clearTransactions = body.transactions !== false;

  const db = getDb();
  const counts = db.transaction(() => {
    const out = {
      products: 0,
      categories: 0,
      customers: 0,
      transactions: 0,
    };

    if (clearTransactions) {
      const r = db.prepare('DELETE FROM transactions').run();
      out.transactions = r.changes || 0;
    }
    if (clearProducts) {
      const r = db.prepare('DELETE FROM products').run();
      out.products = r.changes || 0;
    }
    if (clearCategories) {
      const r = db.prepare('DELETE FROM categories').run();
      out.categories = r.changes || 0;
    }
    if (clearCustomers) {
      const r = db
        .prepare("DELETE FROM customers WHERE name != 'Walk-in Customer'")
        .run();
      out.customers = r.changes || 0;
    }

    return out;
  })();

  // sql.js wrapper may not expose changes reliably — recount deleted via before if needed
  res.json({
    ok: true,
    deleted: counts,
    message: 'Catalog and related demo data cleared',
  });
});

export default router;
