/**
 * Cart Controller (Person 2 - Shopping Cart)
 * Handles customer shopping cart retrieval and database mapping.
 */

const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Helper: Find or automatically create a cart for the authenticated customer.
 * Table: `cart` (cart_id, customer_id, created_at)
 * 
 * @param {number} customerId - Authenticated customer's user_id
 * @returns {Promise<number>} - Returns cart_id
 */
async function getOrCreateCartId(customerId) {
  const [rows] = await pool.query(
    'SELECT cart_id FROM cart WHERE customer_id = ?',
    [customerId]
  );

  if (rows.length > 0) {
    return rows[0].cart_id;
  }

  // Create new cart if none exists
  const [result] = await pool.query(
    'INSERT INTO cart (customer_id) VALUES (?)',
    [customerId]
  );
  return result.insertId;
}

/**
 * GET /api/cart
 * Retrieves the customer's cart, joined with current product data and authoritative totals.
 */
async function getCart(req, res, next) {
  try {
    const customerId = req.user.user_id;
    const cartId = await getOrCreateCartId(customerId);

    // Retrieve cart items joined with live product pricing and seller info
    const [items] = await pool.query(
      `SELECT 
        ci.cart_item_id,
        ci.cart_id,
        ci.product_id,
        ci.quantity,
        ci.price AS saved_price,
        p.product_name,
        p.price AS current_price,
        p.stock_quantity,
        p.image,
        p.status AS product_status,
        u.name AS seller_name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.product_id
       JOIN users u ON p.seller_id = u.user_id
       WHERE ci.cart_id = ?
       ORDER BY ci.cart_item_id ASC`,
      [cartId]
    );

    // Authoritative Server-side Price Calculations
    let subtotal = 0;
    let totalItems = 0;

    items.forEach(item => {
      const unitPrice = Number(item.current_price);
      subtotal += unitPrice * item.quantity;
      totalItems += item.quantity;
    });

    const tax = Number((subtotal * 0.05).toFixed(2));
    const totalAmount = Number((subtotal + tax).toFixed(2));

    return sendSuccess(res, 'Cart retrieved successfully', {
      cart_id: cartId,
      total_items: totalItems,
      subtotal: Number(subtotal.toFixed(2)),
      estimated_tax: tax,
      total_amount: totalAmount,
      items
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/cart
 * Adds an item to the cart or increments quantity if already present.
 */
async function addToCart(req, res, next) {
  try {
    const customerId = req.user.user_id;
    const { product_id, quantity = 1 } = req.body;

    const parsedQty = parseInt(quantity, 10);
    if (!product_id || isNaN(parsedQty) || parsedQty <= 0) {
      return sendError(res, 'Valid product_id and positive quantity are required.', 400);
    }

    // Verify product exists, is active, and check stock
    const [products] = await pool.query(
      'SELECT product_id, product_name, price, stock_quantity, status FROM products WHERE product_id = ?',
      [product_id]
    );

    if (products.length === 0 || products[0].status !== 'Active') {
      return sendError(res, 'Product not found or currently unavailable.', 404);
    }

    const product = products[0];
    const cartId = await getOrCreateCartId(customerId);

    // Check if product is already in this customer's cart
    const [existing] = await pool.query(
      'SELECT cart_item_id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
      [cartId, product_id]
    );

    const currentQty = existing.length > 0 ? existing[0].quantity : 0;
    const newQty = currentQty + parsedQty;

    // Validate available stock quantity
    if (newQty > product.stock_quantity) {
      return sendError(
        res,
        `Cannot add ${parsedQty} units. Only ${product.stock_quantity} available in stock.`,
        400
      );
    }

    if (existing.length > 0) {
      // Update quantity
      await pool.query(
        'UPDATE cart_items SET quantity = ?, price = ? WHERE cart_item_id = ?',
        [newQty, product.price, existing[0].cart_item_id]
      );
    } else {
      // Insert new line item
      await pool.query(
        'INSERT INTO cart_items (cart_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [cartId, product_id, parsedQty, product.price]
      );
    }

    return sendSuccess(res, `Added "${product.product_name}" to your cart.`, {
      product_id,
      quantity: newQty,
      price: product.price
    }, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/cart/items/:id
 * Updates quantity of a specific cart item with server-side stock validation.
 */
async function updateCartItemQty(req, res, next) {
  try {
    const customerId = req.user.user_id;
    const cartItemId = parseInt(req.params.id, 10);
    const { quantity } = req.body;

    const newQty = parseInt(quantity, 10);
    if (!cartItemId || isNaN(newQty) || newQty <= 0) {
      return sendError(res, 'A valid positive quantity is required.', 400);
    }

    const cartId = await getOrCreateCartId(customerId);

    // Verify item belongs to this customer's cart and check current stock
    const [items] = await pool.query(
      `SELECT ci.cart_item_id, ci.product_id, p.stock_quantity, p.product_name, p.price
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.product_id
       WHERE ci.cart_item_id = ? AND ci.cart_id = ?`,
      [cartItemId, cartId]
    );

    if (items.length === 0) {
      return sendError(res, 'Cart item not found in your cart.', 404);
    }

    const item = items[0];
    if (newQty > item.stock_quantity) {
      return sendError(
        res,
        `Cannot set quantity to ${newQty}. Only ${item.stock_quantity} units available in stock.`,
        400
      );
    }

    // Update quantity and record current price
    await pool.query(
      'UPDATE cart_items SET quantity = ?, price = ? WHERE cart_item_id = ? AND cart_id = ?',
      [newQty, item.price, cartItemId, cartId]
    );

    return sendSuccess(res, `Updated quantity for "${item.product_name}".`, {
      cart_item_id: cartItemId,
      quantity: newQty
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/cart/items/:id
 * Removes a specific item from the customer's cart.
 */
async function removeCartItem(req, res, next) {
  try {
    const customerId = req.user.user_id;
    const cartItemId = parseInt(req.params.id, 10);

    if (!cartItemId) {
      return sendError(res, 'Valid cart item ID is required.', 400);
    }

    const cartId = await getOrCreateCartId(customerId);

    // Enforce tenant security: item must belong to this customer's cart
    const [result] = await pool.query(
      'DELETE FROM cart_items WHERE cart_item_id = ? AND cart_id = ?',
      [cartItemId, cartId]
    );

    if (result.affectedRows === 0) {
      return sendError(res, 'Cart item not found or already removed.', 404);
    }

    return sendSuccess(res, 'Item removed from cart.');
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/cart
 * Clears all items in the customer's cart.
 */
async function clearCart(req, res, next) {
  try {
    const customerId = req.user.user_id;
    const cartId = await getOrCreateCartId(customerId);

    await pool.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);

    return sendSuccess(res, 'Shopping cart cleared successfully.');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOrCreateCartId,
  getCart,
  addToCart,
  updateCartItemQty,
  removeCartItem,
  clearCart
};
