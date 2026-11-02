/**
 * routes/sellerReports.js — Seller sales and revenue reports (P3, Day 3).
 *
 * Namespace: /api/seller/reports
 *
 *   GET /               all four sections in one response
 *   GET /summary        { total_revenue, units_sold, order_count }
 *   GET /weekly         revenue per week (weeks start Monday; latest 12 weeks with sales)
 *   GET /best-sellers   top products by units sold (?limit=1..20, default 5)
 *   GET /recent-sales   latest sold items (?limit=1..50, default 8)
 *
 * Optional period filter on every endpoint: ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive).
 *
 * Mounting (routes/index.js, P1-owned):
 *     const sellerReportRoutes = require('./sellerReports');
 *     router.use('/seller/reports', sellerReportRoutes);
 *
 * Calculation rules: scoped by order_items.seller_id = req.user.user_id; revenue is the sum of
 * the seller's own order_items.subtotal (never orders.total_amount, which spans sellers);
 * items with item_status = 'Cancelled' are excluded; orders are counted with COUNT(DISTINCT order_id).
 */
const express = require('express');

const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');
const { sendSuccess, sendError } = require('../utils/response');

const router = express.Router();
router.use(authenticate, authorizeRoles('Seller'));

const WEEKS_SHOWN = 12;
const FROM = 'FROM order_items oi JOIN orders o ON o.order_id = oi.order_id';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;

function isRealDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(text + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/** Validates ?from/?to; returns { error } or { where, params } for the seller's non-cancelled items. */
function scope(req) {
  const { from, to } = req.query;
  const where = ['oi.seller_id = ?', "oi.item_status <> 'Cancelled'"];
  const params = [req.user.user_id];
  if (from !== undefined && from !== '') {
    if (typeof from !== 'string' || !isRealDate(from)) return { error: 'from must be a valid date (YYYY-MM-DD).' };
    where.push('o.order_date >= ?');
    params.push(from);
  }
  if (to !== undefined && to !== '') {
    if (typeof to !== 'string' || !isRealDate(to)) return { error: 'to must be a valid date (YYYY-MM-DD).' };
    where.push('o.order_date < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(to);
  }
  if (from && to && from > to) return { error: 'from cannot be after to.' };
  return { where: where.join(' AND '), params };
}

function limitFrom(req, def, max) {
  const raw = req.query.limit;
  if (raw === undefined || raw === '') return def;
  if (/^\d{1,3}$/.test(String(raw)) && Number(raw) >= 1 && Number(raw) <= max) return Number(raw);
  throw Object.assign(new Error('bad limit'), { badRequest: `limit must be an integer between 1 and ${max}.` });
}

async function summary(s) {
  const [[r]] = await pool.execute(
    `SELECT COALESCE(SUM(oi.subtotal), 0) AS total_revenue, COALESCE(SUM(oi.quantity), 0) AS units_sold,
            COUNT(DISTINCT oi.order_id) AS order_count
     ${FROM} WHERE ${s.where}`, s.params);
  return { total_revenue: money(r.total_revenue), units_sold: Number(r.units_sold), order_count: Number(r.order_count) };
}

async function weekly(s) {
  // LIMIT values are validated integer constants, never raw user input.
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(DATE_SUB(DATE(o.order_date), INTERVAL WEEKDAY(o.order_date) DAY), '%Y-%m-%d') AS week_start,
            SUM(oi.subtotal) AS revenue, SUM(oi.quantity) AS units
     ${FROM} WHERE ${s.where}
     GROUP BY week_start ORDER BY week_start DESC LIMIT ${WEEKS_SHOWN}`, s.params);
  return rows.reverse().map((r) => ({ week_start: r.week_start, revenue: money(r.revenue), units: Number(r.units) }));
}

async function bestSellers(s, limit) {
  const [rows] = await pool.execute(
    `SELECT oi.product_id, p.product_name, SUM(oi.quantity) AS units, SUM(oi.subtotal) AS revenue
     ${FROM} JOIN products p ON p.product_id = oi.product_id WHERE ${s.where}
     GROUP BY oi.product_id, p.product_name
     ORDER BY units DESC, revenue DESC, oi.product_id ASC LIMIT ${limit}`, s.params);
  return rows.map((r) => ({ product_id: r.product_id, product_name: r.product_name, units: Number(r.units), revenue: money(r.revenue) }));
}

async function recentSales(s, limit) {
  const [rows] = await pool.execute(
    `SELECT oi.order_item_id, oi.order_id, p.product_name, oi.quantity, oi.subtotal AS revenue,
            DATE_FORMAT(o.order_date, '%Y-%m-%d') AS order_date
     ${FROM} JOIN products p ON p.product_id = oi.product_id WHERE ${s.where}
     ORDER BY o.order_date DESC, oi.order_item_id DESC LIMIT ${limit}`, s.params);
  return rows.map((r) => ({ ...r, quantity: Number(r.quantity), revenue: money(r.revenue) }));
}

/** Builds a handler: validates the period, runs `load`, maps failures to generic responses. */
function endpoint(message, failure, load) {
  return async (req, res) => {
    const s = scope(req);
    if (s.error) return sendError(res, s.error, 400);
    try {
      return sendSuccess(res, message, await load(s, req));
    } catch (err) {
      if (err.badRequest) return sendError(res, err.badRequest, 400);
      console.error(`[SELLER_REPORTS] ${failure}:`, err);
      return sendError(res, failure, 500);
    }
  };
}

router.get('/', endpoint('Seller report retrieved successfully', 'Failed to retrieve the report.', async (s) => {
  const [sum, wk, best, recent] = await Promise.all([summary(s), weekly(s), bestSellers(s, 5), recentSales(s, 8)]);
  return { summary: sum, weekly: wk, best_sellers: best, recent_sales: recent };
}));
router.get('/summary', endpoint('Sales summary retrieved successfully', 'Failed to retrieve the sales summary.', (s) => summary(s)));
router.get('/weekly', endpoint('Weekly revenue retrieved successfully', 'Failed to retrieve weekly revenue.', (s) => weekly(s)));
router.get('/best-sellers', endpoint('Best-selling products retrieved successfully', 'Failed to retrieve best sellers.', (s, req) => bestSellers(s, limitFrom(req, 5, 20))));
router.get('/recent-sales', endpoint('Recent sales retrieved successfully', 'Failed to retrieve recent sales.', (s, req) => recentSales(s, limitFrom(req, 8, 50))));

module.exports = router;
