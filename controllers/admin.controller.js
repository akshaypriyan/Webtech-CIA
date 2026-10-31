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

module.exports = {
  getCustomers,
  updateCustomerStatus,
  getSellers,
  updateSellerStatus,
  getAdminStats
};
