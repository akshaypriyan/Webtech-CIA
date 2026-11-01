/**
 * ============================================================
 * Reviews Routes — /api/reviews
 * ============================================================
 * Public:
 *   GET  /api/reviews/product/:productId  — paginated reviews + summary
 *
 * Customer only:
 *   GET  /api/reviews/can-review/:productId — check review eligibility
 *   POST /api/reviews                        — submit a review
 *   PUT  /api/reviews/:id                    — edit own review
 *
 * Customer (own) OR Admin / Super Admin:
 *   DELETE /api/reviews/:id                  — remove a review
 * ============================================================
 */

const express            = require('express');
const router             = express.Router();
const reviewsController  = require('../controllers/reviews.controller');
const { authenticate }   = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');

// ---- Public routes ----
router.get('/product/:productId', reviewsController.getProductReviews);

// ---- Customer-only routes ----
router.get(
  '/can-review/:productId',
  authenticate,
  authorizeRoles('Customer'),
  reviewsController.canReview
);

router.post(
  '/',
  authenticate,
  authorizeRoles('Customer'),
  reviewsController.addReview
);

router.put(
  '/:id',
  authenticate,
  authorizeRoles('Customer'),
  reviewsController.updateReview
);

// ---- Customer (own) OR Admin / Super Admin ----
// Authorization logic is handled inside deleteReview controller
router.delete('/:id', authenticate, reviewsController.deleteReview);

module.exports = router;
