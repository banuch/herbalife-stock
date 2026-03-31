/**
 * init-inventory.js
 * ─────────────────────────────────────────────────────────────────
 * Sets the opening stock for all products in the database.
 * Edit the quantities below, then run:  node init-inventory.js
 *
 * ⚠️  This script RESETS stock to exactly these values and records
 *     one "OPENING STOCK" ADD transaction per product with qty > 0.
 *     Run it only ONCE on a fresh database.
 * ─────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

// Uses local herbalife.db file directly — no network needed
const db = createClient({
  url: 'file:' + path.join(__dirname, 'herbalife.db'),
});

// ── SET YOUR OPENING STOCK HERE ──────────────────────────────────
// Format: 'Product Name (Category)': quantity
// Any product not listed here will remain at 0.
const OPENING_STOCK = {
  // ── Formula 1 500g ───────────────────────────────────────────
  'Vanilla (Formula 1 500g)':     0,
  'Kulfi (Formula 1 500g)':       0,
  'Chocolate (Formula 1 500g)':   0,
  'Banana (Formula 1 500g)':      0,
  'Mango (Formula 1 500g)':       0,
  'Orange (Formula 1 500g)':      0,
  'Rose Kheer (Formula 1 500g)':  0,
  'Strawberry (Formula 1 500g)':  0,
  'Paan (Formula 1 500g)':        0,

  // ── Formula 1 750g ───────────────────────────────────────────
  'Vanilla (Formula 1 750g)':     0,
  'Kulfi (Formula 1 750g)':       0,
  'Mango (Formula 1 750g)':       0,
  'Rose Kheer (Formula 1 750g)':  0,

  // ── Personalized Protein ─────────────────────────────────────
  '400g (Personalized Protein)':  0,
  '200g (Personalized Protein)':  0,

  // ── ShakeMate ─────────────────────────────────────────────────
  '500g (ShakeMate)':             0,

  // ── Afresh ───────────────────────────────────────────────────
  'Lemon (Afresh)':               0,
  'Ginger (Afresh)':              0,
  'Kashmir Kawa (Afresh)':        0,
  'Peach (Afresh)':               0,
  'Cinnamon (Afresh)':            0,
  'Tulasi (Afresh)':              0,
  'Elaichi (Afresh)':             0,

  // ── Dino Shake ───────────────────────────────────────────────
  'Chocolate (Dino Shake)':       0,
  'Strawberry (Dino Shake)':      0,

  // ── Digestive Health ─────────────────────────────────────────
  'Aloe Plus (Digestive Health)':           0,
  'Active Fiber Complex (Digestive Health)':0,
  'Aloe Concentrate (Digestive Health)':    0,
  'Activated Fiber (Digestive Health)':     0,
  'Simply Probiotic (Digestive Health)':    0,

  // ── Bone & Joint Health ──────────────────────────────────────
  'Joint Support (Bone & Joint Health)':    0,
  'Calcium (Bone & Joint Health)':          0,

  // ── Sport Nutrition ──────────────────────────────────────────
  'H24 Hydrate (Sport Nutrition)':          0,
  'H24 Rebuild Strength (Sport Nutrition)': 0,
  'Lift Off (Sport Nutrition)':             0,

  // ── Enhancers ─────────────────────────────────────────────────
  'Multi Vitamin (Enhancers)':    0,
  'Cell Activator (Enhancers)':   0,
  'Cell-U-Loss (Enhancers)':      0,
  'Herbal Control (Enhancers)':   0,

  // ── Heart Health ─────────────────────────────────────────────
  'Nite Works (Heart Health)':              0,
  'Beta Heart (Heart Health)':              0,
  'Herba Life Line Omega 3 (Heart Health)': 0,

  // ── Skin Care ─────────────────────────────────────────────────
  'Skin Booster Sachets (Skin Care)':  0,
  'Skin Booster Canister (Skin Care)': 0,
  'Facial Cleanser (Skin Care)':       0,
  'Facial Toner (Skin Care)':          0,
  'Facial Serum (Skin Care)':          0,
  'Moisturizer (Skin Care)':           0,

  // ── Vriti Life ────────────────────────────────────────────────
  'Brain Health (Vriti Life)':    0,
  'Triphala (Vriti Life)':        0,
  'Immune Health (Vriti Life)':   0,

  // ── Eye Health ────────────────────────────────────────────────
  'Ocular Defense (Eye Health)':  0,

  // ── Men's Health ──────────────────────────────────────────────
  "Male Factor (Men's Health)":   0,

  // ── Women's Health ───────────────────────────────────────────
  "Woman's Choice (Women's Health)": 0,

  // ── Sleep Support ─────────────────────────────────────────────
  'Sleep Enhance (Sleep Support)': 0,
};
// ─────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n── Herbalife Opening Stock Initializer ──────────────────');

  // Fetch all products with their category names
  const res = await db.execute(`
    SELECT p.id, p.name, c.name AS category, p.stock
    FROM products p JOIN categories c ON p.category_id = c.id
    ORDER BY c.name, p.name
  `);
  const products = res.rows;

  const today = new Date().toISOString().slice(0, 10);
  let updated = 0, skipped = 0, notFound = [];

  for (const [key, qty] of Object.entries(OPENING_STOCK)) {
    // Parse key: "Product Name (Category)"
    const match = key.match(/^(.+)\s+\((.+)\)$/);
    if (!match) { console.warn(`  ⚠️  Bad key format: "${key}"`); continue; }
    const [, prodName, catName] = match;

    const product = products.find(
      p => p.name === prodName && p.category === catName
    );

    if (!product) {
      notFound.push(key);
      continue;
    }

    if (qty === 0) { skipped++; continue; }

    // Reset stock to specified value
    await db.execute({
      sql: 'UPDATE products SET stock = ? WHERE id = ?',
      args: [qty, product.id],
    });

    // Record opening stock transaction
    await db.execute({
      sql: `INSERT INTO transactions (product_id, type, quantity, note, date)
            VALUES (?, 'ADD', ?, 'Opening stock', ?)`,
      args: [product.id, qty, today],
    });

    console.log(`  ✅  ${String(qty).padStart(3)} × ${prodName} (${catName})`);
    updated++;
  }

  console.log('\n── Summary ──────────────────────────────────────────────');
  console.log(`  Products updated : ${updated}`);
  console.log(`  Skipped (qty=0)  : ${skipped}`);
  if (notFound.length) {
    console.log(`  Not found (${notFound.length})   :`);
    notFound.forEach(k => console.log(`    ✗ ${k}`));
  }

  // Print final stock table
  const final = await db.execute(`
    SELECT c.name AS category, p.name, p.stock
    FROM products p JOIN categories c ON p.category_id = c.id
    WHERE p.stock > 0 ORDER BY c.name, p.name
  `);
  if (final.rows.length) {
    console.log('\n── Products with Stock ──────────────────────────────────');
    console.table(final.rows);
  } else {
    console.log('\n  ℹ️  All quantities were 0 — no stock was set.');
    console.log('     Edit OPENING_STOCK values in this file and run again.');
  }

  db.close();
  console.log('\n  Done!\n');
}

run().catch(e => { console.error('  ❌ Error:', e.message); process.exit(1); });
