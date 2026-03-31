require('dotenv').config();
const express = require('express');
const { createClient } = require('@libsql/client');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── TURSO DB CLIENT ───────────────────────────────────────────────────────────
const db = createClient({
  url:       process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_TOKEN,
});

// Helper: run SELECT → returns array of rows
async function all(sql, args = []) {
  const res = await db.execute({ sql, args });
  return res.rows;
}
// Helper: run INSERT/UPDATE/DELETE → returns result info
async function run(sql, args = []) {
  return await db.execute({ sql, args });
}
// Helper: SELECT expecting one row
async function get(sql, args = []) {
  const res = await db.execute({ sql, args });
  return res.rows[0] ?? null;
}

// ── SCHEMA INIT ───────────────────────────────────────────────────────────────
async function initDB() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS categories (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name        TEXT NOT NULL,
      stock       INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type       TEXT NOT NULL CHECK(type IN ('ADD','SELL')),
      quantity   INTEGER NOT NULL,
      sale_type  TEXT CHECK(sale_type IN ('CENTER','RETAIL')),
      note       TEXT,
      date       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin','staff')),
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed categories if empty
  const { rows: cats } = await db.execute('SELECT COUNT(*) AS n FROM categories');
  if (Number(cats[0].n) === 0) {
    const catNames = [
      'Formula 1 500g','Formula 1 750g','Personalized Protein','ShakeMate',
      'Afresh','Dino Shake','Digestive Health','Bone & Joint Health',
      'Sport Nutrition','Enhancers','Heart Health','Skin Care','Vriti Life',
      'Eye Health',"Men's Health","Women's Health",'Sleep Support'
    ];
    for (const c of catNames)
      await run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [c]);

    const products = [
      ['Formula 1 500g',['Vanilla','Kulfi','Chocolate','Banana','Mango','Orange','Rose Kheer','Strawberry','Paan']],
      ['Formula 1 750g',['Vanilla','Kulfi','Mango','Rose Kheer']],
      ['Personalized Protein',['400g','200g']],
      ['ShakeMate',['500g']],
      ['Afresh',['Lemon','Ginger','Kashmir Kawa','Peach','Cinnamon','Tulasi','Elaichi']],
      ['Dino Shake',['Chocolate','Strawberry']],
      ['Digestive Health',['Aloe Plus','Active Fiber Complex','Aloe Concentrate','Activated Fiber','Simply Probiotic']],
      ['Bone & Joint Health',['Joint Support','Calcium']],
      ['Sport Nutrition',['H24 Hydrate','H24 Rebuild Strength','Lift Off']],
      ['Enhancers',['Multi Vitamin','Cell Activator','Cell-U-Loss','Herbal Control']],
      ['Heart Health',['Nite Works','Beta Heart','Herba Life Line Omega 3']],
      ['Skin Care',['Skin Booster Sachets','Skin Booster Canister','Facial Cleanser','Facial Toner','Facial Serum','Moisturizer']],
      ['Vriti Life',['Brain Health','Triphala','Immune Health']],
      ['Eye Health',['Ocular Defense']],
      ["Men's Health",['Male Factor']],
      ["Women's Health",["Woman's Choice"]],
      ['Sleep Support',['Sleep Enhance']],
    ];
    for (const [cat, names] of products)
      for (const n of names)
        await run(
          'INSERT OR IGNORE INTO products (category_id,name) VALUES ((SELECT id FROM categories WHERE name=?),?)',
          [cat, n]
        );

    // Default users
    await run('INSERT OR IGNORE INTO users (name,email,password,role) VALUES (?,?,?,?)',
      ['Admin','admin@nag.com', bcrypt.hashSync('admin123',10),'admin']);
    await run('INSERT OR IGNORE INTO users (name,email,password,role) VALUES (?,?,?,?)',
      ['Staff','staff@nag.com', bcrypt.hashSync('staff123',10),'staff']);
    console.log('  🌱  Database seeded.');
  }
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const user = await get('SELECT * FROM users WHERE email=? AND active=1', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '8h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, (req, res) => res.json(req.user));

app.post('/api/auth/change-password', auth, async (req, res) => {
  const { current, newPass } = req.body;
  if (!current || !newPass || newPass.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  try {
    const user = await get('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!await bcrypt.compare(current, user.password))
      return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPass, 10);
    await run('UPDATE users SET password=? WHERE id=?', [hash, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── USER MANAGEMENT ───────────────────────────────────────────────────────────
app.get('/api/users', auth, adminOnly, async (req, res) => {
  try { res.json(await all('SELECT id,name,email,role,active,created_at FROM users ORDER BY id')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await run('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)', [name, email, hash, role || 'staff']);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  const { name, role, active } = req.body;
  try {
    await run('UPDATE users SET name=?,role=?,active=? WHERE id=?', [name, role, active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  if (req.params.id == req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    await run('UPDATE users SET active=0 WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CATEGORIES ────────────────────────────────────────────────────────────────
app.get('/api/categories', auth, async (req, res) => {
  try { res.json(await all('SELECT * FROM categories ORDER BY name')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categories', auth, adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name required' });
  try {
    await run('INSERT INTO categories (name) VALUES (?)', [name.trim()]);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: e.message });
  }
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
app.get('/api/products', auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT p.id, c.name AS category, p.name, p.stock
       FROM products p JOIN categories c ON p.category_id=c.id ORDER BY c.name, p.name`
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', auth, adminOnly, async (req, res) => {
  const { name, category_id, initial_stock } = req.body;
  if (!name || !category_id) return res.status(400).json({ error: 'Product name and category are required' });
  const trimmed = name.trim();
  if (!trimmed) return res.status(400).json({ error: 'Product name cannot be blank' });
  const stock = Math.max(0, parseInt(initial_stock) || 0);
  try {
    const cat = await get('SELECT id FROM categories WHERE id=?', [category_id]);
    if (!cat) return res.status(400).json({ error: 'Invalid category' });
    const existing = await get('SELECT id FROM products WHERE name=? AND category_id=?', [trimmed, category_id]);
    if (existing) return res.status(400).json({ error: 'A product with this name already exists in that category' });
    const result = await run('INSERT INTO products (category_id,name,stock) VALUES (?,?,?)', [category_id, trimmed, stock]);
    const newId = Number(result.lastInsertRowid);
    if (stock > 0) {
      const today = new Date().toISOString().slice(0, 10);
      await run('INSERT INTO transactions (product_id,type,quantity,note,date) VALUES (?,?,?,?,?)',
        [newId, 'ADD', stock, 'Initial stock', today]);
    }
    const product = await get(
      `SELECT p.id,c.name AS category,p.name,p.stock FROM products p
       JOIN categories c ON p.category_id=c.id WHERE p.id=?`, [newId]);
    res.json({ success: true, product });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADD STOCK ─────────────────────────────────────────────────────────────────
app.post('/api/stock/add', auth, async (req, res) => {
  const { product_id, quantity, note, date } = req.body;
  if (!product_id || !quantity || quantity < 1) return res.status(400).json({ error: 'Invalid input' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    await run('UPDATE products SET stock=stock+? WHERE id=?', [quantity, product_id]);
    await run('INSERT INTO transactions (product_id,type,quantity,note,date) VALUES (?,?,?,?,?)',
      [product_id, 'ADD', quantity, note || null, date || today]);
    const product = await get(
      `SELECT p.id,c.name AS category,p.name,p.stock FROM products p
       JOIN categories c ON p.category_id=c.id WHERE p.id=?`, [product_id]);
    res.json({ success: true, product });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SELL STOCK ────────────────────────────────────────────────────────────────
app.post('/api/stock/sell', auth, async (req, res) => {
  const { product_id, quantity, sale_type, note, date } = req.body;
  if (!product_id || !quantity || quantity < 1) return res.status(400).json({ error: 'Invalid input' });
  try {
    const product = await get('SELECT * FROM products WHERE id=?', [product_id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (Number(product.stock) < quantity)
      return res.status(400).json({ error: `Insufficient stock. Available: ${product.stock}` });
    const today = new Date().toISOString().slice(0, 10);
    await run('UPDATE products SET stock=stock-? WHERE id=?', [quantity, product_id]);
    await run('INSERT INTO transactions (product_id,type,quantity,sale_type,note,date) VALUES (?,?,?,?,?,?)',
      [product_id, 'SELL', quantity, sale_type || null, note || null, date || today]);
    const updated = await get(
      `SELECT p.id,c.name AS category,p.name,p.stock FROM products p
       JOIN categories c ON p.category_id=c.id WHERE p.id=?`, [product_id]);
    res.json({ success: true, product: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────
app.get('/api/transactions', auth, async (req, res) => {
  const { product_id, type, from, to, limit = 150 } = req.query;
  let sql = `SELECT t.*,p.name,c.name AS category FROM transactions t
    JOIN products p ON t.product_id=p.id JOIN categories c ON p.category_id=c.id WHERE 1=1`;
  const args = [];
  if (product_id) { sql += ' AND t.product_id=?'; args.push(product_id); }
  if (type)       { sql += ' AND t.type=?';       args.push(type); }
  if (from)       { sql += ' AND t.date>=?';      args.push(from); }
  if (to)         { sql += ' AND t.date<=?';      args.push(to); }
  sql += ' ORDER BY t.created_at DESC LIMIT ?'; args.push(Number(limit));
  try { res.json(await all(sql, args)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { totalProducts } = await get('SELECT COUNT(*) AS totalProducts FROM products');
    const { totalStock }    = await get('SELECT COALESCE(SUM(stock),0) AS totalStock FROM products');
    const { lowStock }      = await get('SELECT COUNT(*) AS lowStock FROM products WHERE stock>0 AND stock<=5');
    const { outOfStock }    = await get('SELECT COUNT(*) AS outOfStock FROM products WHERE stock=0');
    const { todayAdded }    = await get("SELECT COALESCE(SUM(quantity),0) AS todayAdded FROM transactions WHERE type='ADD' AND date=?", [today]);
    const { todaySold }     = await get("SELECT COALESCE(SUM(quantity),0) AS todaySold FROM transactions WHERE type='SELL' AND date=?", [today]);
    const recentTx = await all(
      `SELECT t.*,p.name,c.name AS category FROM transactions t
       JOIN products p ON t.product_id=p.id JOIN categories c ON p.category_id=c.id
       ORDER BY t.created_at DESC LIMIT 8`
    );
    const categoryStock = await all(
      `SELECT c.name AS category,COALESCE(SUM(p.stock),0) AS total
       FROM categories c LEFT JOIN products p ON p.category_id=c.id
       GROUP BY c.id,c.name ORDER BY total DESC`
    );
    res.json({ totalProducts, totalStock, lowStock, outOfStock, todayAdded, todaySold, recentTx, categoryStock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LOW STOCK ─────────────────────────────────────────────────────────────────
app.get('/api/products/low-stock', auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT p.id,c.name AS category,p.name,p.stock
       FROM products p JOIN categories c ON p.category_id=c.id
       WHERE p.stock<=5 ORDER BY p.stock ASC,c.name,p.name`
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    await initDB();
    console.log(`\n  ✅  Turso connected!\n  🌐  http://localhost:${PORT}\n`);
  } catch (e) {
    console.error('  ❌  DB init error:', e.message);
  }
});
