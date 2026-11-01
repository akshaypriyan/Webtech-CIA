/**
 * Order Controller (Person 2 - Shopping Cart & Orders)
 * Handles transactional order placement, order history, status tracking,
 * cancellations with inventory restoration, and customer dashboard metrics.
 */

const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');
const logAction = require('../utils/logAction');

/**
 * POST /api/orders
 * Atomically places an order from the customer's active cart.
 * 
 * ACID Transaction Flow:
 * 1. Acquire dedicated connection from the MySQL pool.
 * 2. Start MySQL transaction (`beginTransaction`).
 * 3. Lock cart and products rows with `FOR UPDATE` to prevent race conditions.
 * 4. Verify item availability and sufficient stock quantity.
 * 5. Calculate authoritative server-side totals (subtotal + 5% tax).
 * 6. Insert new order into `orders` table.
 * 7. Insert line items into `order_items` table and decrement `products.stock_quantity`.
 * 8. Empty customer's active cart (`cart_items`).
 * 9. Commit transaction (`commit`).
 * 10. Record action in `system_logs` audit trail.
 */
async function placeOrder(req, res, next) {
  const customerId = req.user.user_id;
  const { shipping_address } = req.body;

  if (!shipping_address || !shipping_address.trim()) {
    return sendError(res, 'Shipping address is required to place an order.', 400);
  }

  // Acquire a dedicated database connection for atomic transaction
  const connection = await pool.getConnection();

  try {
    // 1. Begin atomic MySQL transaction
    await connection.beginTransaction();

    // 2. Fetch customer cart
    const [cartRows] = await connection.query(
      'SELECT cart_id FROM cart WHERE customer_id = ?',
      [customerId]
    );

    if (cartRows.length === 0) {
      await connection.rollback();
      return sendError(res, 'No active cart found for this account.', 400);
    }

    const cartId = cartRows[0].cart_id;

    // 3. Fetch cart items locked FOR UPDATE
    // Row locks prevent concurrent transactions from modifying product stock or prices mid-checkout
    const [items] = await connection.query(
      `SELECT 
        ci.cart_item_id,
        ci.product_id,
        ci.quantity,
        p.product_name,
        p.price,
        p.stock_quantity,
        p.status AS product_status,
        p.seller_id
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.product_id
       WHERE ci.cart_id = ?
       FOR UPDATE`,
      [cartId]
    );

    if (items.length === 0) {
      await connection.rollback();
      return sendError(res, 'Cannot place order: your cart is empty.', 400);
    }

    // 4. Validate product status and stock sufficiency
    for (const item of items) {
      if (item.product_status !== 'Active') {
        await connection.rollback();
        return sendError(res, `Product "${item.product_name}" is currently inactive or unavailable.`, 400);
      }

      if (item.stock_quantity < item.quantity) {
        await connection.rollback();
        return sendError(
          res, 
          `Insufficient stock for "${item.product_name}". Only ${item.stock_quantity} remaining in inventory.`, 
          400
        );
      }
    }

    // 5. Server-Authoritative Total Calculation
    let subtotal = 0;
    items.forEach(item => {
      subtotal += Number(item.price) * item.quantity;
    });

    const tax = Number((subtotal * 0.05).toFixed(2));
    const totalAmount = Number((subtotal + tax).toFixed(2));

    // 6. Insert Master Order record into `orders`
    const [orderResult] = await connection.query(
      `INSERT INTO orders (customer_id, total_amount, shipping_address, order_status, payment_status)
       VALUES (?, ?, ?, 'Pending', 'Paid')`,
      [customerId, totalAmount, shipping_address.trim()]
    );
    const orderId = orderResult.insertId;

    // 7. Insert each item into `order_items` and deduct product stock
    for (const item of items) {
      const itemSubtotal = Number((Number(item.price) * item.quantity).toFixed(2));

      await connection.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, subtotal, item_status)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
        [orderId, item.product_id, item.seller_id, item.quantity, item.price, itemSubtotal]
      );

      // Decrement product inventory
      await connection.query(
        `UPDATE products 
         SET stock_quantity = stock_quantity - ? 
         WHERE product_id = ?`,
        [item.quantity, item.product_id]
      );
    }

    // 8. Clear customer's active cart items
    await connection.query(
      'DELETE FROM cart_items WHERE cart_id = ?',
      [cartId]
    );

    // 9. Commit transaction to persist all database mutations together
    await connection.commit();

    // 10. Audit log user action (non-blocking)
    await logAction(
      customerId,
      'ORDER_PLACED',
      `Order #ORD-${orderId} placed successfully. Items: ${items.length}, Total: $${totalAmount}`,
      req.ip
    );

    return sendSuccess(res, 'Order placed successfully!', {
      order_id: orderId,
      total_amount: totalAmount,
      items_count: items.length
    }, 201);

  } catch (error) {
    // If any database operation fails, rollback all changes cleanly
    await connection.rollback();
    console.error('Order placement transaction error:', error);
    return sendError(res, 'Failed to place order due to a server error.', 500);
  } finally {
    // Always return connection to the pool
    connection.release();
  }
}

/**
 * GET /api/orders/my-orders
 * Fetches the authenticated customer's order history, joined with items, product names, and seller details.
 */
async function getMyOrders(req, res, next) {
  try {
    const customerId = req.user.user_id;

    // 1. Fetch all orders for this customer, newest first
    const [orders] = await pool.query(
      `SELECT 
        order_id,
        customer_id,
        total_amount,
        shipping_address,
        order_status,
        payment_status,
        order_date
       FROM orders
       WHERE customer_id = ?
       ORDER BY order_id DESC`,
      [customerId]
    );

    // If customer has no orders, return empty list immediately
    if (orders.length === 0) {
      return sendSuccess(res, 'No orders found', []);
    }

    // 2. Fetch all line items for these orders
    const orderIds = orders.map(o => o.order_id);
    const [items] = await pool.query(
      `SELECT 
        oi.order_item_id,
        oi.order_id,
        oi.product_id,
        oi.seller_id,
        oi.quantity,
        oi.price,
        oi.subtotal,
        oi.item_status,
        p.product_name,
        p.image,
        u.name AS seller_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.product_id
       JOIN users u ON oi.seller_id = u.user_id
       WHERE oi.order_id IN (?)
       ORDER BY oi.order_item_id ASC`,
      [orderIds]
    );

    // 3. Group line items by order_id
    const itemsByOrderId = {};
    items.forEach(item => {
      if (!itemsByOrderId[item.order_id]) {
        itemsByOrderId[item.order_id] = [];
      }
      itemsByOrderId[item.order_id].push({
        order_item_id: item.order_item_id,
        product_id: item.product_id,
        product_name: item.product_name,
        image: item.image,
        seller_id: item.seller_id,
        seller_name: item.seller_name,
        quantity: item.quantity,
        price: Number(item.price),
        subtotal: Number(item.subtotal),
        item_status: item.item_status
      });
    });

    // 4. Attach items array to each order
    const enrichedOrders = orders.map(order => ({
      ...order,
      total_amount: Number(order.total_amount),
      items: itemsByOrderId[order.order_id] || []
    }));

    return sendSuccess(res, 'Orders retrieved successfully', enrichedOrders);

  } catch (error) {
    console.error('Error fetching customer orders:', error);
    return sendError(res, 'Failed to retrieve orders.', 500);
  }
}

/**
 * PATCH /api/orders/:id/cancel
 * Atomically cancels an eligible customer order, updates statuses, and restores inventory stock.
 * 
 * ACID Transaction Flow:
 * 1. Acquire dedicated connection from pool.
 * 2. Start MySQL transaction (`beginTransaction`).
 * 3. Lock order row with `FOR UPDATE` and verify ownership.
 * 4. Verify order is in 'Pending' or 'Processing' state.
 * 5. Fetch purchased line items from `order_items`.
 * 6. Update `orders` status to 'Cancelled' and payment_status to 'Refunded'.
 * 7. Update `order_items` status to 'Cancelled'.
 * 8. Increment `products.stock_quantity` for all line items.
 * 9. Commit transaction (`commit`).
 * 10. Record action in `system_logs` audit trail.
 */
async function cancelOrder(req, res, next) {
  const customerId = req.user.user_id;
  const orderId = parseInt(req.params.id, 10);

  if (!orderId || isNaN(orderId)) {
    return sendError(res, 'A valid numeric Order ID is required.', 400);
  }

  const connection = await pool.getConnection();

  try {
    // 1. Begin atomic MySQL transaction
    await connection.beginTransaction();

    // 2. Fetch order with row-level lock FOR UPDATE
    const [orders] = await connection.query(
      `SELECT order_id, customer_id, order_status, payment_status, total_amount 
       FROM orders 
       WHERE order_id = ? AND customer_id = ? 
       FOR UPDATE`,
      [orderId, customerId]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return sendError(res, 'Order not found or does not belong to your account.', 404);
    }

    const order = orders[0];

    // 3. Status validation
    if (order.order_status === 'Cancelled') {
      await connection.rollback();
      return sendError(res, 'This order is already cancelled.', 400);
    }

    if (!['Pending', 'Processing'].includes(order.order_status)) {
      await connection.rollback();
      return sendError(
        res, 
        `Cannot cancel order with status "${order.order_status}". Orders that are Shipped or Delivered cannot be cancelled.`,
        400
      );
    }

    // 4. Fetch line items to identify quantities to restore
    const [items] = await connection.query(
      `SELECT product_id, quantity 
       FROM order_items 
       WHERE order_id = ?`,
      [orderId]
    );

    // 5. Update master order record
    await connection.query(
      `UPDATE orders 
       SET order_status = 'Cancelled', payment_status = 'Refunded' 
       WHERE order_id = ?`,
      [orderId]
    );

    // 6. Update line item records
    await connection.query(
      `UPDATE order_items 
       SET item_status = 'Cancelled' 
       WHERE order_id = ?`,
      [orderId]
    );

    // 7. Restore product stock in products table
    for (const item of items) {
      await connection.query(
        `UPDATE products 
         SET stock_quantity = stock_quantity + ? 
         WHERE product_id = ?`,
        [item.quantity, item.product_id]
      );
    }

    // 8. Commit atomic transaction
    await connection.commit();

    // 9. Record audit trail entry
    await logAction(
      customerId,
      'ORDER_CANCELLED',
      `Order #ORD-${orderId} cancelled by customer. Restored inventory for ${items.length} items. Refunded: $${order.total_amount}`,
      req.ip
    );

    return sendSuccess(res, `Order #ORD-${orderId} has been successfully cancelled.`, {
      order_id: orderId,
      order_status: 'Cancelled',
      payment_status: 'Refunded'
    });

  } catch (error) {
    await connection.rollback();
    console.error(`Transaction error cancelling order #${orderId}:`, error);
    return sendError(res, 'Failed to cancel order due to a server error.', 500);
  } finally {
    connection.release();
  }
}

/**
 * GET /api/orders/dashboard/stats
 * Aggregates summary statistics and recent purchase orders for the customer dashboard.
 */
async function getCustomerDashboardStats(req, res, next) {
  try {
    const customerId = req.user.user_id;

    // 1. Single query for aggregated metric counters
    const [statsRows] = await pool.query(
      `SELECT 
        COUNT(*) AS total_orders,
        SUM(CASE WHEN order_status IN ('Pending', 'Processing', 'Shipped') THEN 1 ELSE 0 END) AS active_orders,
        SUM(CASE WHEN order_status = 'Delivered' THEN 1 ELSE 0 END) AS delivered_orders,
        SUM(CASE WHEN order_status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
        COALESCE(SUM(CASE WHEN order_status != 'Cancelled' THEN total_amount ELSE 0 END), 0) AS total_spent
       FROM orders
       WHERE customer_id = ?`,
      [customerId]
    );

    const stats = {
      total_orders: Number(statsRows[0].total_orders || 0),
      active_orders: Number(statsRows[0].active_orders || 0),
      delivered_orders: Number(statsRows[0].delivered_orders || 0),
      cancelled_orders: Number(statsRows[0].cancelled_orders || 0),
      total_spent: Number(Number(statsRows[0].total_spent || 0).toFixed(2))
    };

    // 2. Fetch up to 5 recent orders for this customer
    const [recentOrders] = await pool.query(
      `SELECT 
        order_id,
        order_date,
        total_amount,
        order_status,
        payment_status
       FROM orders
       WHERE customer_id = ?
       ORDER BY order_id DESC
       LIMIT 5`,
      [customerId]
    );

    // 3. Summarize items for each recent order
    let recentOrdersWithItems = [];
    if (recentOrders.length > 0) {
      const orderIds = recentOrders.map(o => o.order_id);
      const [items] = await pool.query(
        `SELECT 
          oi.order_id,
          oi.quantity,
          p.product_name
         FROM order_items oi
         JOIN products p ON oi.product_id = p.product_id
         WHERE oi.order_id IN (?)
         ORDER BY oi.order_item_id ASC`,
        [orderIds]
      );

      const itemsByOrderId = {};
      items.forEach(item => {
        if (!itemsByOrderId[item.order_id]) {
          itemsByOrderId[item.order_id] = [];
        }
        itemsByOrderId[item.order_id].push(item);
      });

      recentOrdersWithItems = recentOrders.map(o => {
        const orderItems = itemsByOrderId[o.order_id] || [];
        let itemSummary = 'No items';
        if (orderItems.length === 1) {
          itemSummary = `${orderItems[0].product_name} (${orderItems[0].quantity})`;
        } else if (orderItems.length > 1) {
          itemSummary = `${orderItems[0].product_name} + ${orderItems.length - 1} more`;
        }

        return {
          order_id: o.order_id,
          order_date: o.order_date,
          total_amount: Number(o.total_amount),
          order_status: o.order_status,
          payment_status: o.payment_status,
          items_summary: itemSummary
        };
      });
    }

    return sendSuccess(res, 'Dashboard statistics retrieved successfully', {
      stats,
      recent_orders: recentOrdersWithItems
    });

  } catch (error) {
    console.error('Error fetching customer dashboard stats:', error);
    return sendError(res, 'Failed to retrieve dashboard statistics.', 500);
  }
}

module.exports = {
  placeOrder,
  getMyOrders,
  cancelOrder,
  getCustomerDashboardStats
};
