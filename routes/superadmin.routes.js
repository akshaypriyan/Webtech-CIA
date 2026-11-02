const express = require('express');
const router = express.Router();

const superadminController = require('../controllers/superadmin.controller');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');
const { auditLogger } = require('../middleware/auditLogger');

// All Super Admin routes strictly require JWT authentication and Super Admin role
router.use(authenticate);
router.use(authorizeRoles('Super Admin'));
router.use(auditLogger);

/**
 * Administrator Staff Management
 * @route   GET /api/superadmin/admins
 * @route   POST /api/superadmin/admins
 * @route   DELETE /api/superadmin/admins/:id
 * @route   PUT /api/superadmin/admins/:id/status
 */
router.get('/admins', superadminController.getAdmins);
router.post('/admins', superadminController.createAdmin);
router.delete('/admins/:id', superadminController.deleteAdmin);
router.put('/admins/:id/status', superadminController.updateAdminStatus);

/**
 * Administrator Granular Permissions Assignment
 * @route   GET /api/superadmin/admins/:id/permissions
 * @route   PUT /api/superadmin/admins/:id/permissions
 */
router.get('/admins/:id/permissions', superadminController.getAdminPermissions);
router.put('/admins/:id/permissions', superadminController.updateAdminPermissions);

/**
 * System Audit Trail & Security Logs
 * @route   GET /api/superadmin/logs
 */
router.get('/logs', superadminController.getSystemLogs);

/**
 * Global Marketplace Configuration Settings
 * @route   GET /api/superadmin/settings
 * @route   PUT /api/superadmin/settings
 */
router.get('/settings', superadminController.getSettings);
router.put('/settings', superadminController.updateSettings);

/**
 * Super Admin Console Dashboard Metrics
 * @route   GET /api/superadmin/stats
 */
router.get('/stats', superadminController.getSuperAdminStats);

module.exports = router;
