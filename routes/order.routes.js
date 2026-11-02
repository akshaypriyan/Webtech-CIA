const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');

// All order endpoints are strictly guarded for authenticated Customers
router.use(authenticate, authorizeRoles('Customer'));

// POST /api/orders - Atomically place a new order
router.post('/', orderController.placeOrder);

// GET /api/orders/my-orders - Retrieve authenticated customer's order history
router.get('/my-orders', orderController.getMyOrders);

// GET /api/orders/dashboard/stats - Retrieve metrics and recent orders for dashboard
router.get('/dashboard/stats', orderController.getCustomerDashboardStats);

// GET /api/orders/:id - Retrieve complete itemized invoice for single order
router.get('/:id', orderController.getOrderById);

// PATCH /api/orders/:id/cancel - Atomically cancel an order and restore stock
router.patch('/:id/cancel', orderController.cancelOrder);

module.exports = router;
