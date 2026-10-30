const express = require('express');
const router = express.Router();

const categoryController = require('../controllers/category.controller');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');
const { auditLogger } = require('../middleware/auditLogger');

// Attach audit logging helper to all category requests
router.use(auditLogger);

/**
 * @route   GET /api/categories
 * @desc    Get all categories (public, filtered, or searched)
 * @access  Public
 */
router.get('/', categoryController.getAllCategories);

/**
 * @route   GET /api/categories/:id
 * @desc    Get category details by ID
 * @access  Public
 */
router.get('/:id', categoryController.getCategoryById);

/**
 * @route   POST /api/categories
 * @desc    Create a new product category
 * @access  Private (Admin, Super Admin)
 */
router.post(
  '/',
  authenticate,
  authorizeRoles('Admin', 'Super Admin'),
  categoryController.createCategory
);

/**
 * @route   PUT /api/categories/:id
 * @desc    Update category by ID
 * @access  Private (Admin, Super Admin)
 */
router.put(
  '/:id',
  authenticate,
  authorizeRoles('Admin', 'Super Admin'),
  categoryController.updateCategory
);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete category by ID
 * @access  Private (Admin, Super Admin)
 */
router.delete(
  '/:id',
  authenticate,
  authorizeRoles('Admin', 'Super Admin'),
  categoryController.deleteCategory
);

module.exports = router;
