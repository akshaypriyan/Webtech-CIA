/**
 * ============================================================
 * Reviews Controller — Product Reviews API
 * ============================================================
 * Handles:
 *   GET  /api/reviews/product/:productId   — public list with summary
 *   GET  /api/reviews/can-review/:productId— Customer: check eligibility
 *   POST /api/reviews                      — Customer: submit review
 *   PUT  /api/reviews/:id                  — Customer: edit own review
 *   DELETE /api/reviews/:id                — Customer (own) or Admin/SuperAdmin
 *
 * Business rules:
 *   - A Customer can only review a product they have purchased
 *     (at least one non-cancelled order containing the product).
 *   - One review per customer per product (UNIQUE KEY enforced in DB).
 *   - Reviewer privacy: show first name + last initial (e.g. "Alex J.").
 * ============================================================
 */

const { pool }                   = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');
const logAction                  = require('../utils/logAction');

// ----------------------------------------------------------------
// Helper: Check whether a customer has purchased a given product.
// A "purchase" = at least one non-cancelled order containing the item.
// (We use != 'Cancelled' so 'Delivered', 'Shipped', 'Processing'
//  all count — helpful during demo where orders rarely reach Delivered.)
// ----------------------------------------------------------------
async function hasCustomerPurchased(customerId, productId) {
  const [rows] = await pool.execute(
    `SELECT oi.order_item_id
     FROM   order_items oi
     JOIN   orders      o  ON oi.order_id = o.order_id
     WHERE  o.customer_id   = ?
       AND  oi.product_id   = ?
       AND  o.order_status != 'Cancelled'
     LIMIT 1`,
    [customerId, productId]
  );
  return rows.length > 0;
}

// ----------------------------------------------------------------
// Helper: Format reviewer name for privacy.
// "Alex Johnson" → "Alex J."   |   "Alice" → "Alice"
// ----------------------------------------------------------------
function formatReviewerName(fullName) {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

// ================================================================
// GET /api/reviews/product/:productId   (PUBLIC — no auth needed)
// Paginated list of reviews for a product, plus a rating summary.
// Query params: ?page=1 &limit=10
// ================================================================
async function getProductReviews(req, res, next) {
  try {
    const productId = parseInt(req.params.productId, 10);
    if (isNaN(productId) || productId < 1) {
      return sendError(res, 'Invalid product ID.', 400);
    }

    // Parse pagination params
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    // ---- Rating summary: average, count, and distribution ----
    const [summaryRows] = await pool.execute(
      `SELECT
         ROUND(AVG(rating), 1)     AS average_rating,
         COUNT(*)                  AS review_count,
         SUM(rating = 5)           AS r5,
         SUM(rating = 4)           AS r4,
         SUM(rating = 3)           AS r3,
         SUM(rating = 2)           AS r2,
         SUM(rating = 1)           AS r1
       FROM reviews
       WHERE product_id = ?`,
      [productId]
    );

    const s = summaryRows[0];
    const summary = {
      average_rating: s.average_rating ? parseFloat(s.average_rating).toFixed(1) : '0.0',
      review_count:   parseInt(s.review_count, 10) || 0,
      distribution: {
        5: parseInt(s.r5, 10) || 0,
        4: parseInt(s.r4, 10) || 0,
        3: parseInt(s.r3, 10) || 0,
        2: parseInt(s.r2, 10) || 0,
        1: parseInt(s.r1, 10) || 0
      }
    };

    // ---- Total count for pagination ----
    const total      = summary.review_count;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // ---- Fetch paginated reviews with reviewer name ----
    const [reviews] = await pool.execute(
      `SELECT
         r.review_id,
         r.rating,
         r.comment,
         r.created_at,
         u.name AS reviewer_full_name
       FROM reviews r
       JOIN users   u ON r.customer_id = u.user_id
       WHERE r.product_id = ?
       ORDER BY r.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [productId]
    );

    // Apply privacy formatting to reviewer names
    const reviewsFormatted = reviews.map(rv => ({
      review_id:     rv.review_id,
      rating:        rv.rating,
      comment:       rv.comment,
      created_at:    rv.created_at,
      reviewer_name: formatReviewerName(rv.reviewer_full_name)
    }));

    return sendSuccess(res, `${total} review(s) found for product ${productId}`, {
      reviews:    reviewsFormatted,
      summary,
      pagination: { page, limit, total, totalPages }
    });
  } catch (err) {
    next(err);
  }
}

// ================================================================
// GET /api/reviews/can-review/:productId  (Customer only)
// Tells the frontend whether this customer can leave a new review.
// Returns: { canReview, hasReviewed, review, reason }
// ================================================================
async function canReview(req, res, next) {
  try {
    const customerId = req.user.user_id;
    const productId  = parseInt(req.params.productId, 10);

    if (isNaN(productId) || productId < 1) {
      return sendError(res, 'Invalid product ID.', 400);
    }

    // Check if customer already reviewed this product
    const [existingRows] = await pool.execute(
      `SELECT review_id, rating, comment, created_at
       FROM   reviews
       WHERE  customer_id = ? AND product_id = ?`,
      [customerId, productId]
    );

    const hasReviewed = existingRows.length > 0;
    const existingReview = hasReviewed ? existingRows[0] : null;

    // Check purchase (only matters if not already reviewed)
    const purchased = await hasCustomerPurchased(customerId, productId);

    let canReview = false;
    let reason    = '';

    if (hasReviewed) {
      canReview = false;
      reason    = 'You have already reviewed this product. You can edit your existing review.';
    } else if (!purchased) {
      canReview = false;
      reason    = 'You need to purchase this product before you can leave a review.';
    } else {
      canReview = true;
      reason    = 'You are eligible to review this product.';
    }

    return sendSuccess(res, 'Review eligibility checked', {
      canReview,
      hasReviewed,
      review: existingReview,
      reason
    });
  } catch (err) {
    next(err);
  }
}

// ================================================================
// POST /api/reviews   (Customer only)
// Body: { product_id, rating, comment }
// Creates a new review. Enforces purchase gate.
// ================================================================
async function addReview(req, res, next) {
  try {
    const customerId = req.user.user_id;
    let { product_id, rating, comment } = req.body;

    // ---- Validation ----
    product_id = parseInt(product_id, 10);
    rating     = parseInt(rating, 10);

    if (isNaN(product_id) || product_id < 1) {
      return sendError(res, 'product_id must be a positive integer.', 400);
    }
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return sendError(res, 'rating must be an integer between 1 and 5.', 400);
    }

    // Comment is optional but trim and cap at 500 chars
    comment = comment ? String(comment).trim().substring(0, 500) : '';

    // Check product exists and is Active
    const [productRows] = await pool.execute(
      `SELECT product_id FROM products WHERE product_id = ? AND status = 'Active'`,
      [product_id]
    );
    if (productRows.length === 0) {
      return sendError(res, 'Product not found or is not available.', 404);
    }

    // Purchase gate: customer must have bought this product
    const purchased = await hasCustomerPurchased(customerId, product_id);
    if (!purchased) {
      return sendError(
        res,
        'You can only review products you have purchased. Complete a purchase first!',
        403
      );
    }

    // Insert review
    let insertId;
    try {
      const [result] = await pool.execute(
        `INSERT INTO reviews (customer_id, product_id, rating, comment)
         VALUES (?, ?, ?, ?)`,
        [customerId, product_id, rating, comment]
      );
      insertId = result.insertId;
    } catch (dbErr) {
      // Duplicate key: customer already reviewed this product
      if (dbErr.code === 'ER_DUP_ENTRY') {
        return sendError(res, 'You have already reviewed this product.', 409);
      }
      throw dbErr;
    }

    // Fetch newly created review
    const [newRows] = await pool.execute(
      `SELECT review_id, customer_id, product_id, rating, comment, created_at
       FROM   reviews
       WHERE  review_id = ?`,
      [insertId]
    );

    await logAction(
      customerId,
      'REVIEW_ADD',
      `Customer added review for product ID ${product_id} — rating: ${rating}`,
      req.ip
    );

    return sendSuccess(res, 'Review submitted successfully', { review: newRows[0] }, 201);
  } catch (err) {
    next(err);
  }
}

// ================================================================
// PUT /api/reviews/:id   (Customer only — own reviews)
// Body: { rating, comment }
// ================================================================
async function updateReview(req, res, next) {
  try {
    const customerId = req.user.user_id;
    const reviewId   = parseInt(req.params.id, 10);

    if (isNaN(reviewId) || reviewId < 1) {
      return sendError(res, 'Invalid review ID.', 400);
    }

    let { rating, comment } = req.body;
    rating  = parseInt(rating, 10);
    comment = comment ? String(comment).trim().substring(0, 500) : '';

    if (isNaN(rating) || rating < 1 || rating > 5) {
      return sendError(res, 'rating must be an integer between 1 and 5.', 400);
    }

    // Fetch review — check it exists
    const [rows] = await pool.execute(
      `SELECT review_id, customer_id FROM reviews WHERE review_id = ?`,
      [reviewId]
    );
    if (rows.length === 0) {
      return sendError(res, 'Review not found.', 404);
    }

    // Only the author can edit their review
    if (rows[0].customer_id !== customerId) {
      return sendError(res, 'You can only edit your own reviews.', 403);
    }

    // Update
    await pool.execute(
      `UPDATE reviews SET rating = ?, comment = ? WHERE review_id = ?`,
      [rating, comment, reviewId]
    );

    // Fetch updated review
    const [updatedRows] = await pool.execute(
      `SELECT review_id, customer_id, product_id, rating, comment, created_at
       FROM   reviews
       WHERE  review_id = ?`,
      [reviewId]
    );

    await logAction(
      customerId,
      'REVIEW_UPDATE',
      `Customer updated review ID ${reviewId} — new rating: ${rating}`,
      req.ip
    );

    return sendSuccess(res, 'Review updated successfully', { review: updatedRows[0] });
  } catch (err) {
    next(err);
  }
}

// ================================================================
// DELETE /api/reviews/:id   (Customer own OR Admin / Super Admin)
// ================================================================
async function deleteReview(req, res, next) {
  try {
    const userId   = req.user.user_id;
    const userRole = req.user.role;
    const reviewId = parseInt(req.params.id, 10);

    if (isNaN(reviewId) || reviewId < 1) {
      return sendError(res, 'Invalid review ID.', 400);
    }

    // Fetch review
    const [rows] = await pool.execute(
      `SELECT review_id, customer_id, product_id FROM reviews WHERE review_id = ?`,
      [reviewId]
    );
    if (rows.length === 0) {
      return sendError(res, 'Review not found.', 404);
    }

    const review = rows[0];

    // Customers can only delete their own reviews
    if (userRole === 'Customer' && review.customer_id !== userId) {
      return sendError(res, 'You can only delete your own reviews.', 403);
    }

    // Admins and Super Admins can delete any review
    await pool.execute(`DELETE FROM reviews WHERE review_id = ?`, [reviewId]);

    await logAction(
      userId,
      'REVIEW_DELETE',
      `${userRole} deleted review ID ${reviewId} for product ID ${review.product_id}`,
      req.ip
    );

    return sendSuccess(res, 'Review deleted successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProductReviews,
  canReview,
  addReview,
  updateReview,
  deleteReview
};
