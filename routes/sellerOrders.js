/**
 * routes/sellerOrders.js — Seller order fulfilment (P3, Day 3).
 *
 * Namespace: /api/seller/orders
 *
 *   GET   /                          the seller's own order items (?search, ?status)
 *   PATCH /:order_item_id/status     body { status: "Shipped" } — Processing -> Shipped only
 *
 * Mounting (routes/index.js, P1-owned):
 *     const sellerOrderRoutes = require('./sellerOrders');
 *     router.use('/seller/orders', sellerOrderRoutes);
 *
 * Every query is scoped by order_items.seller_id = req.user.user_id, so another seller's
 * items on the same customer order are never returned or modifiable. Fulfilment is tracked
 * per line item in order_items.item_status; orders.order_status is deliberately NOT touched
 * because one order can span several sellers.
 */
const express = require('express');

const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');
const { getClientIp } = require('../middleware/auditLogger');
const { sendSuccess, sendError } = require('../utils/response');
const logAction = require('../utils/logAction');

const router = express.Router();
router.use(authenticate, authorizeRoles('Seller'));

const STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
// Day 3 scope: the only transition a seller may perform.
const TRANSITIONS = { Processing: ['Shipped'] };

const ITEM_SELECT = `
  SELECT oi.order_item_id, oi.order_id, oi.product_id, p.product_name, oi.quantity,
         oi.price, oi.subtotal, oi.item_status, o.order_date, o.shipping_address,
         u.name AS customer_name, u.email AS customer_email
  FROM order_items oi
  JOIN orders o ON o.order_id = oi.order_id
  JOIN products p ON p.product_id = oi.product_id
  JOIN users u ON u.user_id = o.customer_id`;

function parseId(value) {
  return /^[1-9]\d{0,9}$/.test(String(value)) ? Number(value) : null;
}

function toItem(row) {
  return {
    ...row,
    price: Number(row.price),
    subtotal: Number(row.subtotal),
    allowed_transitions: TRANSITIONS[row.item_status] || []
  };
}

function safe(handler, failureMessage) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[SELLER_ORDERS] ${failureMessage}:`, err);
      if (!res.headersSent) sendError(res, failureMessage, 500);
    }
  };
}

// GET /api/seller/orders
router.get('/', safe(async (req, res) => {
  const { search, status } = req.query;
  const where = ['oi.seller_id = ?'];
  const params = [req.user.user_id];

  if (status !== undefined && status !== '') {
    if (!STATUSES.includes(status)) return sendError(res, 'Invalid status filter.', 400);
    where.push('oi.item_status = ?');
    params.push(status);
  }
  if (search !== undefined && search !== '') {
    if (typeof search !== 'string' || search.length > 100) return sendError(res, 'Invalid search term.', 400);
    const term = search.trim();
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    // "ORD-12" / "#12" / "12" all match order 12.
    const idText = term.replace(/^(ord-|#)/i, '');
    where.push('(p.product_name LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR CAST(oi.order_id AS CHAR) = ?)');
    params.push(like, like, like, idText);
  }

  const [rows] = await pool.execute(
    `${ITEM_SELECT} WHERE ${where.join(' AND ')} ORDER BY o.order_date DESC, oi.order_item_id DESC`,
    params
  );
  return sendSuccess(res, 'Orders retrieved successfully', rows.map(toItem));
}, 'Failed to retrieve orders.'));

// PATCH /api/seller/orders/:order_item_id/status
router.patch('/:order_item_id/status', safe(async (req, res) => {
  const itemId = parseId(req.params.order_item_id);
  if (itemId === null) return sendError(res, 'Invalid order item ID.', 400);

  const target = req.body && req.body.status;
  if (typeof target !== 'string' || !STATUSES.includes(target)) return sendError(res, 'A valid status is required.', 400);

  const conn = await pool.getConnection();
  let current;
  try {
    await conn.beginTransaction();
    // Lock the row so two concurrent requests cannot both pass the transition check.
    const [rows] = await conn.execute(
      'SELECT item_status FROM order_items WHERE order_item_id = ? AND seller_id = ? FOR UPDATE',
      [itemId, req.user.user_id]
    );
    if (!rows.length) {
      await conn.rollback();
      return sendError(res, 'Order item not found', 404);
    }
    current = rows[0].item_status;
    if (!(TRANSITIONS[current] || []).includes(target)) {
      await conn.rollback();
      return sendError(res, `Cannot change an item from ${current} to ${target}. Only Processing items can be marked Shipped.`, 409);
    }
    await conn.execute(
      'UPDATE order_items SET item_status = ? WHERE order_item_id = ? AND seller_id = ?',
      [target, itemId, req.user.user_id]
    );
    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* connection already gone */ }
    throw err;
  } finally {
    conn.release();
  }

  await logAction(req.user.user_id, 'ORDER_ITEM_STATUS', `Order item #${itemId}: ${current} -> ${target}`, getClientIp(req));
  const [rows] = await pool.execute(`${ITEM_SELECT} WHERE oi.order_item_id = ? AND oi.seller_id = ?`, [itemId, req.user.user_id]);
  return sendSuccess(res, `Order item marked as ${target}`, rows.length ? toItem(rows[0]) : null);
}, 'Failed to update order item status.'));

module.exports = router;
