/**
 * Cart Routes (Person 2 - Shopping Cart)
 * Base Path: /api/cart
 */

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');
const cartController = require('../controllers/cart.controller');

// Restrict all cart endpoints to authenticated Customer role
router.use(authenticate, authorizeRoles('Customer'));

// GET /api/cart - Retrieve customer's active cart and items
router.get('/', cartController.getCart);

// POST /api/cart - Add item to cart or increment quantity
router.post('/', cartController.addToCart);

// PATCH /api/cart/items/:id - Update item quantity
router.patch('/items/:id', cartController.updateCartItemQty);

// DELETE /api/cart/items/:id - Remove a specific item from cart
router.delete('/items/:id', cartController.removeCartItem);

// DELETE /api/cart - Clear all items in cart
router.delete('/', cartController.clearCart);

module.exports = router;
