/**
 * test_seller_products.js — API tests for routes/sellerProducts.js (P3).
 *
 * Runs WITHOUT MySQL: config/db is replaced by an in-memory fake pool that understands
 * only the statements this router issues. It verifies auth, role checks, validation,
 * ownership logic, uploads and cleanup — NOT the real SQL. Real-database checks are
 * manual (see the Day 2 report).
 *
 * Usage: node test_seller_products.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

// ---------------- fake DB ----------------
const db = {
  categories: [{ category_id: 1, category_name: 'Electronics', status: 'Active' }, { category_id: 2, category_name: 'Old', status: 'Inactive' }],
  products: [],
  orderItems: new Set(),
  nextId: 1,
  failNext: false,
  logs: []
};
const join = (p) => ({ ...p, category_name: db.categories.find((c) => c.category_id === p.category_id).category_name, created_at: new Date() });

const fakePool = {
  async execute(sql, params = []) {
    if (db.failNext) { db.failNext = false; throw new Error('ER_SECRET: connection to db.internal:3306 lost'); }
    sql = sql.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('INSERT INTO system_logs')) { db.logs.push(params); return [{}]; }
    if (sql.startsWith('SELECT category_id FROM categories')) return [db.categories.filter((c) => c.category_id === params[0] && c.status === 'Active')];
    if (sql.includes('WHERE p.product_id = ? AND p.seller_id = ?')) return [db.products.filter((p) => p.product_id === params[0] && p.seller_id === params[1]).map(join)];
    if (sql.includes('WHERE p.seller_id = ?')) {
      let rows = db.products.filter((p) => p.seller_id === params[0]);
      const like = params.find((x) => typeof x === 'string' && x.startsWith('%'));
      if (like) rows = rows.filter((p) => p.product_name.toLowerCase().includes(like.slice(1, -1).toLowerCase()));
      return [rows.map(join)];
    }
    if (sql.startsWith('INSERT INTO products')) {
      const [seller_id, category_id, product_name, description, price, stock_quantity, image] = params;
      const row = { product_id: db.nextId++, seller_id, category_id, product_name, description, price, stock_quantity, image, status: 'Active' };
      db.products.push(row);
      return [{ insertId: row.product_id }];
    }
    if (sql.startsWith('UPDATE products SET category_id')) {
      const [category_id, product_name, description, price, stock_quantity, image, status, id, seller] = params;
      Object.assign(db.products.find((p) => p.product_id === id && p.seller_id === seller), { category_id, product_name, description, price, stock_quantity, image, status });
      return [{}];
    }
    if (sql.startsWith("UPDATE products SET status = 'Inactive'")) { db.products.find((p) => p.product_id === params[0] && p.seller_id === params[1]).status = 'Inactive'; return [{}]; }
    if (sql.startsWith('SELECT (SELECT COUNT(*) FROM order_items')) return [[{ order_count: db.orderItems.has(params[0]) ? 1 : 0, review_count: 0 }]];
    if (sql.startsWith('DELETE FROM products')) { db.products = db.products.filter((p) => !(p.product_id === params[0] && p.seller_id === params[1])); return [{}]; }
    throw new Error('Fake pool: unhandled SQL: ' + sql);
  }
};
require.cache[require.resolve('./config/db')] = { id: 'db', filename: 'db', loaded: true, exports: { pool: fakePool, testConnection: async () => true } };

const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/seller/products', require('./routes/sellerProducts'));
app.use((req, res) => res.status(404).json({ success: false, message: 'nf' }));

// ---------------- helpers ----------------
const token = (user_id, role) => jwt.sign({ user_id, role, email: `u${user_id}@x.com` }, 'test-secret');
const SELLER_A = token(10, 'Seller');
const SELLER_B = token(11, 'Seller');
const CUSTOMER = token(20, 'Customer');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'products');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const uploadCount = () => (fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR).length : 0);

let base;
async function call(method, url, { tok, fields, file, json } = {}) {
  const headers = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let body;
  if (fields || file) {
    body = new FormData();
    Object.entries(fields || {}).forEach(([k, v]) => body.append(k, v));
    if (file) body.append('image', new Blob([file.data], { type: file.type }), file.name);
  } else if (json) { body = JSON.stringify(json); headers['Content-Type'] = 'application/json'; }
  const res = await fetch(base + url, { method, headers, body });
  return { status: res.status, body: await res.json() };
}
const good = { product_name: 'Test Widget', description: 'A fine widget', category_id: '1', price: '19.99', stock_quantity: '5' };

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

(async () => {
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/seller/products`;
  const before = uploadCount();
  const origError = console.error; console.error = () => {};

  await test('1. unauthenticated -> 401', async () => assert.strictEqual((await call('GET', '/')).status, 401));
  await test('2. customer -> 403', async () => assert.strictEqual((await call('GET', '/', { tok: CUSTOMER })).status, 403));
  await test('5. create product (201, seller from token, not body)', async () => {
    const r = await call('POST', '/', { tok: SELLER_A, fields: { ...good, seller_id: '99' } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.data.seller_id, 10);
    assert.strictEqual(r.body.data.status, 'Active');
  });
  await test('3. seller lists only own products', async () => {
    await call('POST', '/', { tok: SELLER_B, fields: { ...good, product_name: 'B Product' } });
    const a = await call('GET', '/', { tok: SELLER_A });
    assert.strictEqual(a.status, 200);
    assert.ok(a.body.data.length >= 1 && a.body.data.every((p) => p.seller_id === 10));
    const search = await call('GET', '/?search=widget', { tok: SELLER_A });
    assert.strictEqual(search.body.data.length, 1);
    const empty = await call('GET', '/?search=zzz', { tok: SELLER_A });
    assert.deepStrictEqual(empty.body.data, []);
  });
  await test('query params validated (400)', async () => {
    assert.strictEqual((await call('GET', '/?status=Bogus', { tok: SELLER_A })).status, 400);
    assert.strictEqual((await call('GET', '/?stock=x', { tok: SELLER_A })).status, 400);
    assert.strictEqual((await call('GET', '/?category_id=abc', { tok: SELLER_A })).status, 400);
  });
  await test('4. cannot read another seller\'s product (404)', async () => {
    const bId = db.products.find((p) => p.seller_id === 11).product_id;
    assert.strictEqual((await call('GET', '/' + bId, { tok: SELLER_A })).status, 404);
    assert.strictEqual((await call('GET', '/' + bId, { tok: SELLER_B })).status, 200);
    assert.strictEqual((await call('GET', '/abc', { tok: SELLER_A })).status, 400);
  });
  await test('6. invalid prices rejected', async () => {
    for (const price of ['0', '-5', 'abc', '1.999', '', '100000', '1e3']) {
      const r = await call('POST', '/', { tok: SELLER_A, fields: { ...good, price } });
      assert.strictEqual(r.status, 400, 'price=' + price);
      assert.ok(r.body.errors.price);
    }
  });
  await test('7. negative / decimal stock rejected', async () => {
    for (const stock_quantity of ['-1', '1.5', 'x', '']) {
      assert.strictEqual((await call('POST', '/', { tok: SELLER_A, fields: { ...good, stock_quantity } })).status, 400, stock_quantity);
    }
  });
  await test('8. zero stock accepted (Out of Stock)', async () => {
    const r = await call('POST', '/', { tok: SELLER_A, fields: { ...good, product_name: 'Zero Stock', stock_quantity: '0' } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.data.stock_status, 'Out of Stock');
  });
  await test('9. invalid / inactive / missing category rejected', async () => {
    for (const category_id of ['999', '2', 'abc', '']) {
      const r = await call('POST', '/', { tok: SELLER_A, fields: { ...good, category_id } });
      assert.strictEqual(r.status, 400, 'category=' + category_id);
      assert.ok(r.body.errors.category_id);
    }
  });
  await test('name validation (empty / too long)', async () => {
    assert.strictEqual((await call('POST', '/', { tok: SELLER_A, fields: { ...good, product_name: '  ' } })).status, 400);
    assert.strictEqual((await call('POST', '/', { tok: SELLER_A, fields: { ...good, product_name: 'x'.repeat(201) } })).status, 400);
  });
  await test('10. update own product (stock + price), image preserved', async () => {
    const created = await call('POST', '/', { tok: SELLER_A, fields: good, file: { data: PNG, type: 'image/png', name: 'a.png' } });
    assert.strictEqual(created.status, 201);
    const img = created.body.data.image;
    assert.match(img, /^\/uploads\/products\/[0-9a-f-]+\.png$/);
    assert.ok(fs.existsSync(path.join(UPLOAD_DIR, path.basename(img))));
    const id = created.body.data.product_id;
    const r = await call('PUT', '/' + id, { tok: SELLER_A, fields: { ...good, price: '25.50', stock_quantity: '3', status: 'Inactive' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.price, 25.5);
    assert.strictEqual(r.body.data.stock_quantity, 3);
    assert.strictEqual(r.body.data.stock_status, 'Low Stock');
    assert.strictEqual(r.body.data.status, 'Inactive');
    assert.strictEqual(r.body.data.image, img);
  });
  await test('10b. replacing image removes the old local file', async () => {
    const created = await call('POST', '/', { tok: SELLER_A, fields: good, file: { data: PNG, type: 'image/png', name: 'a.png' } });
    const oldFile = path.join(UPLOAD_DIR, path.basename(created.body.data.image));
    const r = await call('PUT', '/' + created.body.data.product_id, { tok: SELLER_A, fields: good, file: { data: PNG, type: 'image/png', name: 'b.png' } });
    assert.strictEqual(r.status, 200);
    await new Promise((res) => setTimeout(res, 50));
    assert.ok(!fs.existsSync(oldFile), 'old file should be gone');
    assert.ok(fs.existsSync(path.join(UPLOAD_DIR, path.basename(r.body.data.image))));
  });
  await test('11. cannot update another seller\'s product', async () => {
    const bId = db.products.find((p) => p.seller_id === 11).product_id;
    assert.strictEqual((await call('PUT', '/' + bId, { tok: SELLER_A, fields: good })).status, 404);
    assert.strictEqual(db.products.find((p) => p.product_id === bId).product_name, 'B Product');
  });
  await test('12. delete own product w/o history -> hard delete + file removed', async () => {
    const created = await call('POST', '/', { tok: SELLER_A, fields: good, file: { data: PNG, type: 'image/png', name: 'a.png' } });
    const id = created.body.data.product_id;
    const file = path.join(UPLOAD_DIR, path.basename(created.body.data.image));
    const r = await call('DELETE', '/' + id, { tok: SELLER_A });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.action, 'deleted');
    await new Promise((res) => setTimeout(res, 50));
    assert.ok(!fs.existsSync(file));
    assert.strictEqual((await call('GET', '/' + id, { tok: SELLER_A })).status, 404);
  });
  await test('12b. delete product with order history -> deactivated', async () => {
    const created = await call('POST', '/', { tok: SELLER_A, fields: good });
    const id = created.body.data.product_id;
    db.orderItems.add(id);
    const r = await call('DELETE', '/' + id, { tok: SELLER_A });
    assert.strictEqual(r.body.data.action, 'deactivated');
    assert.strictEqual((await call('GET', '/' + id, { tok: SELLER_A })).body.data.status, 'Inactive');
  });
  await test('13. cannot delete another seller\'s product', async () => {
    const bId = db.products.find((p) => p.seller_id === 11).product_id;
    assert.strictEqual((await call('DELETE', '/' + bId, { tok: SELLER_A })).status, 404);
    assert.ok(db.products.some((p) => p.product_id === bId));
  });
  await test('14. invalid image type / disguised file rejected, nothing left on disk', async () => {
    const n = uploadCount();
    const gif = await call('POST', '/', { tok: SELLER_A, fields: good, file: { data: Buffer.from('GIF89a'), type: 'image/gif', name: 'a.gif' } });
    assert.strictEqual(gif.status, 400);
    const badExt = await call('POST', '/', { tok: SELLER_A, fields: good, file: { data: PNG, type: 'image/png', name: 'a.exe' } });
    assert.strictEqual(badExt.status, 400);
    const fake = await call('POST', '/', { tok: SELLER_A, fields: good, file: { data: Buffer.from('<script>alert(1)</script>'), type: 'image/png', name: 'x.png' } });
    assert.strictEqual(fake.status, 400);
    assert.strictEqual(uploadCount(), n);
  });
  await test('15. oversized image -> 413, nothing left on disk', async () => {
    const n = uploadCount();
    const r = await call('POST', '/', { tok: SELLER_A, fields: good, file: { data: Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), type: 'image/png', name: 'big.png' } });
    assert.strictEqual(r.status, 413);
    assert.strictEqual(uploadCount(), n);
  });
  await test('validation failure with an upload cleans up the file', async () => {
    const n = uploadCount();
    const r = await call('POST', '/', { tok: SELLER_A, fields: { ...good, price: '-1' }, file: { data: PNG, type: 'image/png', name: 'a.png' } });
    assert.strictEqual(r.status, 400);
    await new Promise((res) => setTimeout(res, 50));
    assert.strictEqual(uploadCount(), n);
  });
  await test('16. DB failure -> generic 500, no leak, upload cleaned up', async () => {
    const n = uploadCount();
    // 1st execute is the category check; fail it.
    db.failNext = true;
    const r = await call('POST', '/', { tok: SELLER_A, fields: good, file: { data: PNG, type: 'image/png', name: 'a.png' } });
    assert.strictEqual(r.status, 500);
    assert.ok(!JSON.stringify(r.body).includes('db.internal'));
    await new Promise((res) => setTimeout(res, 50));
    assert.strictEqual(uploadCount(), n);
    db.failNext = true;
    assert.strictEqual((await call('GET', '/', { tok: SELLER_A })).status, 500);
  });
  await test('audit log entries written with seller id', async () => {
    assert.ok(db.logs.some((l) => l[0] === 10 && l[1] === 'PRODUCT_CREATE'));
    assert.ok(db.logs.some((l) => l[1] === 'PRODUCT_UPDATE'));
    assert.ok(db.logs.some((l) => l[1] === 'PRODUCT_DELETE'));
    assert.ok(db.logs.some((l) => l[1] === 'PRODUCT_DEACTIVATE'));
  });

  console.error = origError;
  // remove any leftover test files
  if (fs.existsSync(UPLOAD_DIR)) fs.readdirSync(UPLOAD_DIR).forEach((f) => fs.unlinkSync(path.join(UPLOAD_DIR, f)));
  server.close();
  console.log(`\n${passed} passed, ${failed} failed (fake DB; real MySQL not exercised)`);
  process.exit(failed ? 1 : 0);
})();
