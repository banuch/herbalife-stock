require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');

// ── ADD YOUR USERS HERE ───────────────────────────────────────
const users = [
  { name: 'Admin',  email: 'admin@herbalife.com', password: 'admin123', role: 'admin' },
  { name: 'Staff',  email: 'staff@herbalife.com', password: 'staff123', role: 'staff' },
  // Add more users below:
  // { name: 'Ravi',  email: 'ravi@herbalife.com',  password: 'ravi123',  role: 'staff' },
];
// ─────────────────────────────────────────────────────────────

async function run() {
  const db = await mysql.createConnection({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log('\n── Herbalife User Seeder ──────────────────────');

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    try {
      await db.execute(
        `INSERT INTO users (name, email, password, role)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE password=VALUES(password), role=VALUES(role), active=1`,
        [u.name, u.email, hash, u.role]
      );
      console.log(`  ✅  ${u.role.padEnd(6)} | ${u.email} | password: ${u.password}`);
    } catch (e) {
      console.log(`  ❌  Failed for ${u.email}: ${e.message}`);
    }
  }

  // Show final users table
  const [rows] = await db.execute(
    'SELECT id, name, email, role, active, created_at FROM users ORDER BY id'
  );
  console.log('\n── Users in Database ──────────────────────────');
  console.table(rows);

  await db.end();
}

run();
