/**
 * test_seller_day3.js — API tests for routes/sellerOrders.js and routes/sellerReports.js (P3, Day 3).
 *
 * Runs WITHOUT MySQL: config/db is replaced by an in-memory fake pool. The fake answers each
 * query by interpreting its bound parameters over seed data, and the tests also inspect the SQL
 * text for the isolation / cancelled / total_amount rules. This checks routing, auth, validation,
 * transaction handling and wiring — it does NOT prove the SQL is valid MySQL.
 *
 * Usage: node test_seller_day3.js
 */
const assert = require('assert');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'test-secret';

const A = 10, B = 11;
const db = {
  items: [
    // order 1 mixes sellers A and B; order 2 has a cancelled A item
    { order_item_id: 1, order_id: 1, seller_id: A, product_name: 'Widget', quantity: 2, price: 10, subtotal: 20, item_status: 'Processing' },
    { order_item_id: 2, order_id: 1, seller_id: B, product_name: 'Gadget', quantity: 1, price: 99, subtotal: 99, item_status: 'Processing' },
    { order_item_id: 3, order_id: 2, seller_id: A, product_name: 'Widget', quantity: 1, price: 10, subtotal: 10, item_status: 'Cancelled' },
    { order_item_id: 4, order_id: 2, seller_id: A, product_name: 'Doohickey', quantity: 3, price: 5, subtotal: 15, item_status: 'Pending' },
    { order_item_id: 5, order_id: 2, seller_id: A, product_name: 'Widget', quantity: 1, price: 10, subtotal: 10, item_status: 'Shipped' }
  ],
  sqls: [], log: [], failNext: false, txn: []
};
const row = (i) => ({ ...i, order_date: '2026-10-29T10:00:00Z', shipping_address: 'addr', customer_name: 'Cust', customer_email: 'c@x.com' });

async function run(sql, params) {
  sql = sql.replace(/\s+/g, ' ').trim();
  db.sqls.push(sql);
  if (db.failNext) { db.failNext = false; throw new Error('ER_SECRET db.internal'); }
  if (sql.startsWith('INSERT INTO system_logs')) { db.log.push(params); return [{}]; }
  if (sql.startsWith('SELECT item_status FROM order_items')) {
    const it = db.items.find((i) => i.order_item_id === params[0] && i.seller_id === params[1]);
    return [it ? [{ item_status: it.item_status }] : []];
  }
  if (sql.startsWith('UPDATE order_items SET item_status')) {
    db.items.find((i) => i.order_item_id === params[1] && i.seller_id === params[2]).item_status = params[0];
    return [{}];
  }
  if (sql.startsWith('SELECT oi.order_item_id, oi.order_id, oi.product_id') && sql.includes('WHERE oi.seller_id = ?')) {
    // list with optional status
    let r = db.items.filter((i) => i.seller_id === params[0]);
    if (sql.includes('oi.item_status = ?')) r = r.filter((i) => i.item_status === params[1]);
    return [r.map(row)];
  }
  if (sql.includes('WHERE oi.order_item_id = ? AND oi.seller_id = ?')) return [db.items.filter((i) => i.order_item_id === params[0] && i.seller_id === params[1]).map(row)];
  if (sql.includes('FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN products')) {
    // list / best sellers / recent: only scope by seller + non-cancelled in the fake
    if (sql.includes('GROUP BY oi.product_id')) {
      const by = {};
      db.items.filter((i) => i.seller_id === params[0] && i.item_status !== 'Cancelled').forEach((i) => {
        by[i.product_name] = by[i.product_name] || { product_id: 1, product_name: i.product_name, units: 0, revenue: 0 };
        by[i.product_name].units += i.quantity; by[i.product_name].revenue += i.subtotal;
      });
      return [Object.values(by).sort((x, y) => y.units - x.units)];
    }
    return [db.items.filter((i) => i.seller_id === params[0] && i.item_status !== 'Cancelled').map((i) => ({ ...i, revenue: i.subtotal, order_date: '2026-10-29' }))];
  }
  if (sql.startsWith('SELECT COALESCE(SUM(oi.subtotal)')) {
    const mine = db.items.filter((i) => i.seller_id === params[0] && i.item_status !== 'Cancelled');
    return [[{ total_revenue: mine.reduce((s, i) => s + i.subtotal, 0).toFixed(2), units_sold: mine.reduce((s, i) => s + i.quantity, 0), order_count: new Set(mine.map((i) => i.order_id)).size }]];
  }
  if (sql.includes('GROUP BY week_start')) {
    const mine = db.items.filter((i) => i.seller_id === params[0] && i.item_status !== 'Cancelled');
    return [mine.length ? [{ week_start: '2026-10-26', revenue: mine.reduce((s, i) => s + i.subtotal, 0), units: 1 }] : []];
  }
  throw new Error('Fake pool: unhandled SQL: ' + sql);
}
const fakeConn = {
  execute: run,
  beginTransaction: async () => db.txn.push('begin'),
  commit: async () => db.txn.push('commit'),
  rollback: async () => db.txn.push('rollback'),
  release: () => db.txn.push('release')
};
const fakePool = { execute: run, getConnection: async () => fakeConn };
require.cache[require.resolve('./config/db')] = { id: 'db', filename: 'db', loaded: true, exports: { pool: fakePool, testConnection: async () => true } };

const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/seller/orders', require('./routes/sellerOrders'));
app.use('/api/seller/reports', require('./routes/sellerReports'));

const tok = (id, role) => jwt.sign({ user_id: id, role, email: 'x@x.com' }, 'test-secret');
let base;
async function call(method, url, { t, json } = {}) {
  const headers = {};
  if (t) headers.Authorization = 'Bearer ' + t;
  if (json) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, body: json ? JSON.stringify(json) : undefined });
  return { status: res.status, body: await res.json() };
}
let passed = 0, failed = 0;
async function test(name, fn) {
  try { db.txn = []; await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

(async () => {
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/seller`;
  const origErr = console.error; console.error = () => {};
  const SA = tok(A, 'Seller'), SB = tok(B, 'Seller'), CU = tok(20, 'Customer');

  await test('all endpoints: no token -> 401, customer -> 403', async () => {
    for (const [m, u] of [['GET', '/orders'], ['PATCH', '/orders/1/status'], ['GET', '/reports'], ['GET', '/reports/summary'], ['GET', '/reports/weekly'], ['GET', '/reports/best-sellers'], ['GET', '/reports/recent-sales']]) {
      assert.strictEqual((await call(m, u)).status, 401, m + u);
      assert.strictEqual((await call(m, u, { t: CU })).status, 403, m + u);
    }
  });
  await test('orders list is scoped to the seller (never B items)', async () => {
    const r = await call('GET', '/orders', { t: SA });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.length === 4 && r.body.data.every((i) => i.seller_id === A));
    assert.ok(!r.body.data.some((i) => i.product_name === 'Gadget'));
    assert.deepStrictEqual(r.body.data.find((i) => i.order_item_id === 1).allowed_transitions, ['Shipped']);
    assert.deepStrictEqual(r.body.data.find((i) => i.order_item_id === 5).allowed_transitions, []);
  });
  await test('orders filters validated (status / search)', async () => {
    assert.strictEqual((await call('GET', '/orders?status=Bogus', { t: SA })).status, 400);
    assert.strictEqual((await call('GET', '/orders?status=Shipped', { t: SA })).status, 200);
    assert.strictEqual((await call('GET', '/orders?search=ORD-1', { t: SA })).status, 200);
    assert.strictEqual((await call('GET', '/orders?search=' + 'x'.repeat(101), { t: SA })).status, 400);
  });
  await test('every orders SQL carries the seller_id scope + parameters', async () => {
    db.sqls = [];
    await call('GET', '/orders?search=wid&status=Processing', { t: SA });
    await call('PATCH', '/orders/1/status', { t: SA, json: { status: 'Shipped' } });
    const relevant = db.sqls.filter((s) => /FROM order_items|UPDATE order_items/.test(s));
    assert.ok(relevant.length >= 3);
    relevant.forEach((s) => assert.ok(/seller_id = \?/.test(s), s));
    db.items.find((i) => i.order_item_id === 1).item_status = 'Processing'; // reset
  });
  await test('Processing -> Shipped succeeds in a committed transaction', async () => {
    const r = await call('PATCH', '/orders/1/status', { t: SA, json: { status: 'Shipped' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.item_status, 'Shipped');
    assert.deepStrictEqual(db.txn, ['begin', 'commit', 'release']);
    assert.ok(db.log.some((l) => l[0] === A && l[1] === 'ORDER_ITEM_STATUS'));
  });
  await test('already Shipped -> 409 and rolled back', async () => {
    const r = await call('PATCH', '/orders/1/status', { t: SA, json: { status: 'Shipped' } });
    assert.strictEqual(r.status, 409);
    assert.deepStrictEqual(db.txn, ['begin', 'rollback', 'release']);
  });
  await test('invalid transitions rejected (Pending/Cancelled -> Shipped, anything -> Delivered/Processing)', async () => {
    assert.strictEqual((await call('PATCH', '/orders/4/status', { t: SA, json: { status: 'Shipped' } })).status, 409);
    assert.strictEqual((await call('PATCH', '/orders/3/status', { t: SA, json: { status: 'Shipped' } })).status, 409);
    db.items.find((i) => i.order_item_id === 1).item_status = 'Processing';
    assert.strictEqual((await call('PATCH', '/orders/1/status', { t: SA, json: { status: 'Delivered' } })).status, 409);
    assert.strictEqual((await call('PATCH', '/orders/1/status', { t: SA, json: { status: 'Pending' } })).status, 409);
    assert.strictEqual(db.items.find((i) => i.order_item_id === 1).item_status, 'Processing');
  });
  await test('bad body / id -> 400', async () => {
    assert.strictEqual((await call('PATCH', '/orders/1/status', { t: SA, json: { status: 'Nope' } })).status, 400);
    assert.strictEqual((await call('PATCH', '/orders/1/status', { t: SA, json: {} })).status, 400);
    assert.strictEqual((await call('PATCH', '/orders/abc/status', { t: SA, json: { status: 'Shipped' } })).status, 400);
  });
  await test('seller cannot update another seller\'s item (404, unchanged)', async () => {
    const r = await call('PATCH', '/orders/2/status', { t: SA, json: { status: 'Shipped' } });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(db.items.find((i) => i.order_item_id === 2).item_status, 'Processing');
    assert.strictEqual((await call('PATCH', '/orders/999/status', { t: SA, json: { status: 'Shipped' } })).status, 404);
  });
  await test('DB failure in orders -> generic 500, connection released', async () => {
    db.failNext = true;
    const r = await call('GET', '/orders', { t: SA });
    assert.strictEqual(r.status, 500);
    assert.ok(!JSON.stringify(r.body).includes('db.internal'));
    db.failNext = true;
    const p = await call('PATCH', '/orders/1/status', { t: SA, json: { status: 'Shipped' } });
    assert.strictEqual(p.status, 500);
    assert.ok(db.txn.includes('rollback') && db.txn.includes('release'));
  });
  await test('summary: excludes cancelled + other sellers, distinct orders, line subtotals', async () => {
    const r = await call('GET', '/reports/summary', { t: SA });
    // A non-cancelled: items 1(20) 4(15) 5(10) => 45; units 2+3+1=6; orders {1,2} => 2
    assert.deepStrictEqual(r.body.data, { total_revenue: 45, units_sold: 6, order_count: 2 });
    const b = await call('GET', '/reports/summary', { t: SB });
    assert.deepStrictEqual(b.body.data, { total_revenue: 99, units_sold: 1, order_count: 1 });
  });
  await test('report SQL rules: seller scope, cancelled excluded, never orders.total_amount', async () => {
    db.sqls = [];
    await call('GET', '/reports', { t: SA });
    const rep = db.sqls.filter((s) => /FROM order_items/.test(s));
    assert.strictEqual(rep.length, 4);
    rep.forEach((s) => {
      assert.ok(s.includes('oi.seller_id = ?'), s);
      assert.ok(s.includes("oi.item_status <> 'Cancelled'"), s);
      assert.ok(!s.includes('total_amount'), s);
    });
    assert.ok(rep.find((s) => s.includes('COUNT(DISTINCT oi.order_id)')));
    assert.ok(rep.find((s) => s.includes('SUM(oi.subtotal)')));
  });
  await test('combined report shape + best sellers ordered', async () => {
    const r = await call('GET', '/reports', { t: SA });
    assert.deepStrictEqual(Object.keys(r.body.data), ['summary', 'weekly', 'best_sellers', 'recent_sales']);
    assert.strictEqual(r.body.data.best_sellers[0].units >= r.body.data.best_sellers[1].units, true);
  });
  await test('seller with no sales -> zeros and empty arrays (200)', async () => {
    const r = await call('GET', '/reports', { t: tok(77, 'Seller') });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.data.summary, { total_revenue: 0, units_sold: 0, order_count: 0 });
    assert.deepStrictEqual(r.body.data.weekly, []);
    assert.deepStrictEqual(r.body.data.best_sellers, []);
  });
  await test('date / limit filters validated', async () => {
    for (const q of ['from=2026-13-01', 'to=nope', 'from=2026-02-30', 'from=2026-11-02&to=2026-10-01', "from=2026-01-01'; DROP TABLE x;--"]) {
      assert.strictEqual((await call('GET', '/reports/summary?' + encodeURIComponent(q).replace(/%3D/g, '=').replace(/%26/g, '&'), { t: SA })).status, 400, q);
    }
    assert.strictEqual((await call('GET', '/reports/summary?from=2026-10-01&to=2026-10-31', { t: SA })).status, 200);
    for (const l of ['0', '21', 'abc', '-1']) assert.strictEqual((await call('GET', '/reports/best-sellers?limit=' + l, { t: SA })).status, 400, l);
    assert.strictEqual((await call('GET', '/reports/best-sellers?limit=3', { t: SA })).status, 200);
    assert.strictEqual((await call('GET', '/reports/recent-sales?limit=51', { t: SA })).status, 400);
  });
  await test('DB failure in reports -> generic 500', async () => {
    db.failNext = true;
    const r = await call('GET', '/reports/summary', { t: SA });
    assert.strictEqual(r.status, 500);
    assert.ok(!JSON.stringify(r.body).includes('db.internal'));
  });

  console.error = origErr;
  server.close();
  console.log(`\n${passed} passed, ${failed} failed (fake DB; real MySQL not exercised)`);
  process.exit(failed ? 1 : 0);
})();
