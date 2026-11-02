const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * ==============================================================================
 * Online Marketplace - Super Admin Management & Permissions Controller (Person 4)
 * ==============================================================================
 * Root administration endpoints for managing Administrator accounts,
 * delegating fine-grained table access permissions, and account governance.
 * ==============================================================================
 */

/**
 * Standard system permissions supported by the marketplace platform
 */
const VALID_PERMISSIONS = [
  'manage_categories',
  'manage_users',
  'manage_products',
  'view_reports',
  'system_logs'
];

/**
 * @desc    Get all Administrator accounts with delegated permissions
 * @route   GET /api/superadmin/admins
 * @access  Private (Super Admin)
 */
async function getAdmins(req, res, next) {
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
        GROUP_CONCAT(ap.permission_name ORDER BY ap.permission_name SEPARATOR ',') AS permissions_str
      FROM users u
      LEFT JOIN admin_permissions ap ON u.user_id = ap.admin_id
      WHERE u.role = 'Admin'
    `;
    const params = [];

    if (status && status !== 'ALL' && ['Active', 'Blocked'].includes(status)) {
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

    // Transform permissions string to array
    const admins = rows.map((admin) => ({
      user_id: admin.user_id,
      name: admin.name,
      email: admin.email,
      mobile: admin.mobile,
      role: admin.role,
      status: admin.status,
      created_at: admin.created_at,
      permissions: admin.permissions_str ? admin.permissions_str.split(',') : []
    }));

    return sendSuccess(res, 'Administrator staff retrieved successfully', admins);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Create a new Administrator account and assign permissions
 * @route   POST /api/superadmin/admins
 * @access  Private (Super Admin)
 */
async function createAdmin(req, res, next) {
  try {
    const { name, email, password, mobile, permissions } = req.body;

    // 1. Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return sendError(res, 'Full name is required (minimum 2 characters).', 400);
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return sendError(res, 'A valid email address is required.', 400);
    }

    if (!password || String(password).length < 6) {
      return sendError(res, 'Password must be at least 6 characters long.', 400);
    }

    const cleanMobile = mobile ? String(mobile).trim() : '9800000000';
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // 2. Check for email collision
    const [existing] = await pool.execute(
      'SELECT user_id FROM users WHERE LOWER(email) = ?',
      [cleanEmail]
    );

    if (existing.length > 0) {
      return sendError(res, `An account with email "${cleanEmail}" already exists.`, 409);
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Insert admin user
    const [userResult] = await pool.execute(
      'INSERT INTO users (name, email, password, mobile, role, status) VALUES (?, ?, ?, ?, "Admin", "Active")',
      [cleanName, cleanEmail, hashedPassword, cleanMobile]
    );

    const newAdminId = userResult.insertId;

    // 5. Assign initial permissions if provided
    const assignedPermissions = [];
    if (Array.isArray(permissions) && permissions.length > 0) {
      for (const perm of permissions) {
        if (VALID_PERMISSIONS.includes(perm)) {
          await pool.execute(
            'INSERT IGNORE INTO admin_permissions (admin_id, permission_name) VALUES (?, ?)',
            [newAdminId, perm]
          );
          assignedPermissions.push(perm);
        }
      }
    }

    // 6. Record audit trail
    if (req.logAudit) {
      await req.logAudit(
        'ADMIN_CREATE',
        `Created Admin account "${cleanName}" (${cleanEmail}) with permissions: [${assignedPermissions.join(', ')}]`
      );
    }

    return sendSuccess(
      res,
      'Administrator created successfully.',
      {
        user_id: newAdminId,
        name: cleanName,
        email: cleanEmail,
        mobile: cleanMobile,
        role: 'Admin',
        status: 'Active',
        permissions: assignedPermissions
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Toggle administrator status (Active / Blocked)
 * @route   PUT /api/superadmin/admins/:id/status
 * @access  Private (Super Admin)
 */
async function updateAdminStatus(req, res, next) {
  try {
    const adminId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (isNaN(adminId) || adminId <= 0) {
      return sendError(res, 'Invalid administrator ID provided.', 400);
    }

    if (!status || !['Active', 'Blocked'].includes(status)) {
      return sendError(res, 'Valid status is required ("Active" or "Blocked").', 400);
    }

    // 1. Verify target is an Admin
    const [existing] = await pool.execute(
      'SELECT user_id, name, email, role, status FROM users WHERE user_id = ? AND role = "Admin"',
      [adminId]
    );

    if (existing.length === 0) {
      return sendError(res, 'Administrator account not found.', 404);
    }

    const admin = existing[0];

    // 2. Update status
    await pool.execute(
      'UPDATE users SET status = ? WHERE user_id = ?',
      [status, adminId]
    );

    // 3. Record audit trail
    if (req.logAudit) {
      const verb = status === 'Active' ? 'ADMIN_ACTIVATE' : 'ADMIN_DEACTIVATE';
      await req.logAudit(
        verb,
        `Administrator "${admin.name}" (#${adminId}) status updated from ${admin.status} to ${status}`
      );
    }

    return sendSuccess(res, `Administrator status updated to ${status}.`, {
      user_id: adminId,
      name: admin.name,
      status
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Delete an Administrator account
 * @route   DELETE /api/superadmin/admins/:id
 * @access  Private (Super Admin)
 */
async function deleteAdmin(req, res, next) {
  try {
    const adminId = parseInt(req.params.id, 10);

    if (isNaN(adminId) || adminId <= 0) {
      return sendError(res, 'Invalid administrator ID provided.', 400);
    }

    // 1. Verify target is an Admin
    const [existing] = await pool.execute(
      'SELECT user_id, name, email FROM users WHERE user_id = ? AND role = "Admin"',
      [adminId]
    );

    if (existing.length === 0) {
      return sendError(res, 'Administrator account not found.', 404);
    }

    const admin = existing[0];

    // 2. Delete user (foreign keys automatically cascade delete permissions)
    await pool.execute('DELETE FROM users WHERE user_id = ?', [adminId]);

    // 3. Record audit trail
    if (req.logAudit) {
      await req.logAudit(
        'ADMIN_DELETE',
        `Deleted administrator "${admin.name}" (${admin.email}, ID: #${adminId})`
      );
    }

    return sendSuccess(res, `Administrator "${admin.name}" removed successfully.`, {
      user_id: adminId
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Get permissions assigned to an administrator
 * @route   GET /api/superadmin/admins/:id/permissions
 * @access  Private (Super Admin)
 */
async function getAdminPermissions(req, res, next) {
  try {
    const adminId = parseInt(req.params.id, 10);

    if (isNaN(adminId) || adminId <= 0) {
      return sendError(res, 'Invalid administrator ID provided.', 400);
    }

    const [adminCheck] = await pool.execute(
      'SELECT user_id, name FROM users WHERE user_id = ? AND role = "Admin"',
      [adminId]
    );

    if (adminCheck.length === 0) {
      return sendError(res, 'Administrator account not found.', 404);
    }

    const [rows] = await pool.execute(
      'SELECT permission_name FROM admin_permissions WHERE admin_id = ? ORDER BY permission_name ASC',
      [adminId]
    );

    const permissions = rows.map((r) => r.permission_name);

    return sendSuccess(res, 'Permissions retrieved successfully', {
      admin_id: adminId,
      admin_name: adminCheck[0].name,
      permissions
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Update/assign permissions for an administrator
 * @route   PUT /api/superadmin/admins/:id/permissions
 * @access  Private (Super Admin)
 */
async function updateAdminPermissions(req, res, next) {
  try {
    const adminId = parseInt(req.params.id, 10);
    const { permissions } = req.body;

    if (isNaN(adminId) || adminId <= 0) {
      return sendError(res, 'Invalid administrator ID provided.', 400);
    }

    if (!Array.isArray(permissions)) {
      return sendError(res, 'Permissions must be provided as an array.', 400);
    }

    // 1. Verify admin exists
    const [adminCheck] = await pool.execute(
      'SELECT user_id, name FROM users WHERE user_id = ? AND role = "Admin"',
      [adminId]
    );

    if (adminCheck.length === 0) {
      return sendError(res, 'Administrator account not found.', 404);
    }

    const admin = adminCheck[0];

    // 2. Filter to valid system permissions
    const validPerms = permissions.filter((p) => VALID_PERMISSIONS.includes(p));

    // 3. Clear existing permissions for this admin
    await pool.execute('DELETE FROM admin_permissions WHERE admin_id = ?', [adminId]);

    // 4. Insert updated permissions
    for (const perm of validPerms) {
      await pool.execute(
        'INSERT INTO admin_permissions (admin_id, permission_name) VALUES (?, ?)',
        [adminId, perm]
      );
    }

    // 5. Record audit trail
    if (req.logAudit) {
      await req.logAudit(
        'ADMIN_PERMISSIONS_UPDATE',
        `Assigned permissions [${validPerms.join(', ')}] to Administrator "${admin.name}" (#${adminId})`
      );
    }

    return sendSuccess(res, 'Administrator permissions updated successfully.', {
      admin_id: adminId,
      admin_name: admin.name,
      permissions: validPerms
    });
  } catch (err) {
    next(err);
  }
}

/**
 * In-memory platform settings store (with default system parameters)
 */
let systemSettingsStore = {
  site_name: 'MarketHub',
  support_email: 'support@market.com',
  commission_fee_rate: 5.0,
  currency: 'USD',
  jwt_expiration: '7d',
  max_login_attempts: 5,
  maintenance_mode: false,
  last_backup: new Date().toISOString()
};

/**
 * @desc    Get chronological system audit logs with filters (user, action, date, search)
 * @route   GET /api/superadmin/logs
 * @access  Private (Super Admin)
 */
async function getSystemLogs(req, res, next) {
  try {
    const { action, role, search, startDate, endDate, limit, page } = req.query;

    let sql = `
      SELECT 
        l.log_id,
        l.user_id,
        l.action,
        l.description,
        l.ip_address,
        l.created_at,
        u.name AS user_name,
        u.email AS user_email,
        u.role AS user_role
      FROM system_logs l
      LEFT JOIN users u ON l.user_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    // Filter by action verb
    if (action && action !== 'ALL') {
      sql += ' AND l.action = ?';
      params.push(action);
    }

    // Filter by role
    if (role && role !== 'ALL') {
      if (role === 'System') {
        sql += ' AND (u.role IS NULL OR l.user_id IS NULL)';
      } else {
        sql += ' AND u.role = ?';
        params.push(role);
      }
    }

    // Filter by date range
    if (startDate) {
      sql += ' AND l.created_at >= ?';
      params.push(new Date(startDate));
    }
    if (endDate) {
      sql += ' AND l.created_at <= ?';
      params.push(new Date(endDate));
    }

    // Full-text search on description, action, IP, or user email
    if (search && search.trim()) {
      sql += ' AND (l.description LIKE ? OR l.action LIKE ? OR l.ip_address LIKE ? OR u.email LIKE ? OR u.name LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    sql += ' ORDER BY l.log_id DESC';

    // Pagination
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    sql += ` LIMIT ${parsedLimit} OFFSET ${offset}`;

    const [rows] = await pool.execute(sql, params);

    // Get total logs count
    const [[{ total_count }]] = await pool.execute('SELECT COUNT(*) as total_count FROM system_logs');

    return sendSuccess(res, 'System audit logs retrieved successfully', {
      logs: rows,
      total_count,
      page: parsedPage,
      limit: parsedLimit
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Get current global platform settings
 * @route   GET /api/superadmin/settings
 * @access  Private (Super Admin)
 */
async function getSettings(req, res, next) {
  try {
    return sendSuccess(res, 'Platform settings retrieved successfully', systemSettingsStore);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Update global platform settings and record audit log
 * @route   PUT /api/superadmin/settings
 * @access  Private (Super Admin)
 */
async function updateSettings(req, res, next) {
  try {
    const {
      site_name,
      support_email,
      commission_fee_rate,
      currency,
      jwt_expiration,
      max_login_attempts,
      maintenance_mode
    } = req.body;

    if (site_name !== undefined) systemSettingsStore.site_name = String(site_name).trim();
    if (support_email !== undefined) systemSettingsStore.support_email = String(support_email).trim();
    if (commission_fee_rate !== undefined) {
      const rate = parseFloat(commission_fee_rate);
      if (!isNaN(rate) && rate >= 0 && rate <= 50) {
        systemSettingsStore.commission_fee_rate = rate;
      }
    }
    if (currency !== undefined) systemSettingsStore.currency = String(currency).trim();
    if (jwt_expiration !== undefined) systemSettingsStore.jwt_expiration = String(jwt_expiration);
    if (max_login_attempts !== undefined) {
      const attempts = parseInt(max_login_attempts, 10);
      if (!isNaN(attempts) && attempts > 0) {
        systemSettingsStore.max_login_attempts = attempts;
      }
    }
    if (maintenance_mode !== undefined) {
      systemSettingsStore.maintenance_mode = Boolean(maintenance_mode);
    }

    systemSettingsStore.last_updated = new Date().toISOString();

    // Record audit trail
    if (req.logAudit) {
      await req.logAudit(
        'SETTINGS_UPDATE',
        `Super Admin updated platform settings: Fee=${systemSettingsStore.commission_fee_rate}%, Maintenance=${systemSettingsStore.maintenance_mode}`
      );
    }

    return sendSuccess(res, 'Platform settings updated successfully.', systemSettingsStore);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAdmins,
  createAdmin,
  updateAdminStatus,
  deleteAdmin,
  getAdminPermissions,
  updateAdminPermissions,
  getSystemLogs,
  getSettings,
  updateSettings
};
