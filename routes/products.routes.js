/**
 * ============================================================
 * Products Router — Public Storefront Endpoints
 * ============================================================
 * All routes are public (no authentication required).
 * Base path: /api/products  (mounted in routes/index.js)
 *
 * Route registration ORDER matters:
 *   /categories must be declared BEFORE /:id
 *   otherwise Express would treat "categories" as an :id value.
 * ============================================================
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/products.controller');

// GET /api/products/categories
// IMPORTANT: registered first so "categories" is not matched as :id
router.get('/categories', controller.getCategories);

// GET /api/products?search=&category=&minPrice=&maxPrice=&sort=&page=&limit=
router.get('/', controller.getProducts);

// GET /api/products/:id
router.get('/:id', controller.getProductById);

module.exports = router;
