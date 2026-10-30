/**
 * routes/sellerProducts.js — Seller product routes (P3). DAY 1 SKELETON ONLY.
 *
 * Namespace: /api/seller/products
 * None of these handlers are implemented: every route answers 501 Not Implemented.
 * There are no DB queries, no auth, and no validation here yet.
 *
 * ---------------------------------------------------------------------------
 * INTEGRATION NOTES FOR P1 (nothing below has been done by P3)
 * ---------------------------------------------------------------------------
 * 1. Mount in server.js or routes/index.js:
 *        const sellerProducts = require('./routes/sellerProducts');
 *        app.use('/api/seller/products', sellerProducts);
 *    This file only exports an express.Router(); it creates no server or DB connection.
 *
 * 2. Dependencies P3 needs from P1 (to confirm):
 *      - `express` installed and listed in package.json.
 *      - DB pool export (e.g. require('../config/db')) for the MySQL queries.
 *      - Auth middleware that verifies the JWT and sets req.user ({ id, role }).
 *      - Role middleware, e.g. requireRole('Seller'), applied to this router.
 *    Planned usage once available:
 *        router.use(authenticate, requireRole('Seller'));
 *
 * 3. API response format: please confirm the shared JSON contract. Placeholder used
 *    below is { success: boolean, message: string, data?: any }.
 *
 * 4. Product images (Day 2+): will add Multer for POST/PUT. Need agreed upload path
 *    (.gitignore already ignores public/uploads/*).
 *
 * 5. Static files: seller pages assume Express serves /public (express.static).
 * ---------------------------------------------------------------------------
 */
const express = require('express');

const router = express.Router();

// Temporary helper so every unfinished route responds consistently.
const notImplemented = (intent) => (req, res) =>
  res.status(501).json({ success: false, message: `Not implemented yet: ${intent}` });

// GET /api/seller/products
// TODO: return only the logged-in seller's products (WHERE seller_id = req.user.id).
//       Consider optional query params later: ?search=, ?category=, ?status=.
router.get('/', notImplemented('list seller products'));

// GET /api/seller/products/:id
// TODO: return one product; respond 404 if it doesn't exist or isn't owned by this seller.
router.get('/:id', notImplemented('get seller product'));

// POST /api/seller/products
// TODO: validate body (name, description, category, price > 0, integer stock >= 0),
//       handle image upload (Multer), insert with seller_id = req.user.id.
router.post('/', notImplemented('create product'));

// PUT /api/seller/products/:id
// TODO: validate, verify ownership, update the product's fields.
router.put('/:id', notImplemented('update product'));

// DELETE /api/seller/products/:id
// TODO: verify ownership, then delete (decide with the team: hard delete vs. soft delete
//       given products referenced by order_items).
router.delete('/:id', notImplemented('delete product'));

module.exports = router;
