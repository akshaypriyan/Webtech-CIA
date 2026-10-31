/**
 * ============================================================
 * Products Controller — Public Storefront API
 * ============================================================
 * Handles three endpoints:
 *   GET /api/products/categories  — list all active categories
 *   GET /api/products             — paginated + filtered listing
 *   GET /api/products/:id         — single product details
 *
 * Rules:
 *  - All queries use parameterized placeholders (no string concat)
 *  - Only 'Active' products from 'Active' categories are shown
 *  - stock_quantity >= 0 (schema CHECK enforces >= 0 anyway)
 * ============================================================
 */

const { pool } = require('../config/db');

// ------------------------------------------------------------------
// Helper: wrap controller logic and forward unexpected errors to
// Express's centralized error handler (middleware/errorHandler.js)
// ------------------------------------------------------------------
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ----------------------------------------------------------------
// VALID SORT OPTIONS — used for allow-list validation
// ----------------------------------------------------------------
const VALID_SORTS = ['newest', 'price_asc', 'price_desc', 'name'];

// Map sort keyword → SQL ORDER BY clause (safe: values are hard-coded)
const SORT_MAP = {
  newest:     'p.created_at DESC',
  price_asc:  'p.price ASC',
  price_desc: 'p.price DESC',
  name:       'p.product_name ASC'
};

// ================================================================
// GET /api/products/categories
// Returns all Active categories from the categories table.
// NOTE: This route MUST be registered before /:id in the router.
// ================================================================
const getCategories = asyncHandler(async (req, res) => {
  // Simple query — no user input, no params needed
  const [categories] = await pool.execute(
    `SELECT category_id, category_name, description
     FROM   categories
     WHERE  status = 'Active'
     ORDER  BY category_name ASC`
  );

  return res.json({
    success: true,
    message: `${categories.length} active categories retrieved`,
    data: { categories }
  });
});

// ================================================================
// GET /api/products
// Paginated product listing with optional filters:
//   ?search=   keyword search on product_name / description
//   ?category= category_id (integer)
//   ?minPrice= minimum price (positive number)
//   ?maxPrice= maximum price (positive number, >= minPrice)
//   ?sort=     newest | price_asc | price_desc | name
//   ?page=     page number (default 1)
//   ?limit=    items per page (default 12, max 48)
// ================================================================
const getProducts = asyncHandler(async (req, res) => {
  // ---- 1. Parse & validate query params ----
  let {
    search    = '',
    category  = '',
    minPrice  = '',
    maxPrice  = '',
    sort      = 'newest',
    page      = '1',
    limit     = '12'
  } = req.query;

  // Convert numeric strings to numbers
  const pageNum  = parseInt(page,  10);
  const limitNum = parseInt(limit, 10);

  // Validate page
  if (!Number.isInteger(pageNum) || pageNum < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid query param: "page" must be a positive integer (e.g. page=1)'
    });
  }

  // Validate limit
  if (!Number.isInteger(limitNum) || limitNum < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid query param: "limit" must be a positive integer (e.g. limit=12)'
    });
  }
  const safeLimitNum = Math.min(limitNum, 48); // cap at 48

  // Validate sort
  if (!VALID_SORTS.includes(sort)) {
    return res.status(400).json({
      success: false,
      message: `Invalid query param: "sort" must be one of: ${VALID_SORTS.join(', ')}`
    });
  }

  // Validate minPrice if provided
  let minPriceNum = null;
  if (minPrice !== '') {
    minPriceNum = parseFloat(minPrice);
    if (isNaN(minPriceNum) || minPriceNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query param: "minPrice" must be a non-negative number (e.g. minPrice=10)'
      });
    }
  }

  // Validate maxPrice if provided
  let maxPriceNum = null;
  if (maxPrice !== '') {
    maxPriceNum = parseFloat(maxPrice);
    if (isNaN(maxPriceNum) || maxPriceNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query param: "maxPrice" must be a non-negative number (e.g. maxPrice=200)'
      });
    }
  }

  // Validate minPrice <= maxPrice when both provided
  if (minPriceNum !== null && maxPriceNum !== null && minPriceNum > maxPriceNum) {
    return res.status(400).json({
      success: false,
      message: 'Invalid query params: "minPrice" cannot be greater than "maxPrice"'
    });
  }

  // Validate category (must be a positive integer if provided)
  let categoryId = null;
  if (category !== '') {
    categoryId = parseInt(category, 10);
    if (isNaN(categoryId) || categoryId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query param: "category" must be a positive integer category_id'
      });
    }
  }

  // ---- 2. Build WHERE clause dynamically ----
  // We collect WHERE conditions and matching parameter values separately
  // so every user value goes through a prepared-statement placeholder.
  const conditions = [
    `p.status = 'Active'`,
    `c.status = 'Active'`,
    `p.stock_quantity >= 0`
  ];
  const params = []; // parameterized values for WHERE clause

  // Keyword search: match product name OR description
  if (search.trim() !== '') {
    const keyword = `%${search.trim()}%`;
    conditions.push(`(p.product_name LIKE ? OR p.description LIKE ?)`);
    params.push(keyword, keyword);
  }

  // Category filter
  if (categoryId !== null) {
    conditions.push(`p.category_id = ?`);
    params.push(categoryId);
  }

  // Price range filter
  if (minPriceNum !== null) {
    conditions.push(`p.price >= ?`);
    params.push(minPriceNum);
  }
  if (maxPriceNum !== null) {
    conditions.push(`p.price <= ?`);
    params.push(maxPriceNum);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // ---- 3. Get total count (for pagination metadata) ----
  const countSql = `
    SELECT COUNT(*) AS total
    FROM   products p
    JOIN   categories c ON p.category_id = c.category_id
    ${whereClause}
  `;
  const [countRows] = await pool.execute(countSql, params);
  const total      = countRows[0].total;
  const totalPages = Math.ceil(total / safeLimitNum);

  // ---- 4. Fetch paginated product rows ----
  // OFFSET and LIMIT cannot use ? placeholders in mysql2 execute(),
  // so we cast them to integers (already validated above) before interpolating.
  const offset = (pageNum - 1) * safeLimitNum;

  const productsSql = `
    SELECT
      p.product_id,
      p.product_name,
      p.description,
      p.price,
      p.stock_quantity,
      p.image,
      p.created_at,
      c.category_id,
      c.category_name,
      u.name   AS seller_name,
      u.user_id AS seller_id,
      ROUND(AVG(r.rating), 1) AS avg_rating,
      COUNT(r.review_id)      AS review_count
    FROM   products   p
    JOIN   categories c ON p.category_id = c.category_id
    JOIN   users      u ON p.seller_id   = u.user_id
    LEFT JOIN reviews r ON p.product_id  = r.product_id
    ${whereClause}
    GROUP  BY
      p.product_id, p.product_name, p.description, p.price,
      p.stock_quantity, p.image, p.created_at,
      c.category_id, c.category_name, u.name, u.user_id
    ORDER  BY ${SORT_MAP[sort]}
    LIMIT  ${safeLimitNum} OFFSET ${offset}
  `;

  const [products] = await pool.execute(productsSql, params);

  return res.json({
    success: true,
    message: `${products.length} products retrieved (page ${pageNum} of ${totalPages || 1})`,
    data: {
      products,
      pagination: {
        page:       pageNum,
        limit:      safeLimitNum,
        total,
        totalPages: totalPages || 1
      }
    }
  });
});

// ================================================================
// GET /api/products/:id
// Single product details — returns 404 if inactive or not found.
// ================================================================
const getProductById = asyncHandler(async (req, res) => {
  // Parse product ID from URL parameter
  const productId = parseInt(req.params.id, 10);

  // Reject non-numeric or negative IDs early
  if (isNaN(productId) || productId < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid product ID — must be a positive integer'
    });
  }

  // Fetch the product with category, seller, and review aggregates
  const [rows] = await pool.execute(
    `SELECT
       p.product_id,
       p.product_name,
       p.description,
       p.price,
       p.stock_quantity,
       p.image,
       p.created_at,
       c.category_id,
       c.category_name,
       u.name    AS seller_name,
       u.user_id AS seller_id,
       ROUND(AVG(r.rating), 1) AS avg_rating,
       COUNT(r.review_id)      AS review_count
     FROM   products   p
     JOIN   categories c ON p.category_id = c.category_id
     JOIN   users      u ON p.seller_id   = u.user_id
     LEFT JOIN reviews r ON p.product_id  = r.product_id
     WHERE  p.product_id = ?
       AND  p.status     = 'Active'
       AND  c.status     = 'Active'
     GROUP  BY
       p.product_id, p.product_name, p.description, p.price,
       p.stock_quantity, p.image, p.created_at,
       c.category_id, c.category_name, u.name, u.user_id`,
    [productId]
  );

  // Product not found or not active → 404
  if (rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: `Product with ID ${productId} was not found or is currently unavailable`
    });
  }

  return res.json({
    success: true,
    message: 'Product details retrieved successfully',
    data: { product: rows[0] }
  });
});

module.exports = {
  getCategories,
  getProducts,
  getProductById
};
