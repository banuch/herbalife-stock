/**
 * seed-users.js  —  Add or update users in the Turso database.
 * Run with:  node seed-users.js
 * Requires TURSO_DB_URL and TURSO_DB_TOKEN in .env
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');

const users = [
  { name: 'Admin', email: 'admin@nag.com', password: 'admin123', role: 'admin' },
  { name: 'Staff', email: 'staff@nag.com', password: 'staff123', role: 'staff' },
  // { name: 'Ravi', email: 'ravi@nag.com', password: 'ravi123', role: 'staff' },
];

const db = createClient({
  url:       process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_TOKEN,
});

async function run() {
  console.log('\n── Herbalife User Seeder (Turso) ───────────────');
  for (const u of users) {
    const hash = bcrypt.hashSync(u.password, 10);
    try {
      await db.execute({
        sql: `INSERT INTO users (name,email,password,role,active) VALUES (?,?,?,?,1)
              ON CONFLICT(email) DO UPDATE SET name=excluded.name,password=excluded.password,role=excluded.role,active=1`,
        args: [u.name, u.email, hash, u.role]
      });
      console.log(`  ✅  ${u.role.padEnd(6)} | ${u.email} | password: ${u.password}`);
    } catch (e) {
      console.log(`  ❌  Failed for ${u.email}: ${e.message}`);
    }
  }
  const res = await db.execute('SELECT id,name,email,role,active,created_at FROM users ORDER BY id');
  console.log('\n── Users in Database ────────────────────────────');
  console.table(res.rows);
  db.close();
}

run();
