import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('expenses.db');

export function initDb() {
    // Categories
    db.execSync(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL
    );
  `);

    // Expenses (receipts)
    db.execSync(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      date TEXT NOT NULL,              -- YYYY-MM-DD
      store_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      payment_type TEXT NOT NULL DEFAULT '',
      category_id TEXT,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

    // Products
    db.execSync(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      general_name TEXT NOT NULL DEFAULT '',
      specific_name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT ''
    );
  `);

    // Ensure we don't duplicate products (brand + specific name)
    db.execSync(`
    CREATE UNIQUE INDEX IF NOT EXISTS products_company_specific_unique
    ON products(company_name, specific_name);
  `);

    // Receipt items
    db.execSync(`
    CREATE TABLE IF NOT EXISTS receipt_items (
      id TEXT PRIMARY KEY NOT NULL,
      expense_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);
}

export function qAll(sql, params = []) {
    return db.getAllSync(sql, params);
}

export function qOne(sql, params = []) {
    return db.getFirstSync(sql, params);
}

export function run(sql, params = []) {
    return db.runSync(sql, params);
}

// simple id generator (good enough for local)
export function uid() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function norm(s) {
    return String(s ?? '').trim().replace(/\s+/g, ' ');
}
