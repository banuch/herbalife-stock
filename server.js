require('dotenv').config();
const express  = require('express');
const Database = require('better-sqlite3');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');
const fs       = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── SQLITE DB ─────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'herbalife.db');
const dbNew = !fs.existsSync(DB_PATH);
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Helper: run SELECT → returns array of rows
const all  = (sql, p = []) => sqlite.prepare(sql).all(...p);
// Helper: run INSERT/UPDATE/DELETE → returns info object
const run  = (sql, p = []) => sqlite.prepare(sql).run(...p);
// Helper: run SELECT expecting one row
const get  = (sql, p = []) => sqlite.prepare(sql).get(...p);

// ── SCHEMA ────────────────────────────────────────────────────────────────────
sqlite.exec(`
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

// ── SEED DATA (only on first run) ─────────────────────────────────────────────
if (dbNew) {
  const cats = [
    'Formula 1 500g','Formula 1 750g','Personalized Protein','ShakeMate',
    'Afresh','Dino Shake','Digestive Health','Bone & Joint Health',
    'Sport Nutrition','Enhancers','Heart Health','Skin Care','Vriti Life',
    'Eye Health',"Men's Health","Women's Health",'Sleep Support'
  ];
  const insertCat = sqlite.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  cats.forEach(c => insertCat.run(c));

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
  const insertProd = sqlite.prepare(
    'INSERT OR IGNORE INTO products (category_id, name) VALUES ((SELECT id FROM categories WHERE name=?), ?)'
  );
  products.forEach(([cat, names]) => names.forEach(n => insertProd.run(cat, n)));

  // Default admin & staff accounts
  const insertUser = sqlite.prepare('INSERT OR IGNORE INTO users (name,email,password,role) VALUES (?,?,?,?)');
  insertUser.run('Admin', 'admin@nag.com', bcrypt.hashSync('admin123', 10), 'admin');
  insertUser.run('Staff', 'staff@nag.com', bcrypt.hashSync('staff123', 10), 'staff');
  console.log('  🌱  Database seeded with products and default users.');
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
    const user = get('SELECT * FROM users WHERE email=? AND active=1', [email]);
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
    const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!await bcrypt.compare(current, user.password))
      return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPass, 10);
    run('UPDATE users SET password=? WHERE id=?', [hash, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── USER MANAGEMENT (admin only) ──────────────────────────────────────────────
app.get('/api/users', auth, adminOnly, (req, res) => {
  try { res.json(all('SELECT id,name,email,role,active,created_at FROM users ORDER BY id')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    run('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)', [name, email, hash, role || 'staff']);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const { name, role, active } = req.body;
  try {
    run('UPDATE users SET name=?,role=?,active=? WHERE id=?', [name, role, active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  if (req.params.id == req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    run('UPDATE users SET active=0 WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CATEGORIES ────────────────────────────────────────────────────────────────
app.get('/api/categories', auth, (req, res) => {
  try { res.json(all('SELECT * FROM categories ORDER BY name')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categories', auth, adminOnly, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name required' });
  try {
    run('INSERT INTO categories (name) VALUES (?)', [name.trim()]);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: e.message });
  }
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
app.get('/api/products', auth, (req, res) => {
  try {
    res.json(all(`SELECT p.id, c.name AS category, p.name, p.stock
      FROM products p JOIN categories c ON p.category_id=c.id ORDER BY c.name, p.name`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', auth, adminOnly, (req, res) => {
  const { name, category_id, initial_stock } = req.body;
  if (!name || !category_id) return res.status(400).json({ error: 'Product name and category are required' });
  const trimmed = name.trim();
  if (!trimmed) return res.status(400).json({ error: 'Product name cannot be blank' });
  const stock = Math.max(0, parseInt(initial_stock) || 0);
  try {
    const cat = get('SELECT id FROM categories WHERE id=?', [category_id]);
    if (!cat) return res.status(400).json({ error: 'Invalid category' });
    const existing = get('SELECT id FROM products WHERE name=? AND category_id=?', [trimmed, category_id]);
    if (existing) return res.status(400).json({ error: 'A product with this name already exists in that category' });
    const info = run('INSERT INTO products (category_id,name,stock) VALUES (?,?,?)', [category_id, trimmed, stock]);
    if (stock > 0) {
      const today = new Date().toISOString().slice(0, 10);
      run('INSERT INTO transactions (product_id,type,quantity,note,date) VALUES (?,?,?,?,?)',
        [info.lastInsertRowid, 'ADD', stock, 'Initial stock', today]);
    }
    const product = get(
      `SELECT p.id,c.name AS category,p.name,p.stock FROM products p
       JOIN categories c ON p.category_id=c.id WHERE p.id=?`, [info.lastInsertRowid]);
    res.json({ success: true, product });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADD STOCK ─────────────────────────────────────────────────────────────────
app.post('/api/stock/add', auth, (req, res) => {
  const { product_id, quantity, note, date } = req.body;
  if (!product_id || !quantity || quantity < 1) return res.status(400).json({ error: 'Invalid input' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    run('UPDATE products SET stock=stock+? WHERE id=?', [quantity, product_id]);
    run('INSERT INTO transactions (product_id,type,quantity,note,date) VALUES (?,?,?,?,?)',
      [product_id, 'ADD', quantity, note || null, date || today]);
    const product = get(
      `SELECT p.id,c.name AS category,p.name,p.stock FROM products p
       JOIN categories c ON p.category_id=c.id WHERE p.id=?`, [product_id]);
    res.json({ success: true, product });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SELL STOCK ────────────────────────────────────────────────────────────────
app.post('/api/stock/sell', auth, (req, res) => {
  const { product_id, quantity, sale_type, note, date } = req.body;
  if (!product_id || !quantity || quantity < 1) return res.status(400).json({ error: 'Invalid input' });
  try {
    const product = get('SELECT * FROM products WHERE id=?', [product_id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock < quantity)
      return res.status(400).json({ error: `Insufficient stock. Available: ${product.stock}` });
    const today = new Date().toISOString().slice(0, 10);
    run('UPDATE products SET stock=stock-? WHERE id=?', [quantity, product_id]);
    run('INSERT INTO transactions (product_id,type,quantity,sale_type,note,date) VALUES (?,?,?,?,?,?)',
      [product_id, 'SELL', quantity, sale_type || null, note || null, date || today]);
    const updated = get(
      `SELECT p.id,c.name AS category,p.name,p.stock FROM products p
       JOIN categories c ON p.category_id=c.id WHERE p.id=?`, [product_id]);
    res.json({ success: true, product: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────
app.get('/api/transactions', auth, (req, res) => {
  const { product_id, type, from, to, limit = 150 } = req.query;
  let sql = `SELECT t.*,p.name,c.name AS category FROM transactions t
    JOIN products p ON t.product_id=p.id JOIN categories c ON p.category_id=c.id WHERE 1=1`;
  const params = [];
  if (product_id) { sql += ' AND t.product_id=?'; params.push(product_id); }
  if (type)       { sql += ' AND t.type=?';       params.push(type); }
  if (from)       { sql += ' AND t.date>=?';      params.push(from); }
  if (to)         { sql += ' AND t.date<=?';      params.push(to); }
  sql += ' ORDER BY t.created_at DESC LIMIT ?'; params.push(Number(limit));
  try { res.json(all(sql, params)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { totalProducts } = get('SELECT COUNT(*) AS totalProducts FROM products');
    const { totalStock }    = get('SELECT COALESCE(SUM(stock),0) AS totalStock FROM products');
    const { lowStock }      = get('SELECT COUNT(*) AS lowStock FROM products WHERE stock>0 AND stock<=5');
    const { outOfStock }    = get('SELECT COUNT(*) AS outOfStock FROM products WHERE stock=0');
    const { todayAdded }    = get("SELECT COALESCE(SUM(quantity),0) AS todayAdded FROM transactions WHERE type='ADD' AND date=?", [today]);
    const { todaySold }     = get("SELECT COALESCE(SUM(quantity),0) AS todaySold FROM transactions WHERE type='SELL' AND date=?", [today]);
    const recentTx = all(`SELECT t.*,p.name,c.name AS category FROM transactions t
      JOIN products p ON t.product_id=p.id JOIN categories c ON p.category_id=c.id
      ORDER BY t.created_at DESC LIMIT 8`);
    const categoryStock = all(`SELECT c.name AS category,COALESCE(SUM(p.stock),0) AS total
      FROM categories c LEFT JOIN products p ON p.category_id=c.id
      GROUP BY c.id,c.name ORDER BY total DESC`);
    res.json({ totalProducts, totalStock, lowStock, outOfStock, todayAdded, todaySold, recentTx, categoryStock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LOW STOCK ─────────────────────────────────────────────────────────────────
app.get('/api/products/low-stock', auth, (req, res) => {
  try {
    res.json(all(`SELECT p.id,c.name AS category,p.name,p.stock
      FROM products p JOIN categories c ON p.category_id=c.id
      WHERE p.stock<=5 ORDER BY p.stock ASC,c.name,p.name`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ✅  SQLite ready  (${DB_PATH})\n  🌐  http://localhost:${PORT}\n`);
});
