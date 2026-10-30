const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Online Marketplace API is running smoothly',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// MOUNTED ROUTES
// ==========================================

// Person 1: Authentication
router.use('/auth', authRoutes);

// ==========================================
// PLACEHOLDERS FOR TEAMMATES & FUTURE SLICES
// ==========================================

// Person 1: Storefront, Products, Profiles & Reviews
// const productRoutes = require('./product.routes');
// const profileRoutes = require('./profile.routes');
// const reviewRoutes = require('./review.routes');
// router.use('/products', productRoutes);
// router.use('/profile', profileRoutes);
// router.use('/reviews', reviewRoutes);

// Person 2: Shopping Cart & Orders
// const cartRoutes = require('./cart.routes');
// const orderRoutes = require('./order.routes');
// router.use('/cart', cartRoutes);
// router.use('/orders', orderRoutes);

// Person 3: Seller Portal & Fulfillment
// const sellerRoutes = require('./seller.routes');
// router.use('/seller', sellerRoutes);

// Person 4: Governance, Categories & Administration
// const adminRoutes = require('./admin.routes');
// const superadminRoutes = require('./superadmin.routes');
// const categoryRoutes = require('./category.routes');
// router.use('/admin', adminRoutes);
// router.use('/superadmin', superadminRoutes);
// router.use('/categories', categoryRoutes);

module.exports = router;
