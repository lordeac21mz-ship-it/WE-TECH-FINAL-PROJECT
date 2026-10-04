const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const store = JSON.parse(
    fs.readFileSync('./data/store.json', 'utf8')
  );

  console.log('Criando tabelas...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      title TEXT,
      category TEXT,
      price NUMERIC,
      platform TEXT,
      description TEXT,
      stock INTEGER DEFAULT 0,
      sold INTEGER DEFAULT 0,
      discount NUMERIC DEFAULT 0,
      announcement BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
  `);

  console.log('Tabelas criadas.');

  await pool.query(
    `INSERT INTO app_data (id, data)
     VALUES (1, $1)
     ON CONFLICT (id)
     DO UPDATE SET data = EXCLUDED.data`,
    [JSON.stringify({
      admin: store.admin,
      settings: store.settings
    })]
  );

  for (const product of store.products || []) {
    await pool.query(
      `INSERT INTO products
       (id, title, category, price, platform, description,
        stock, sold, discount, announcement, active)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
        title=EXCLUDED.title,
        category=EXCLUDED.category,
        price=EXCLUDED.price,
        platform=EXCLUDED.platform,
        description=EXCLUDED.description,
        stock=EXCLUDED.stock,
        sold=EXCLUDED.sold,
        discount=EXCLUDED.discount,
        announcement=EXCLUDED.announcement,
        active=EXCLUDED.active`,
      [
        product.id,
        product.title,
        product.category,
        product.price,
        product.platform,
        product.description,
        product.stock || 0,
        product.sold || 0,
        product.discount || 0,
        product.announcement || false,
        product.active || false
      ]
    );
  }

  for (const client of store.clients || []) {
    if (client.id) {
      await pool.query(
        `INSERT INTO clients (id, data)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [String(client.id), JSON.stringify(client)]
      );
    }
  }

  for (const order of store.orders || []) {
    if (order.id) {
      await pool.query(
        `INSERT INTO orders (id, data)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [String(order.id), JSON.stringify(order)]
      );
    }
  }

  console.log('Migração concluída!');
  console.log(`Produtos migrados: ${store.products?.length || 0}`);
  console.log(`Clientes migrados: ${store.clients?.length || 0}`);
  console.log(`Pedidos migrados: ${store.orders?.length || 0}`);

  await pool.end();
}

migrate().catch(async error => {
  console.error('ERRO NA MIGRAÇÃO:', error);
  await pool.end();
  process.exit(1);
});