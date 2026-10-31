/**
 * routes/sellerProducts.js — Seller product CRUD, inventory and image uploads (P3).
 *
 * Namespace: /api/seller/products   (mounted by P1 in routes/index.js — see below)
 *
 *   GET    /        list the logged-in seller's products (?search, ?category_id, ?status, ?stock)
 *   GET    /:id     one product owned by the seller
 *   POST   /        create (multipart/form-data or JSON; optional `image` file)
 *   PUT    /:id     update (same body; omit `image` to keep the current one)
 *   DELETE /:id     delete — or deactivate when the product has order/review history
 *
 * Mounting (routes/index.js, P1-owned):
 *     const sellerProductRoutes = require('./sellerProducts');
 *     router.use('/seller/products', sellerProductRoutes);
 *
 * The seller is always taken from the JWT (req.user.user_id); a seller_id in the
 * request is never read.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');
const { getClientIp } = require('../middleware/auditLogger');
const { sendSuccess, sendError } = require('../utils/response');
const logAction = require('../utils/logAction');

const router = express.Router();
router.use(authenticate, authorizeRoles('Seller'));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const UPLOAD_URL_PREFIX = '/uploads/products/';
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'products');
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const LOW_STOCK_THRESHOLD = 10; // matches the seller UI (seller-data.js)
const MAX_PRICE = 99999.99;
const MAX_STOCK = 100000;
const NAME_MIN = 3;
const NAME_MAX = 200;
const DESCRIPTION_MAX = 1000;

// ---------------------------------------------------------------------------
// Multer (image upload)
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdir(UPLOAD_DIR, { recursive: true }, (err) => cb(err, UPLOAD_DIR));
  },
  filename(req, file, cb) {
    // Never reuse the client-supplied name; the extension comes from the validated MIME type.
    cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${IMAGE_TYPES[file.mimetype]}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!IMAGE_TYPES[file.mimetype] || !IMAGE_EXTENSIONS.includes(ext)) {
      const err = new Error('Image must be a PNG, JPEG or WebP file.');
      err.code = 'INVALID_IMAGE_TYPE';
      return cb(err);
    }
    cb(null, true);
  }
}).single('image');

/** Runs multer and turns its failures into standard API error responses. */
function handleUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return sendError(res, 'Image must be 2 MB or smaller.', 413);
    if (err.code === 'INVALID_IMAGE_TYPE') return sendError(res, err.message, 400);
    if (err instanceof multer.MulterError) return sendError(res, 'Invalid image upload.', 400);
    console.error('[SELLER_PRODUCTS] Upload error:', err);
    return sendError(res, 'Image upload failed.', 500);
  });
}

/** Confirms the saved file really is PNG/JPEG/WebP by its magic bytes (MIME headers are client-supplied). */
function hasImageSignature(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    const png = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const jpeg = buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const webp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
    return png || jpeg || webp;
  } catch (e) {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Deletes a file this module uploaded; ignores seeded/remote URLs and anything outside UPLOAD_DIR. */
function removeLocalImage(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath.startsWith(UPLOAD_URL_PREFIX)) return;
  const target = path.join(UPLOAD_DIR, path.basename(imagePath));
  fs.unlink(target, (err) => {
    if (err && err.code !== 'ENOENT') console.error('[SELLER_PRODUCTS] Could not remove file:', err.message);
  });
}

function discardUpload(file) {
  if (file && file.path) fs.unlink(file.path, () => {});
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function parseId(value) {
  return /^[1-9]\d{0,9}$/.test(String(value)) ? Number(value) : null;
}

/** Validates the product body shared by POST and PUT. Returns { errors, values }. */
function validateProductBody(body, { allowStatus = false } = {}) {
  const errors = {};
  const b = body || {};
  const values = {};

  const name = typeof b.product_name === 'string' ? b.product_name.trim() : '';
  if (!name) errors.product_name = 'Product name is required.';
  else if (name.length < NAME_MIN) errors.product_name = `Name must be at least ${NAME_MIN} characters.`;
  else if (name.length > NAME_MAX) errors.product_name = `Name cannot exceed ${NAME_MAX} characters.`;
  values.product_name = name;

  if (b.description === undefined || b.description === null || b.description === '') {
    values.description = null;
  } else if (typeof b.description !== 'string') {
    errors.description = 'Description must be text.';
  } else {
    const description = b.description.trim();
    if (description.length > DESCRIPTION_MAX) errors.description = `Description cannot exceed ${DESCRIPTION_MAX} characters.`;
    values.description = description || null;
  }

  const categoryId = parseId(b.category_id);
  if (categoryId === null) errors.category_id = 'A valid category is required.';
  values.category_id = categoryId;

  const priceText = String(b.price === undefined || b.price === null ? '' : b.price).trim();
  if (!priceText) errors.price = 'Price is required.';
  else if (!/^\d+(\.\d{1,2})?$/.test(priceText)) errors.price = 'Price must be a number with at most 2 decimal places.';
  else if (Number(priceText) <= 0) errors.price = 'Price must be greater than 0.';
  else if (Number(priceText) > MAX_PRICE) errors.price = `Price cannot exceed ${MAX_PRICE}.`;
  values.price = priceText;

  const stockText = String(b.stock_quantity === undefined || b.stock_quantity === null ? '' : b.stock_quantity).trim();
  if (!stockText) errors.stock_quantity = 'Stock quantity is required.';
  else if (!/^\d+$/.test(stockText)) errors.stock_quantity = 'Stock must be a whole number (0 or more).';
  else if (Number(stockText) > MAX_STOCK) errors.stock_quantity = `Stock cannot exceed ${MAX_STOCK}.`;
  values.stock_quantity = Number(stockText);

  if (allowStatus && b.status !== undefined && b.status !== '') {
    if (b.status !== 'Active' && b.status !== 'Inactive') errors.status = 'Status must be Active or Inactive.';
    values.status = b.status;
  }

  return { errors, values };
}

async function isActiveCategory(categoryId) {
  const [rows] = await pool.execute(
    "SELECT category_id FROM categories WHERE category_id = ? AND status = 'Active'",
    [categoryId]
  );
  return rows.length > 0;
}

const PRODUCT_SELECT = `
  SELECT p.product_id, p.seller_id, p.category_id, c.category_name, p.product_name,
         p.description, p.price, p.stock_quantity, p.image, p.status, p.created_at
  FROM products p
  JOIN categories c ON c.category_id = p.category_id`;

function stockStatus(quantity) {
  if (quantity <= 0) return 'Out of Stock';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'Low Stock';
  return 'In Stock';
}

function toProduct(row) {
  return { ...row, price: Number(row.price), stock_status: stockStatus(row.stock_quantity) };
}

async function findOwnedProduct(productId, sellerId) {
  const [rows] = await pool.execute(`${PRODUCT_SELECT} WHERE p.product_id = ? AND p.seller_id = ?`, [productId, sellerId]);
  return rows.length ? toProduct(rows[0]) : null;
}

/** Wraps a handler so DB/unexpected errors return a generic 500 instead of leaking internals. */
function safe(handler, failureMessage) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[SELLER_PRODUCTS] ${failureMessage}:`, err);
      discardUpload(req.file);
      if (!res.headersSent) sendError(res, failureMessage, 500);
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/seller/products
// ---------------------------------------------------------------------------
router.get('/', safe(async (req, res) => {
  const { search, category_id: categoryParam, status, stock } = req.query;
  const where = ['p.seller_id = ?'];
  const params = [req.user.user_id];

  if (search !== undefined && search !== '') {
    if (typeof search !== 'string' || search.length > NAME_MAX) return sendError(res, 'Invalid search term.', 400);
    where.push('p.product_name LIKE ?');
    params.push(`%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (categoryParam !== undefined && categoryParam !== '') {
    const categoryId = parseId(categoryParam);
    if (categoryId === null) return sendError(res, 'Invalid category filter.', 400);
    where.push('p.category_id = ?');
    params.push(categoryId);
  }
  if (status !== undefined && status !== '') {
    if (status !== 'Active' && status !== 'Inactive') return sendError(res, 'Status filter must be Active or Inactive.', 400);
    where.push('p.status = ?');
    params.push(status);
  }
  if (stock !== undefined && stock !== '') {
    if (stock === 'out') where.push('p.stock_quantity <= 0');
    else if (stock === 'low') where.push(`p.stock_quantity BETWEEN 1 AND ${LOW_STOCK_THRESHOLD}`);
    else if (stock === 'in') where.push(`p.stock_quantity > ${LOW_STOCK_THRESHOLD}`);
    else return sendError(res, 'Stock filter must be in, low or out.', 400);
  }

  const [rows] = await pool.execute(
    `${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC, p.product_id DESC`,
    params
  );
  return sendSuccess(res, 'Products retrieved successfully', rows.map(toProduct));
}, 'Failed to retrieve products.'));

// ---------------------------------------------------------------------------
// GET /api/seller/products/:id
// ---------------------------------------------------------------------------
router.get('/:id', safe(async (req, res) => {
  const productId = parseId(req.params.id);
  if (productId === null) return sendError(res, 'Invalid product ID.', 400);

  const product = await findOwnedProduct(productId, req.user.user_id);
  if (!product) return sendError(res, 'Product not found', 404);
  return sendSuccess(res, 'Product retrieved successfully', product);
}, 'Failed to retrieve product.'));

// ---------------------------------------------------------------------------
// POST /api/seller/products
// ---------------------------------------------------------------------------
router.post('/', handleUpload, safe(async (req, res) => {
  if (req.file && !hasImageSignature(req.file.path)) {
    discardUpload(req.file);
    return sendError(res, 'Uploaded file is not a valid PNG, JPEG or WebP image.', 400);
  }

  const { errors, values } = validateProductBody(req.body);
  if (!errors.category_id && !(await isActiveCategory(values.category_id))) {
    errors.category_id = 'Selected category does not exist or is not active.';
  }
  if (Object.keys(errors).length) {
    discardUpload(req.file);
    return sendError(res, 'Validation failed.', 400, errors);
  }

  const image = req.file ? UPLOAD_URL_PREFIX + req.file.filename : null;
  const [result] = await pool.execute(
    `INSERT INTO products (seller_id, category_id, product_name, description, price, stock_quantity, image, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`,
    [req.user.user_id, values.category_id, values.product_name, values.description, values.price, values.stock_quantity, image]
  );

  await logAction(req.user.user_id, 'PRODUCT_CREATE', `Created product #${result.insertId} "${values.product_name}"`, getClientIp(req));
  const product = await findOwnedProduct(result.insertId, req.user.user_id);
  return sendSuccess(res, 'Product created successfully', product, 201);
}, 'Failed to create product.'));

// ---------------------------------------------------------------------------
// PUT /api/seller/products/:id
// ---------------------------------------------------------------------------
router.put('/:id', handleUpload, safe(async (req, res) => {
  const productId = parseId(req.params.id);
  if (productId === null) {
    discardUpload(req.file);
    return sendError(res, 'Invalid product ID.', 400);
  }

  const existing = await findOwnedProduct(productId, req.user.user_id);
  if (!existing) {
    discardUpload(req.file);
    return sendError(res, 'Product not found', 404);
  }

  if (req.file && !hasImageSignature(req.file.path)) {
    discardUpload(req.file);
    return sendError(res, 'Uploaded file is not a valid PNG, JPEG or WebP image.', 400);
  }

  const { errors, values } = validateProductBody(req.body, { allowStatus: true });
  // An unchanged category is accepted even if it has since been deactivated.
  if (!errors.category_id && values.category_id !== existing.category_id && !(await isActiveCategory(values.category_id))) {
    errors.category_id = 'Selected category does not exist or is not active.';
  }
  if (Object.keys(errors).length) {
    discardUpload(req.file);
    return sendError(res, 'Validation failed.', 400, errors);
  }

  const image = req.file ? UPLOAD_URL_PREFIX + req.file.filename : existing.image;
  const status = values.status || existing.status;
  await pool.execute(
    `UPDATE products
        SET category_id = ?, product_name = ?, description = ?, price = ?, stock_quantity = ?, image = ?, status = ?
      WHERE product_id = ? AND seller_id = ?`,
    [values.category_id, values.product_name, values.description, values.price, values.stock_quantity, image, status, productId, req.user.user_id]
  );

  if (req.file) removeLocalImage(existing.image);

  await logAction(req.user.user_id, 'PRODUCT_UPDATE', `Updated product #${productId} "${values.product_name}"`, getClientIp(req));
  const product = await findOwnedProduct(productId, req.user.user_id);
  return sendSuccess(res, 'Product updated successfully', product);
}, 'Failed to update product.'));

// ---------------------------------------------------------------------------
// DELETE /api/seller/products/:id
//
// Policy: order_items.product_id is ON DELETE RESTRICT, and reviews cascade, so a
// product with order or review history is never hard-deleted. It is set to
// 'Inactive' instead (hidden from the storefront, history preserved). Products with
// no history are removed outright (cart rows cascade) along with their local image.
// ---------------------------------------------------------------------------
router.delete('/:id', safe(async (req, res) => {
  const productId = parseId(req.params.id);
  if (productId === null) return sendError(res, 'Invalid product ID.', 400);

  const product = await findOwnedProduct(productId, req.user.user_id);
  if (!product) return sendError(res, 'Product not found', 404);

  const [[history]] = await pool.execute(
    `SELECT (SELECT COUNT(*) FROM order_items WHERE product_id = ?) AS order_count,
            (SELECT COUNT(*) FROM reviews WHERE product_id = ?) AS review_count`,
    [productId, productId]
  );

  if (Number(history.order_count) > 0 || Number(history.review_count) > 0) {
    await pool.execute("UPDATE products SET status = 'Inactive' WHERE product_id = ? AND seller_id = ?", [productId, req.user.user_id]);
    await logAction(req.user.user_id, 'PRODUCT_DEACTIVATE', `Deactivated product #${productId} "${product.product_name}" (has order/review history)`, getClientIp(req));
    return sendSuccess(res, 'Product has order history, so it was deactivated instead of deleted', { product_id: productId, action: 'deactivated' });
  }

  try {
    await pool.execute('DELETE FROM products WHERE product_id = ? AND seller_id = ?', [productId, req.user.user_id]);
  } catch (err) {
    // An order was placed between the history check and the delete: fall back to deactivation.
    if (err.code !== 'ER_ROW_IS_REFERENCED_2' && err.errno !== 1451) throw err;
    await pool.execute("UPDATE products SET status = 'Inactive' WHERE product_id = ? AND seller_id = ?", [productId, req.user.user_id]);
    await logAction(req.user.user_id, 'PRODUCT_DEACTIVATE', `Deactivated product #${productId} "${product.product_name}" (has order history)`, getClientIp(req));
    return sendSuccess(res, 'Product has order history, so it was deactivated instead of deleted', { product_id: productId, action: 'deactivated' });
  }

  removeLocalImage(product.image);
  await logAction(req.user.user_id, 'PRODUCT_DELETE', `Deleted product #${productId} "${product.product_name}"`, getClientIp(req));
  return sendSuccess(res, 'Product deleted successfully', { product_id: productId, action: 'deleted' });
}, 'Failed to delete product.'));

module.exports = router;
