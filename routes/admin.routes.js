const express = require('express');
const router = express.Router();

const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');
const { auditLogger } = require('../middleware/auditLogger');

// All routes here require authentication, Admin/Super Admin role, and audit logger
router.use(authenticate);
router.use(authorizeRoles('Admin', 'Super Admin'));
router.use(auditLogger);

/**
 * Platform Metrics Overview
 * @route   GET /api/admin/stats
 */
router.get('/stats', adminController.getAdminStats);

/**
 * Customer Management Endpoints
 * @route   GET /api/admin/customers
 * @route   PUT /api/admin/customers/:id/status
 */
router.get('/customers', adminController.getCustomers);
router.put('/customers/:id/status', adminController.updateCustomerStatus);

/**
 * Seller Onboarding & Governance Endpoints
 * @route   GET /api/admin/sellers
 * @route   PUT /api/admin/sellers/:id/status
 */
router.get('/sellers', adminController.getSellers);
router.put('/sellers/:id/status', adminController.updateSellerStatus);

module.exports = router;
