require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── DB POOL ───────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, waitForConnections: true, connectionLimit: 10,
});
const db = async (sql, p = []) => { const [r] = await pool.execute(sql, p); return r; };

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
    const [user] = await db('SELECT * FROM users WHERE email = ? AND active = 1', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES }
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
    const [user] = await db('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!await bcrypt.compare(current, user.password))
      return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPass, 10);
    await db('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── USER MANAGEMENT (admin only) ──────────────────────────────────────────────
app.get('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const rows = await db('SELECT id,name,email,role,active,created_at FROM users ORDER BY id');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await db('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)',
      [name, email, hash, role || 'staff']);
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  const { name, role, active } = req.body;
  try {
    await db('UPDATE users SET name=?, role=?, active=? WHERE id=?',
      [name, role, active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  if (req.params.id == req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    await db('UPDATE users SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
app.get('/api/products', auth, async (req, res) => {
  try {
    const rows = await db(`SELECT p.id, c.name AS category, p.name, p.stock
      FROM products p JOIN categories c ON p.category_id = c.id ORDER BY c.name, p.name`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/categories', auth, async (req, res) => {
  try { res.json(await db('SELECT * FROM categories ORDER BY name')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADD STOCK ─────────────────────────────────────────────────────────────────
app.post('/api/stock/add', auth, async (req, res) => {
  const { product_id, quantity, note, date } = req.body;
  if (!product_id || !quantity || quantity < 1) return res.status(400).json({ error: 'Invalid input' });
  try {
    const today = new Date().toISOString().slice(0,10);
    await db('UPDATE products SET stock = stock + ? WHERE id = ?', [quantity, product_id]);
    await db('INSERT INTO transactions (product_id,type,quantity,note,date) VALUES (?,?,?,?,?)',
      [product_id,'ADD',quantity,note||null,date||today]);
    const [product] = await db(`SELECT p.id,c.name AS category,p.name,p.stock
      FROM products p JOIN categories c ON p.category_id=c.id WHERE p.id=?`,[product_id]);
    res.json({ success: true, product });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SELL STOCK ────────────────────────────────────────────────────────────────
app.post('/api/stock/sell', auth, async (req, res) => {
  const { product_id, quantity, sale_type, note, date } = req.body;
  if (!product_id || !quantity || quantity < 1) return res.status(400).json({ error: 'Invalid input' });
  try {
    const [product] = await db('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock < quantity)
      return res.status(400).json({ error: `Insufficient stock. Available: ${product.stock}` });
    const today = new Date().toISOString().slice(0,10);
    await db('UPDATE products SET stock = stock - ? WHERE id = ?', [quantity, product_id]);
    await db('INSERT INTO transactions (product_id,type,quantity,sale_type,note,date) VALUES (?,?,?,?,?,?)',
      [product_id,'SELL',quantity,sale_type||null,note||null,date||today]);
    const [updated] = await db(`SELECT p.id,c.name AS category,p.name,p.stock
      FROM products p JOIN categories c ON p.category_id=c.id WHERE p.id=?`,[product_id]);
    res.json({ success: true, product: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────
app.get('/api/transactions', auth, async (req, res) => {
  const { product_id, type, from, to, limit = 150 } = req.query;
  let sql = `SELECT t.*,p.name,c.name AS category FROM transactions t
    JOIN products p ON t.product_id=p.id JOIN categories c ON p.category_id=c.id WHERE 1=1`;
  const params = [];
  if (product_id) { sql += ' AND t.product_id=?'; params.push(product_id); }
  if (type)       { sql += ' AND t.type=?';       params.push(type); }
  if (from)       { sql += ' AND t.date>=?';      params.push(from); }
  if (to)         { sql += ' AND t.date<=?';      params.push(to); }
  sql += ' ORDER BY t.created_at DESC LIMIT ?'; params.push(Number(limit));
  try { res.json(await db(sql, params)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0,10);
    const [[{totalProducts}]] = [await db('SELECT COUNT(*) AS totalProducts FROM products')];
    const [[{totalStock}]]    = [await db('SELECT COALESCE(SUM(stock),0) AS totalStock FROM products')];
    const [[{lowStock}]]      = [await db('SELECT COUNT(*) AS lowStock FROM products WHERE stock>0 AND stock<=5')];
    const [[{outOfStock}]]    = [await db('SELECT COUNT(*) AS outOfStock FROM products WHERE stock=0')];
    const [[{todayAdded}]]    = [await db("SELECT COALESCE(SUM(quantity),0) AS todayAdded FROM transactions WHERE type='ADD' AND date=?",[today])];
    const [[{todaySold}]]     = [await db("SELECT COALESCE(SUM(quantity),0) AS todaySold FROM transactions WHERE type='SELL' AND date=?",[today])];
    const recentTx = await db(`SELECT t.*,p.name,c.name AS category FROM transactions t
      JOIN products p ON t.product_id=p.id JOIN categories c ON p.category_id=c.id
      ORDER BY t.created_at DESC LIMIT 8`);
    const categoryStock = await db(`SELECT c.name AS category,COALESCE(SUM(p.stock),0) AS total
      FROM categories c LEFT JOIN products p ON p.category_id=c.id
      GROUP BY c.id,c.name ORDER BY total DESC`);
    res.json({totalProducts,totalStock,lowStock,outOfStock,todayAdded,todaySold,recentTx,categoryStock});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LOW STOCK ─────────────────────────────────────────────────────────────────
app.get('/api/products/low-stock', auth, async (req, res) => {
  try {
    res.json(await db(`SELECT p.id,c.name AS category,p.name,p.stock
      FROM products p JOIN categories c ON p.category_id=c.id
      WHERE p.stock<=5 ORDER BY p.stock ASC,c.name,p.name`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    await pool.query('SELECT 1');
    console.log('\n  ✅  MySQL connected!\n  🌐  http://localhost:' + PORT + '\n');
  } catch (e) { console.error('  ❌  MySQL error:', e.message); }
});
