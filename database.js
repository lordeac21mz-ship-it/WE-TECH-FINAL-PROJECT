const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

async function loadDatabase() {
  const db = {
    admin: { passwordHash: null },
    settings: {},
    clients: [],
    orders: [],
    products: []
  };

  const app = await pool.query(
    'SELECT data FROM app_data WHERE id = 1'
  );

  if (app.rows.length) {
    const data = app.rows[0].data || {};

    db.admin = data.admin || db.admin;
    db.settings = data.settings || {};
  }

  const products = await pool.query(`
    SELECT
      id,
      title,
      category,
      price,
      platform,
      description,
      stock,
      sold,
      discount,
      announcement,
      active
    FROM products
    ORDER BY id ASC
  `);

  db.products = products.rows.map(p => ({
    id: p.id,
    title: p.title,
    category: p.category,
    price: Number(p.price),
    platform: p.platform,
    description: p.description,
    stock: Number(p.stock || 0),
    sold: Number(p.sold || 0),
    discount: Number(p.discount || 0),
    announcement: Boolean(p.announcement),
    active: Boolean(p.active)
  }));

  const clients = await pool.query(
    'SELECT data FROM clients'
  );

  db.clients = clients.rows.map(row => row.data);

  const orders = await pool.query(
    'SELECT data FROM orders ORDER BY id'
  );

  db.orders = orders.rows.map(row => row.data);

  return db;
}

async function saveDatabase(db) {
  await pool.query(
    `INSERT INTO app_data (id, data)
     VALUES (1, $1)
     ON CONFLICT (id)
     DO UPDATE SET data = EXCLUDED.data`,
    [
      JSON.stringify({
        admin: db.admin,
        settings: db.settings
      })
    ]
  );

  await pool.query('DELETE FROM products');

  for (const p of db.products) {
    await pool.query(
      `INSERT INTO products
      (id, title, category, price, platform, description,
       stock, sold, discount, announcement, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        p.id,
        p.title,
        p.category,
        p.price,
        p.platform,
        p.description,
        p.stock || 0,
        p.sold || 0,
        p.discount || 0,
        p.announcement || false,
        p.active || false
      ]
    );
  }

  await pool.query('DELETE FROM clients');

  for (const c of db.clients) {
    if (c.id !== undefined && c.id !== null) {
      await pool.query(
        `INSERT INTO clients (id, data)
         VALUES ($1, $2)
         ON CONFLICT (id)
         DO UPDATE SET data = EXCLUDED.data`,
        [String(c.id), JSON.stringify(c)]
      );
    }
  }

  await pool.query('DELETE FROM orders');

  for (const o of db.orders) {
    if (o.id !== undefined && o.id !== null) {
      await pool.query(
        `INSERT INTO orders (id, data)
         VALUES ($1, $2)
         ON CONFLICT (id)
         DO UPDATE SET data = EXCLUDED.data`,
        [String(o.id), JSON.stringify(o)]
      );
    }
  }
}

module.exports = {
  pool,
  loadDatabase,
  saveDatabase
};