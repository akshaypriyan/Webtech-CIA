const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * ==============================================================================
 * Online Marketplace - Admin Governance & User Moderation Controller (Person 4)
 * ==============================================================================
 * Endpoints for managing and moderating Customer and Seller accounts,
 * tracking vendor approvals, status updates, and audit logging.
 * ==============================================================================
 */

/**
 * @desc    Get all registered customers with order counts and search filters
 * @route   GET /api/admin/customers
 * @access  Private (Admin, Super Admin)
 */
async function getCustomers(req, res, next) {
  try {
    const { search, status } = req.query;

    let sql = `
      SELECT 
        u.user_id,
        u.name,
        u.email,
        u.mobile,
        u.role,
        u.status,
        u.created_at,
        COUNT(o.order_id) AS total_orders
      FROM users u
      LEFT JOIN orders o ON u.user_id = o.customer_id
      WHERE u.role = 'Customer'
    `;
    const params = [];

    if (status && status !== 'ALL' && ['Active', 'Pending', 'Blocked'].includes(status)) {
      sql += ' AND u.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ' GROUP BY u.user_id, u.name, u.email, u.mobile, u.role, u.status, u.created_at ORDER BY u.created_at DESC';

    const [rows] = await pool.execute(sql, params);

    return sendSuccess(res, 'Customers retrieved successfully', rows);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Update customer status (Active / Blocked)
 * @route   PUT /api/admin/customers/:id/status
 * @access  Private (Admin, Super Admin)
 */
async function updateCustomerStatus(req, res, next) {
  try {
    const customerId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (isNaN(customerId) || customerId <= 0) {
      return sendError(res, 'Invalid customer ID provided.', 400);
    }

    if (!status || !['Active', 'Blocked'].includes(status)) {
      return sendError(res, 'Valid status is required ("Active" or "Blocked").', 400);
    }

    // 1. Verify customer exists
    const [existing] = await pool.execute(
      'SELECT user_id, name, email, status FROM users WHERE user_id = ? AND role = "Customer"',
      [customerId]
    );

    if (existing.length === 0) {
      return sendError(res, 'Customer account not found.', 404);
    }

    const customer = existing[0];

    // 2. Update status in database
    await pool.execute(
      'UPDATE users SET status = ? WHERE user_id = ?',
      [status, customerId]
    );

    // 3. Record audit trail
    if (req.logAudit) {
      const verb = status === 'Blocked' ? 'USER_BLOCK' : 'USER_UNBLOCK';
      await req.logAudit(
        verb,
        `Customer "${customer.name}" (#${customerId}) status changed from ${customer.status} to ${status}`
      );
    }

    return sendSuccess(res, `Customer status updated to ${status}.`, {
      user_id: customerId,
      name: customer.name,
      email: customer.email,
      status
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Get all merchants/sellers with catalog size and approval filters
 * @route   GET /api/admin/sellers
 * @access  Private (Admin, Super Admin)
 */
async function getSellers(req, res, next) {
  try {
    const { search, status } = req.query;

    let sql = `
      SELECT 
        u.user_id,
        u.name,
        u.email,
        u.mobile,
        u.role,
        u.status,
        u.created_at,
        COUNT(p.product_id) AS total_products
      FROM users u
      LEFT JOIN products p ON u.user_id = p.seller_id
      WHERE u.role = 'Seller'
    `;
    const params = [];

    if (status && status !== 'ALL' && ['Active', 'Pending', 'Blocked'].includes(status)) {
      sql += ' AND u.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ' GROUP BY u.user_id, u.name, u.email, u.mobile, u.role, u.status, u.created_at ORDER BY u.created_at DESC';

    const [rows] = await pool.execute(sql, params);

    return sendSuccess(res, 'Sellers retrieved successfully', rows);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Update seller status (Approve: Active, Reject/Suspend: Blocked)
 * @route   PUT /api/admin/sellers/:id/status
 * @access  Private (Admin, Super Admin)
 */
async function updateSellerStatus(req, res, next) {
  try {
    const sellerId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (isNaN(sellerId) || sellerId <= 0) {
      return sendError(res, 'Invalid seller ID provided.', 400);
    }

    if (!status || !['Active', 'Blocked', 'Pending'].includes(status)) {
      return sendError(res, 'Valid status is required ("Active", "Blocked", or "Pending").', 400);
    }

    // 1. Verify seller exists
    const [existing] = await pool.execute(
      'SELECT user_id, name, email, status FROM users WHERE user_id = ? AND role = "Seller"',
      [sellerId]
    );

    if (existing.length === 0) {
      return sendError(res, 'Seller account not found.', 404);
    }

    const seller = existing[0];

    // 2. Update status in database
    await pool.execute(
      'UPDATE users SET status = ? WHERE user_id = ?',
      [status, sellerId]
    );

    // 3. Determine audit action verb
    let actionVerb = 'SELLER_STATUS_UPDATE';
    if (seller.status === 'Pending' && status === 'Active') {
      actionVerb = 'SELLER_APPROVE';
    } else if (status === 'Blocked') {
      actionVerb = seller.status === 'Pending' ? 'SELLER_REJECT' : 'SELLER_SUSPEND';
    }

    // 4. Record audit trail
    if (req.logAudit) {
      await req.logAudit(
        actionVerb,
        `Merchant "${seller.name}" (#${sellerId}) status changed from ${seller.status} to ${status}`
      );
    }

    return sendSuccess(res, `Seller account status updated to ${status}.`, {
      user_id: sellerId,
      name: seller.name,
      email: seller.email,
      status
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Get aggregate platform metrics for admin dashboard
 * @route   GET /api/admin/stats
 * @access  Private (Admin, Super Admin)
 */
async function getAdminStats(req, res, next) {
  try {
    const [[customersCount]] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE role = "Customer"');
    const [[activeSellersCount]] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE role = "Seller" AND status = "Active"');
    const [[pendingSellersCount]] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE role = "Seller" AND status = "Pending"');
    const [[categoriesCount]] = await pool.execute('SELECT COUNT(*) as count FROM categories WHERE status = "Active"');
    const [[productsCount]] = await pool.execute('SELECT COUNT(*) as count FROM products');

    return sendSuccess(res, 'Admin stats retrieved successfully', {
      total_customers: customersCount.count,
      active_sellers: activeSellersCount.count,
      pending_sellers: pendingSellersCount.count,
      active_categories: categoriesCount.count,
      total_products: productsCount.count
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Get all platform products with seller details, categories, and moderation status
 * @route   GET /api/admin/products
 * @access  Private (Admin, Super Admin)
 */
async function getProducts(req, res, next) {
  try {
    const { search, category_id, status } = req.query;

    let sql = `
      SELECT 
        p.product_id,
        p.seller_id,
        p.category_id,
        p.product_name,
        p.description,
        p.price,
        p.stock_quantity,
        p.image,
        p.status,
        p.created_at,
        c.category_name,
        u.name AS seller_name,
        u.email AS seller_email,
        COUNT(r.review_id) AS review_count,
        COALESCE(AVG(r.rating), 0) AS average_rating
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN users u ON p.seller_id = u.user_id
      LEFT JOIN reviews r ON p.product_id = r.product_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'ALL' && ['Active', 'Flagged', 'Inactive'].includes(status)) {
      sql += ' AND p.status = ?';
      params.push(status);
    }

    if (category_id && category_id !== 'ALL') {
      sql += ' AND (p.category_id = ? OR c.category_name = ?)';
      params.push(category_id, category_id);
    }

    if (search && search.trim()) {
      sql += ' AND (p.product_name LIKE ? OR u.name LIKE ? OR CAST(p.product_id AS CHAR) = ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, search.trim());
    }

    sql += ' GROUP BY p.product_id, c.category_name, u.name, u.email ORDER BY p.product_id DESC';

    const [rows] = await pool.execute(sql, params);

    return sendSuccess(res, 'Catalog products retrieved successfully', rows);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Update product moderation status (Active / Flagged / Inactive)
 * @route   PUT /api/admin/products/:id/status
 * @access  Private (Admin, Super Admin)
 */
async function updateProductStatus(req, res, next) {
  try {
    const productId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (isNaN(productId) || productId <= 0) {
      return sendError(res, 'Invalid product ID provided.', 400);
    }

    if (!status || !['Active', 'Flagged', 'Inactive'].includes(status)) {
      return sendError(res, 'Status must be "Active", "Flagged", or "Inactive".', 400);
    }

    // 1. Verify product exists
    const [existing] = await pool.execute(
      'SELECT product_id, product_name, status, seller_id FROM products WHERE product_id = ?',
      [productId]
    );

    if (existing.length === 0) {
      return sendError(res, 'Product not found.', 404);
    }

    const product = existing[0];

    // 2. Update status in database
    await pool.execute(
      'UPDATE products SET status = ? WHERE product_id = ?',
      [status, productId]
    );

    // 3. Determine audit log verb
    let actionVerb = 'PRODUCT_STATUS_UPDATE';
    if (status === 'Flagged') actionVerb = 'PRODUCT_FLAG';
    else if (status === 'Active') actionVerb = 'PRODUCT_APPROVE';
    else if (status === 'Inactive') actionVerb = 'PRODUCT_TAKEDOWN';

    // 4. Record audit log
    if (req.logAudit) {
      await req.logAudit(
        actionVerb,
        `Moderated product "${product.product_name}" (#${productId}) status from ${product.status} to ${status}`
      );
    }

    return sendSuccess(res, `Product status updated to ${status}.`, {
      product_id: productId,
      product_name: product.product_name,
      status
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Get all marketplace orders across all buyers and sellers
 * @route   GET /api/admin/orders
 * @access  Private (Admin, Super Admin)
 */
async function getOrders(req, res, next) {
  try {
    const { status, search } = req.query;

    let sql = `
      SELECT 
        o.order_id,
        o.customer_id,
        o.total_amount,
        o.order_status,
        o.payment_status,
        o.shipping_address,
        o.order_date,
        u.name AS customer_name,
        u.email AS customer_email,
        u.mobile AS customer_mobile,
        COUNT(oi.order_item_id) AS total_items
      FROM orders o
      LEFT JOIN users u ON o.customer_id = u.user_id
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'ALL' && ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
      sql += ' AND o.order_status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR CAST(o.order_id AS CHAR) = ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, search.trim());
    }

    sql += ' GROUP BY o.order_id, u.name, u.email, u.mobile ORDER BY o.order_date DESC';

    const [rows] = await pool.execute(sql, params);

    return sendSuccess(res, 'Marketplace orders retrieved successfully', rows);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Moderate or cancel an order as an administrator
 * @route   PUT /api/admin/orders/:id/status
 * @access  Private (Admin, Super Admin)
 */
async function updateOrderStatus(req, res, next) {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (isNaN(orderId) || orderId <= 0) {
      return sendError(res, 'Invalid order ID provided.', 400);
    }

    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return sendError(res, `Status must be one of: ${validStatuses.join(', ')}`, 400);
    }

    // 1. Verify order exists
    const [existing] = await pool.execute(
      'SELECT order_id, order_status, total_amount FROM orders WHERE order_id = ?',
      [orderId]
    );

    if (existing.length === 0) {
      return sendError(res, 'Order not found.', 404);
    }

    const order = existing[0];

    // 2. Update order status
    await pool.execute(
      'UPDATE orders SET order_status = ? WHERE order_id = ?',
      [status, orderId]
    );

    // If order status is updated by admin, cascade item status as well
    if (status === 'Cancelled') {
      await pool.execute(
        'UPDATE order_items SET item_status = "Cancelled" WHERE order_id = ?',
        [orderId]
      );
    } else if (status === 'Processing') {
      await pool.execute(
        'UPDATE order_items SET item_status = "Processing" WHERE order_id = ? AND item_status = "Pending"',
        [orderId]
      );
    }

    // 3. Record audit log
    if (req.logAudit) {
      await req.logAudit(
        'ORDER_MODERATE',
        `Admin updated Order #${orderId} status from ${order.order_status} to ${status}`
      );
    }

    return sendSuccess(res, `Order #${orderId} status updated to ${status}.`, {
      order_id: orderId,
      status
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Get aggregate sales analytics and category financial reports
 * @route   GET /api/admin/reports
 * @access  Private (Admin, Super Admin)
 */
async function getAdminReports(req, res, next) {
  try {
    // 1. GMV and completed order count
    const [[gmvRow]] = await pool.execute(`
      SELECT 
        COALESCE(SUM(total_amount), 0) AS gmv,
        COUNT(order_id) AS total_orders
      FROM orders 
      WHERE order_status != 'Cancelled'
    `);

    const gmv = parseFloat(gmvRow.gmv) || 0;
    const totalOrders = parseInt(gmvRow.total_orders, 10) || 0;
    const platformFee = parseFloat((gmv * 0.05).toFixed(2));
    const avgOrderValue = totalOrders > 0 ? parseFloat((gmv / totalOrders).toFixed(2)) : 0;

    // 2. Average customer review rating
    const [[reviewRow]] = await pool.execute(`
      SELECT 
        COALESCE(AVG(rating), 0) AS avg_rating,
        COUNT(review_id) AS total_reviews
      FROM reviews
    `);

    // 3. Category performance share
    const [categoriesBreakdown] = await pool.execute(`
      SELECT 
        c.category_id,
        c.category_name,
        COALESCE(SUM(oi.subtotal), 0) AS category_revenue,
        COUNT(DISTINCT oi.order_id) AS order_count
      FROM categories c
      LEFT JOIN products p ON c.category_id = p.category_id
      LEFT JOIN order_items oi ON p.product_id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.order_id AND o.order_status != 'Cancelled'
      GROUP BY c.category_id, c.category_name
      ORDER BY category_revenue DESC
    `);

    // Compute percentage share for categories
    const categoriesWithShare = categoriesBreakdown.map((cat) => {
      const revenue = parseFloat(cat.category_revenue) || 0;
      const share = gmv > 0 ? Math.round((revenue / gmv) * 100) : 0;
      return {
        category_id: cat.category_id,
        category_name: cat.category_name,
        revenue,
        order_count: parseInt(cat.order_count, 10) || 0,
        percentage_share: share
      };
    });

    // 4. Top Verified Merchants
    const [topSellers] = await pool.execute(`
      SELECT 
        u.user_id,
        u.name AS seller_name,
        u.email AS seller_email,
        COALESCE(SUM(oi.subtotal), 0) AS sales_volume,
        COUNT(DISTINCT oi.order_id) AS orders_count
      FROM users u
      LEFT JOIN order_items oi ON u.user_id = oi.seller_id
      LEFT JOIN orders o ON oi.order_id = o.order_id AND o.order_status != 'Cancelled'
      WHERE u.role = 'Seller'
      GROUP BY u.user_id, u.name, u.email
      ORDER BY sales_volume DESC
      LIMIT 5
    `);

    return sendSuccess(res, 'Admin reports and financial analytics retrieved', {
      gmv,
      platform_fees: platformFee,
      total_orders: totalOrders,
      avg_order_value: avgOrderValue,
      customer_satisfaction: parseFloat(Number(reviewRow.avg_rating).toFixed(1)),
      total_reviews: parseInt(reviewRow.total_reviews, 10) || 0,
      categories_breakdown: categoriesWithShare,
      top_sellers: topSellers.map((s) => ({
        user_id: s.user_id,
        seller_name: s.seller_name,
        seller_email: s.seller_email,
        sales_volume: parseFloat(s.sales_volume) || 0,
        orders_count: parseInt(s.orders_count, 10) || 0
      }))
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCustomers,
  updateCustomerStatus,
  getSellers,
  updateSellerStatus,
  getAdminStats,
  getProducts,
  updateProductStatus,
  getOrders,
  updateOrderStatus,
  getAdminReports
};
