const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'store.json');
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '258871570592';

const defaultDB = {
  admin: { passwordHash: null },
  settings: {
    whatsappNumber: WHATSAPP_NUMBER,
    instagram: '',
    facebook: '',
    tiktok: '',
    slogan: 'Tecnologia, jogos e entretenimento ao melhor preço.',
    announcement: '',
    theme: 'red',
    wallpaper: ''
  },
  clients: [],
  orders: [],
  products: [
    {
      id: 1,
      title: 'Grand Theft Auto V',
      category: 'jogos',
      price: 500,
      platform: 'PC Digital',
      description: 'Jogo de ação em mundo aberto.',
      stock: 10,
      sold: 0,
      discount: 0,
      announcement: false,
      active: true
    },
    {
      id: 2,
      title: 'NBA 2K23',
      category: 'jogos',
      price: 600,
      platform: 'PC Digital',
      description: 'Simulação de basquetebol.',
      stock: 10,
      sold: 0,
      discount: 0,
      announcement: false,
      active: true
    },
    {
      id: 3,
      title: 'Avatar: O Caminho da Água',
      category: 'filmes',
      price: 150,
      platform: 'Full HD',
      description: 'Filme digital.',
      stock: 20,
      sold: 0,
      discount: 0,
      announcement: false,
      active: true
    },
    {
      id: 4,
      title: 'Stranger Things',
      category: 'series',
      price: 300,
      platform: 'Série Completa',
      description: 'Temporadas disponíveis.',
      stock: 20,
      sold: 0,
      discount: 0,
      announcement: false,
      active: true
    },
    {
      id: 5,
      title: 'Adobe Photoshop CC 2024',
      category: 'apps',
      price: 800,
      platform: 'Licença PC',
      description: 'Aplicação digital.',
      stock: 5,
      sold: 0,
      discount: 0,
      announcement: false,
      active: true
    }
  ]
};

function hashPassword(password) {
  return crypto.scryptSync(
    password,
    'we-tech-store-salt-2026',
    64
  ).toString('hex');
}


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

    const productsResult = await pool.query(`
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

    await pool.query(
      'DELETE FROM products'
    );

    for (const p of db.products) {
      await pool.query(
        `INSERT INTO products
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
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
          `INSERT INTO clients (id, data)
           VALUES ($1, $2)
           ON CONFLICT (id)
           DO UPDATE SET data = EXCLUDED.data`,
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
          `INSERT INTO orders (id, data)
           VALUES ($1, $2)
           ON CONFLICT (id)
           DO UPDATE SET data = EXCLUDED.data`,
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

function publicProduct(p) {
  const finalPrice = Math.max(
    0,
    Number(p.price) *
    (1 - Number(p.discount || 0) / 100)
  );

  return {
    ...p,
    price: Number(p.price),
    finalPrice,
    inStock: Number(p.stock) > 0
  };
}

function checkAdminAuth(req, res, next) {
  if (req.session?.isAdmin) return next();

  res.status(401).json({
    success: false,
    message: 'Não autorizado.'
  });
}

function checkClientAuth(req, res, next) {
  if (req.session?.clientId) return next();

  res.status(401).json({
    success: false,
    message: 'Faça login na sua conta.'
  });
}

function clientPublic(c) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone || '',
    createdAt: c.createdAt
  };
}


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

app.use(cors());

app.use(
  express.json({
    limit: '15mb'
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '15mb'
  })
);

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      'wetech_session_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

app.get('/api/config', (req, res) => {
  res.json(db.settings);
});

app.get('/api/products', (req, res) => {
  res.json(
    db.products
      .filter(p => p.active !== false)
      .map(publicProduct)
  );
});

app.post('/api/client/register', (req, res) => {
  const {
    name,
    email,
    phone,
    password
  } = req.body;

  if (
    !name?.trim() ||
    !email?.trim() ||
    !password ||
    password.length < 6
  ) {
    return res.status(400).json({
      success: false,
      message:
        'Preencha nome, email e uma palavra-passe com pelo menos 6 caracteres.'
    });
  }

  const normalized =
    email.trim().toLowerCase();

  if (
    db.clients.some(
      c => c.email === normalized
    )
  ) {
    return res.status(400).json({
      success: false,
      message: 'Email já registado.'
    });
  }

  const c = {
    id: Date.now(),
    name: name.trim(),
    email: normalized,
    phone: (phone || '').trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  db.clients.push(c);
  saveDB();

  req.session.clientId = c.id;

  res.json({
    success: true,
    client: clientPublic(c)
  });
});

app.post('/api/client/login', (req, res) => {
  const email =
    (req.body.email || '')
      .trim()
      .toLowerCase();

  const password =
    req.body.password || '';

  const c = db.clients.find(
    x =>
      x.email === email &&
      x.passwordHash ===
        hashPassword(password)
  );

  if (!c) {
    return res.status(401).json({
      success: false,
      message:
        'Email ou palavra-passe incorreta.'
    });
  }

  req.session.clientId = c.id;

  res.json({
    success: true,
    client: clientPublic(c)
  });
});

app.get('/api/client/me', (req, res) => {
  const c = db.clients.find(
    x =>
      x.id ===
      req.session?.clientId
  );

  if (!c) {
    return res.json({
      isAuthenticated: false
    });
  }

  res.json({
    isAuthenticated: true,
    client: clientPublic(c)
  });
});

app.post(
  '/api/client/logout',
  (req, res) => {
    delete req.session.clientId;

    res.json({
      success: true
    });
  }
);

app.get(
  '/api/client/orders',
  checkClientAuth,
  (req, res) => {
    res.json(
      db.orders.filter(
        o =>
          o.clientId ===
          req.session.clientId
      )
    );
  }
);

app.post(
  '/api/client/orders',
  checkClientAuth,
  (req, res) => {
    const {
      productId,
      paymentMethod,
      receiptData,
      quantity = 1
    } = req.body;

    const product =
      db.products.find(
        p =>
          p.id === Number(productId) &&
          p.active !== false
      );

    const qty = Math.max(
      1,
      Math.min(
        99,
        Number(quantity) || 1
      )
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          'Produto não encontrado.'
      });
    }

    if (product.stock < qty) {
      return res.status(400).json({
        success: false,
        message:
          'Stock insuficiente.'
      });
    }

    const c = db.clients.find(
      x =>
        x.id ===
        req.session.clientId
    );

    const unitPrice =
      Number(product.price) *
      (1 -
        Number(product.discount || 0) /
          100);

    const order = {
      id:
        'ORD-' +
        Date.now()
          .toString()
          .slice(-8),

      clientId: c.id,
      clientName: c.name,
      clientEmail: c.email,
      clientPhone: c.phone || '',

      productId: product.id,
      productName: product.title,
      quantity: qty,

      unitPrice,
      total: unitPrice * qty,

      paymentMethod:
        paymentMethod || 'M-Pesa',

      receiptData:
        receiptData || null,

      status:
        'Pendente de Verificação',

      date:
        new Date().toISOString()
    };

    product.stock -= qty;

    product.sold =
      (Number(product.sold) || 0) +
      qty;

    db.orders.unshift(order);

    saveDB();

    res.json({
      success: true,
      order
    });
  }
);

/* ADMIN */

app.post(
  '/api/admin/login',
  (req, res) => {
    if (
      (req.body.password || '') ===
        '' ||
      hashPassword(
        req.body.password
      ) !== db.admin.passwordHash
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Palavra-passe incorreta.'
      });
    }

    req.session.isAdmin = true;

    res.json({
      success: true
    });
  }
);

app.get(
  '/api/admin/check-auth',
  (req, res) => {
    res.json({
      isAuthenticated:
        !!req.session?.isAdmin
    });
  }
);

app.post(
  '/api/admin/change-password',
  checkAdminAuth,
  (req, res) => {
    const p =
      req.body.newPassword || '';

    if (p.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          'Use pelo menos 6 caracteres.'
      });
    }

    db.admin.passwordHash =
      hashPassword(p);

    saveDB();

    res.json({
      success: true
    });
  }
);

app.post(
  '/api/admin/logout',
  (req, res) => {
    delete req.session.isAdmin;

    res.json({
      success: true
    });
  }
);

app.get(
  '/api/admin/dashboard',
  checkAdminAuth,
  (req, res) => {
    const revenue =
      db.orders
        .filter(
          o =>
            o.status ===
            'Aprovada'
        )
        .reduce(
          (s, o) =>
            s + Number(o.total || 0),
          0
        );

    const pending =
      db.orders.filter(
        o =>
          o.status ===
          'Pendente de Verificação'
      ).length;

    res.json({
      clients:
        db.clients.length,

      products:
        db.products.filter(
          p =>
            p.active !== false
        ).length,

      orders:
        db.orders.length,

      pending,
      revenue,

      stock:
        db.products.reduce(
          (s, p) =>
            s +
            Number(p.stock || 0),
          0
        ),

      sold:
        db.products.reduce(
          (s, p) =>
            s +
            Number(p.sold || 0),
          0
        )
    });
  }
);

app.get(
  '/api/admin/clients',
  checkAdminAuth,
  (req, res) => {
    res.json(
      db.clients.map(clientPublic)
    );
  }
);

app.get(
  '/api/admin/orders',
  checkAdminAuth,
  (req, res) => {
    res.json(db.orders);
  }
);

app.post(
  '/api/admin/orders/status',
  checkAdminAuth,
  (req, res) => {
    const o =
      db.orders.find(
        x =>
          x.id ===
          req.body.orderId
      );

    if (!o) {
      return res.status(404).json({
        success: false,
        message:
          'Encomenda não encontrada.'
      });
    }

    const allowed = [
      'Pendente de Verificação',
      'Aprovada',
      'Rejeitada',
      'Concluída'
    ];

    if (
      !allowed.includes(
        req.body.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Estado inválido.'
      });
    }

    const previous =
      o.status;

    const next =
      req.body.status;

    if (
      previous !== 'Rejeitada' &&
      next === 'Rejeitada'
    ) {
      const p =
        db.products.find(
          x =>
            x.id ===
            o.productId
        );

      if (p) {
        p.stock =
          Number(p.stock || 0) +
          Number(
            o.quantity || 0
          );

        p.sold =
          Math.max(
            0,
            Number(p.sold || 0) -
              Number(
                o.quantity || 0
              )
          );
      }
    } else if (
      previous === 'Rejeitada' &&
      next !== 'Rejeitada'
    ) {
      const p =
        db.products.find(
          x =>
            x.id ===
            o.productId
        );

      if (
        !p ||
        Number(p.stock || 0) <
          Number(
            o.quantity || 0
          )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Stock insuficiente para reativar esta encomenda.'
        });
      }

      p.stock -= Number(
        o.quantity || 0
      );

      p.sold =
        Number(p.sold || 0) +
        Number(
          o.quantity || 0
        );
    }

    o.status = next;

    saveDB();

    res.json({
      success: true,
      order: o
    });
  }
);

app.get(
  '/api/admin/products',
  checkAdminAuth,
  (req, res) => {
    res.json(db.products);
  }
);

app.post(
  '/api/admin/products',
  checkAdminAuth,
  (req, res) => {
    const {
      title,
      category,
      price,
      platform,
      description,
      stock,
      discount,
      announcement
    } = req.body;

    if (
      !title ||
      !category ||
      !Number.isFinite(
        Number(price)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Nome, categoria e preço são obrigatórios.'
      });
    }

    const p = {
      id: Date.now(),
      title: title.trim(),
      category,
      price: Number(price),
      platform:
        platform || 'Digital',
      description:
        description || '',
      stock: Math.max(
        0,
        Number(stock) || 0
      ),
      sold: 0,
      discount: Math.max(
        0,
        Math.min(
          100,
          Number(discount) || 0
        )
      ),
      announcement:
        !!announcement,
      active: true
    };

    db.products.unshift(p);

    saveDB();

    res.json({
      success: true,
      product: p
    });
  }
);

app.put(
  '/api/admin/products/:id',
  checkAdminAuth,
  (req, res) => {
    const p =
      db.products.find(
        x =>
          x.id ===
          Number(
            req.params.id
          )
      );

    if (!p) {
      return res.status(404).json({
        success: false,
        message:
          'Produto não encontrado.'
      });
    }

    const b = req.body;

    if (
      b.title !== undefined
    ) {
      p.title =
        String(
          b.title
        ).trim();
    }

    if (
      b.category !== undefined
    ) {
      p.category =
        b.category;
    }

    if (
      b.price !== undefined
    ) {
      p.price =
        Math.max(
          0,
          Number(b.price) || 0
        );
    }

    if (
      b.platform !== undefined
    ) {
      p.platform =
        String(b.platform);
    }

    if (
      b.description !== undefined
    ) {
      p.description =
        String(
          b.description
        );
    }

    if (
      b.stock !== undefined
    ) {
      p.stock =
        Math.max(
          0,
          Number(b.stock) || 0
        );
    }

    if (
      b.discount !== undefined
    ) {
      p.discount =
        Math.max(
          0,
          Math.min(
            100,
            Number(b.discount) || 0
          )
        );
    }

    if (
      b.announcement !== undefined
    ) {
      p.announcement =
        !!b.announcement;
    }

    if (
      b.active !== undefined
    ) {
      p.active =
        !!b.active;
    }

    saveDB();

    res.json({
      success: true,
      product: p
    });
  }
);

app.delete(
  '/api/admin/products/:id',
  checkAdminAuth,
  (req, res) => {
    const p =
      db.products.find(
        x =>
          x.id ===
          Number(
            req.params.id
          )
      );

    if (!p) {
      return res.status(404).json({
        success: false,
        message:
          'Produto não encontrado.'
      });
    }

    p.active = false;

    saveDB();

    res.json({
      success: true
    });
  }
);

app.put(
  '/api/admin/settings',
  checkAdminAuth,
  (req, res) => {
    const allowed = [
      'whatsappNumber',
      'instagram',
      'facebook',
      'tiktok',
      'slogan',
      'announcement',
      'theme',
      'wallpaper'
    ];

    allowed.forEach(k => {
      if (
        req.body[k] !== undefined
      ) {
        db.settings[k] =
          String(
            req.body[k]
          );
      }
    });

    saveDB();

    res.json({
      success: true,
      settings:
        db.settings
    });
  }
);

app.get(
  '/admin',
  (req, res) =>
    res.sendFile(
      path.join(
        __dirname,
        'public',
        'admin.html'
      )
    )
);

app.get(
  '*',
  (req, res) =>
    res.sendFile(
      path.join(
        __dirname,
        'public',
        'index.html'
      )
    )
);

app.listen(
  PORT,
  () =>
    console.log(
      `WE Tech Store: http://localhost:${PORT}`
    )
);