const fs = require('fs');

const file = 'server.js';
const backup = 'server-before-postgres.js';

const original = fs.readFileSync(file, 'utf8');

fs.writeFileSync(backup, original, 'utf8');

const start = original.indexOf('function loadDB() {');
const marker = 'function publicProduct(p) {';
const end = original.indexOf(marker);

if (start === -1 || end === -1) {
  console.error('ERRO: não encontrei loadDB/saveDB.');
  process.exit(1);
}

const replacement = `
async function loadDBFromPostgres() {
  const localDB = {
    ...defaultDB,
    settings: {
      ...defaultDB.settings
    },
    clients: [],
    orders: [],
    products: []
  };

  try {
    const appResult = await pool.query(
      'SELECT data FROM app_data WHERE id = 1'
    );

    if (appResult.rows.length > 0) {
      const data = appResult.rows[0].data || {};

      localDB.admin = {
        ...localDB.admin,
        ...(data.admin || {})
      };

      localDB.settings = {
        ...localDB.settings,
        ...(data.settings || {})
      };
    }

    const productsResult = await pool.query(\`
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
    \`);

    localDB.products = productsResult.rows.map(p => ({
      id: Number(p.id),
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

    const clientsResult = await pool.query(
      'SELECT data FROM clients'
    );

    localDB.clients =
      clientsResult.rows.map(row => row.data);

    const ordersResult = await pool.query(
      'SELECT data FROM orders'
    );

    localDB.orders =
      ordersResult.rows.map(row => row.data);

    console.log(
      'PostgreSQL carregado:',
      localDB.products.length,
      'produtos,',
      localDB.clients.length,
      'clientes,',
      localDB.orders.length,
      'pedidos'
    );

    return localDB;

  } catch (error) {
    console.error(
      'ERRO AO CARREGAR PostgreSQL:',
      error.message
    );

    console.error(
      'O servidor vai usar o store.json como fallback.'
    );

    try {
      const local = JSON.parse(
        fs.readFileSync(DB_FILE, 'utf8')
      );

      return {
        ...defaultDB,
        ...local,
        settings: {
          ...defaultDB.settings,
          ...(local.settings || {})
        },
        clients: local.clients || [],
        orders: local.orders || [],
        products: local.products || []
      };
    } catch {
      return localDB;
    }
  }
}

async function saveDB() {
  try {
    await pool.query(
      \`INSERT INTO app_data (id, data)
       VALUES (1, $1)
       ON CONFLICT (id)
       DO UPDATE SET data = EXCLUDED.data\`,
      [
        JSON.stringify({
          admin: db.admin,
          settings: db.settings
        })
      ]
    );

    await pool.query(
      'DELETE FROM products'
    );

    for (const p of db.products) {
      await pool.query(
        \`INSERT INTO products
        (
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
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)\`,
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
          p.active !== false
        ]
      );
    }

    await pool.query(
      'DELETE FROM clients'
    );

    for (const c of db.clients) {
      if (c.id !== undefined && c.id !== null) {
        await pool.query(
          \`INSERT INTO clients (id, data)
           VALUES ($1, $2)
           ON CONFLICT (id)
           DO UPDATE SET data = EXCLUDED.data\`,
          [
            String(c.id),
            JSON.stringify(c)
          ]
        );
      }
    }

    await pool.query(
      'DELETE FROM orders'
    );

    for (const o of db.orders) {
      if (o.id !== undefined && o.id !== null) {
        await pool.query(
          \`INSERT INTO orders (id, data)
           VALUES ($1, $2)
           ON CONFLICT (id)
           DO UPDATE SET data = EXCLUDED.data\`,
          [
            String(o.id),
            JSON.stringify(o)
          ]
        );
      }
    }

    console.log('Dados guardados no PostgreSQL.');

  } catch (error) {
    console.error(
      'ERRO AO GUARDAR NO PostgreSQL:',
      error.message
    );
  }
}

let db = null;

const dbReady = loadDBFromPostgres().then(
  loadedDB => {
    db = loadedDB;

    if (!db.admin.passwordHash) {
      db.admin.passwordHash = hashPassword(
        process.env.ADMIN_PASSWORD ||
        'wetech2026'
      );

      return saveDB();
    }
  }
);

`;

let updated =
  original.substring(0, start) +
  replacement +
  original.substring(end);

const middleware = `
app.use(async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch (error) {
    console.error(
      'Erro ao inicializar banco:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Erro ao inicializar banco de dados.'
    });
  }
});

`;

const middlewarePosition =
  updated.indexOf('app.use(cors());');

if (middlewarePosition === -1) {
  console.error(
    'ERRO: não encontrei app.use(cors()).'
  );
  process.exit(1);
}

updated =
  updated.substring(0, middlewarePosition) +
  middleware +
  updated.substring(middlewarePosition);

fs.writeFileSync(
  file,
  updated,
  'utf8'
);

console.log('');
console.log('======================================');
console.log('SERVER.JS ATUALIZADO COM POSTGRESQL');
console.log('======================================');
console.log('');
console.log('Backup criado: ' + backup);
console.log('');