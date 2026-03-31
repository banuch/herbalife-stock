/**
 * seed-users.js  —  Add or update users in the SQLite database.
 * Run with:  node seed-users.js
 *
 * The server must have been started at least once first so that
 * herbalife.db and the users table already exist.
 */

const bcrypt   = require('bcryptjs');
const Database = require('better-sqlite3');
const path     = require('path');

// ── ADD YOUR USERS HERE ───────────────────────────────────────────────────────
const users = [
  { name: 'Admin', email: 'admin@nag.com', password: 'admin123', role: 'admin' },
  { name: 'Staff', email: 'staff@nag.com', password: 'staff123', role: 'staff' },
  // { name: 'Ravi',  email: 'ravi@nag.com',  password: 'ravi123',  role: 'staff' },
];
// ─────────────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, 'herbalife.db');
const sqlite  = new Database(DB_PATH);
sqlite.pragma('foreign_keys = ON');

const upsert = sqlite.prepare(`
  INSERT INTO users (name, email, password, role, active)
  VALUES (?, ?, ?, ?, 1)
  ON CONFLICT(email) DO UPDATE SET
    name     = excluded.name,
    password = excluded.password,
    role     = excluded.role,
    active   = 1
`);

console.log('\n── Herbalife User Seeder (SQLite) ──────────────');

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, 10);
  try {
    upsert.run(u.name, u.email, hash, u.role);
    console.log(`  ✅  ${u.role.padEnd(6)} | ${u.email} | password: ${u.password}`);
  } catch (e) {
    console.log(`  ❌  Failed for ${u.email}: ${e.message}`);
  }
}

const rows = sqlite.prepare(
  'SELECT id, name, email, role, active, created_at FROM users ORDER BY id'
).all();
console.log('\n── Users in Database ────────────────────────────');
console.table(rows);
sqlite.close();
