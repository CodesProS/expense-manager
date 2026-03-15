import { initDb, qAll, qOne, run, uid, norm } from './db';

// call once on app start
export function bootLocalStore() {
    initDb();

    // seed default categories if empty
    const existing = qAll(`SELECT * FROM categories LIMIT 1`);
    if (existing.length === 0) {
        const defaults = [
            { name: 'Groceries', color: '#2ECC71', icon: 'local-grocery-store' },
            { name: 'Food', color: '#FF6B4A', icon: 'restaurant' },
            { name: 'Transport', color: '#6C5CE7', icon: 'local-gas-station' },
            { name: 'Shopping', color: '#999999', icon: 'shopping-cart' },
        ];
        for (const c of defaults) {
            run(
                `INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)`,
                [uid(), c.name, c.color, c.icon]
            );
        }
    }
}

export function loadCategories() {
    return qAll(`SELECT * FROM categories ORDER BY name`);
}

export function createCategory({ name, color, icon }) {
    const id = uid();
    run(`INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)`, [
        id,
        norm(name),
        norm(color),
        norm(icon),
    ]);
    return id;
}

export function loadExpenses() {
    // join category info like your supabase select('*, categories(...)')
    return qAll(`
    SELECT
      e.*,
      c.name as cat_name,
      c.icon as cat_icon,
      c.color as cat_color
    FROM expenses e
    LEFT JOIN categories c ON c.id = e.category_id
    ORDER BY e.date DESC
  `).map((row) => ({
        ...row,
        categories: row.category_id
            ? { name: row.cat_name, icon: row.cat_icon, color: row.cat_color }
            : null,
    }));
}

export function loadExpenseDetail(expenseId) {
    return qAll(`
    SELECT
      ri.id,
      ri.quantity,
      ri.unit_price,
      ri.total_price,
      p.general_name,
      p.specific_name,
      p.company_name
    FROM receipt_items ri
    JOIN products p ON p.id = ri.product_id
    WHERE ri.expense_id = ?
    ORDER BY ri.id ASC
  `, [expenseId]).map((r) => ({
        id: r.id,
        quantity: r.quantity,
        unit_price: r.unit_price,
        total_price: r.total_price,
        products: {
            general_name: r.general_name,
            specific_name: r.specific_name,
            company_name: r.company_name,
        },
    }));
}

export function saveReceiptLocal(scannedData) {
    // 1) Insert expense
    const expenseId = uid();
    run(
        `INSERT INTO expenses (id, date, store_name, amount, currency, payment_type, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            expenseId,
            norm(scannedData.date),
            norm(scannedData.store_name),
            Number(scannedData.amount || 0),
            norm(scannedData.currency || 'USD'),
            norm(scannedData.payment_type || ''),
            scannedData.category_id || null,
        ]
    );

    // 2) For each item: upsert product, insert receipt_item
    for (const it of scannedData.items || []) {
        const specific = norm(it.specific_name || it.general_name || 'Item');
        const general = norm(it.general_name || specific);
        const company = norm(it.company_name || '');

        // try existing product by unique key
        let product = qOne(
            `SELECT id FROM products WHERE company_name = ? AND specific_name = ?`,
            [company, specific]
        );

        let productId = product?.id;
        if (!productId) {
            productId = uid();
            run(
                `INSERT INTO products (id, general_name, specific_name, company_name)
         VALUES (?, ?, ?, ?)`,
                [productId, general, specific, company]
            );
        }

        const qty = Number(it.quantity || 1);
        const unit = Number(it.unit_price || 0);
        const total = Number(it.total_price || qty * unit || 0);

        run(
            `INSERT INTO receipt_items (id, expense_id, product_id, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [uid(), expenseId, productId, qty, unit, total]
        );
    }

    return expenseId;
}
