/**
 * ============================================================
 * Profile Controller — User Profile Management API
 * ============================================================
 * Handles:
 *   GET  /api/profile                        — fetch own profile
 *   PUT  /api/profile                        — update name / mobile
 *   PUT  /api/profile/password               — change password
 *   PUT  /api/profile/addresses/:id          — edit address (Customer only)
 *   PATCH /api/profile/addresses/:id/default — set default address (Customer only)
 *
 * NOTE on address routes:
 *   P2 owns GET /api/addresses, POST /api/addresses, DELETE /api/addresses/:id.
 *   This controller ONLY adds the two operations P2 didn't build:
 *   PUT (edit) and PATCH (set-default).
 *
 * All routes require the `authenticate` middleware.
 * Address routes additionally require `authorizeRoles('Customer')`.
 * ============================================================
 */

const { pool }                    = require('../config/db');
const { sendSuccess, sendError }  = require('../utils/response');
const logAction                   = require('../utils/logAction');
const bcrypt                      = require('bcryptjs');

// ================================================================
// GET /api/profile
// Returns the current user's profile.
// For Customers: also attaches their saved addresses array.
// ================================================================
async function getProfile(req, res, next) {
  try {
    const userId = req.user.user_id;

    // Fetch user row — exclude password hash for security
    const [userRows] = await pool.execute(
      `SELECT user_id, name, email, mobile, role, status, created_at
       FROM   users
       WHERE  user_id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return sendError(res, 'User not found.', 404);
    }

    const user = userRows[0];
    let addresses = [];

    // For Customers: attach their address list
    if (user.role === 'Customer') {
      const [addrRows] = await pool.execute(
        `SELECT address_id, user_id, address_line, city, state, pincode, is_default
         FROM   addresses
         WHERE  user_id = ?
         ORDER  BY is_default DESC, address_id ASC`,
        [userId]
      );
      addresses = addrRows;
    }

    return sendSuccess(res, 'Profile retrieved successfully', { user, addresses });
  } catch (err) {
    next(err);
  }
}

// ================================================================
// PUT /api/profile
// Body: { name, mobile }
// Updates name and mobile. Validates both fields.
// ================================================================
async function updateProfile(req, res, next) {
  try {
    const userId = req.user.user_id;
    let { name, mobile } = req.body;

    // ---- Validation ----
    if (!name || !mobile) {
      return sendError(res, 'Both name and mobile are required.', 400);
    }

    name   = String(name).trim();
    mobile = String(mobile).trim();

    // Name: 2 to 60 characters
    if (name.length < 2 || name.length > 60) {
      return sendError(res, 'Name must be between 2 and 60 characters.', 400);
    }

    // Mobile: exactly 10 digits
    if (!/^\d{10}$/.test(mobile)) {
      return sendError(res, 'Mobile must be exactly 10 digits (numbers only).', 400);
    }

    // ---- Update DB ----
    await pool.execute(
      `UPDATE users
         SET name = ?, mobile = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [name, mobile, userId]
    );

    // Re-fetch updated user (no password)
    const [updatedRows] = await pool.execute(
      `SELECT user_id, name, email, mobile, role, status, created_at
       FROM   users
       WHERE  user_id = ?`,
      [userId]
    );

    // Audit trail
    await logAction(userId, 'PROFILE_UPDATE', 'User updated name/mobile', req.ip);

    return sendSuccess(res, 'Profile updated successfully', { user: updatedRows[0] });
  } catch (err) {
    // Handle missing updated_at column gracefully — retry without it
    if (err.code === 'ER_BAD_FIELD_ERROR' && err.message.includes('updated_at')) {
      try {
        const userId = req.user.user_id;
        const name   = String(req.body.name || '').trim();
        const mobile = String(req.body.mobile || '').trim();
        await pool.execute(
          `UPDATE users SET name = ?, mobile = ? WHERE user_id = ?`,
          [name, mobile, userId]
        );
        const [updatedRows] = await pool.execute(
          `SELECT user_id, name, email, mobile, role, status, created_at FROM users WHERE user_id = ?`,
          [userId]
        );
        await logAction(userId, 'PROFILE_UPDATE', 'User updated name/mobile', req.ip);
        return sendSuccess(res, 'Profile updated successfully', { user: updatedRows[0] });
      } catch (retryErr) {
        return next(retryErr);
      }
    }
    next(err);
  }
}

// ================================================================
// PUT /api/profile/password
// Body: { currentPassword, newPassword }
// Validates, compares bcrypt hash, updates with new hash.
// ================================================================
async function changePassword(req, res, next) {
  try {
    const userId = req.user.user_id;
    const { currentPassword, newPassword } = req.body;

    // ---- Validation ----
    if (!currentPassword || !newPassword) {
      return sendError(res, 'Both currentPassword and newPassword are required.', 400);
    }

    if (newPassword.length < 8) {
      return sendError(res, 'New password must be at least 8 characters long.', 400);
    }

    // Fetch current password hash from DB
    const [rows] = await pool.execute(
      `SELECT password FROM users WHERE user_id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return sendError(res, 'User not found.', 404);
    }

    const storedHash = rows[0].password;

    // Compare currentPassword with stored hash
    const isMatch = await bcrypt.compare(currentPassword, storedHash);
    if (!isMatch) {
      return sendError(res, 'Current password is incorrect.', 400);
    }

    // New password must differ from current (plain string comparison)
    if (newPassword === currentPassword) {
      return sendError(res, 'New password must be different from your current password.', 400);
    }

    // Hash new password with bcrypt, salt rounds = 10
    const newHash = await bcrypt.hash(newPassword, 10);

    // Update password in DB
    await pool.execute(
      `UPDATE users SET password = ? WHERE user_id = ?`,
      [newHash, userId]
    );

    // Audit trail
    await logAction(userId, 'PASSWORD_CHANGE', 'User changed their password', req.ip);

    return sendSuccess(res, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
}

// ================================================================
// GET /api/profile/addresses
// Customer only (enforced in router). Returns all saved addresses.
// ================================================================
async function getAddresses(req, res, next) {
  try {
    const userId = req.user.user_id;
    const [rows] = await pool.execute(
      `SELECT address_id, user_id, address_line, city, state, pincode, is_default
       FROM   addresses
       WHERE  user_id = ?
       ORDER  BY is_default DESC, address_id DESC`,
      [userId]
    );
    return sendSuccess(res, 'Addresses retrieved successfully', rows);
  } catch (err) {
    next(err);
  }
}

// ================================================================
// POST /api/profile/addresses
// Body: { address_line, city, state, pincode }
// Customer only. Enforces 5 address limit and 6-digit pincode.
// ================================================================
async function addAddress(req, res, next) {
  try {
    const userId = req.user.user_id;
    let { address_line, city, state, pincode } = req.body;

    // ---- Validation ----
    if (!address_line || !city || !state || !pincode) {
      return sendError(res, 'address_line, city, state, and pincode are all required.', 400);
    }

    address_line = String(address_line).trim();
    city         = String(city).trim();
    state        = String(state).trim();
    pincode      = String(pincode).trim();

    if (!/^\d{6}$/.test(pincode)) {
      return sendError(res, 'Pincode must be exactly 6 digits.', 400);
    }

    // Limit check: maximum 5 addresses
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM addresses WHERE user_id = ?`,
      [userId]
    );
    if (countRows[0].total >= 5) {
      return sendError(res, 'You have reached the maximum limit of 5 addresses per account.', 400);
    }

    // First address automatically becomes default
    const isDefault = countRows[0].total === 0 ? 1 : 0;

    const [result] = await pool.execute(
      `INSERT INTO addresses (user_id, address_line, city, state, pincode, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, address_line, city, state, pincode, isDefault]
    );

    const [newRows] = await pool.execute(
      `SELECT address_id, user_id, address_line, city, state, pincode, is_default
       FROM   addresses
       WHERE  address_id = ?`,
      [result.insertId]
    );

    await logAction(
      userId,
      'ADDRESS_ADD',
      `User added address ID ${result.insertId}`,
      req.ip
    );

    return sendSuccess(res, 'Address added successfully', { address: newRows[0] }, 201);
  } catch (err) {
    next(err);
  }
}

// ================================================================
// DELETE /api/profile/addresses/:id
// Customer only. Deletes an address belonging to the user.
// ================================================================
async function deleteAddress(req, res, next) {
  try {
    const userId    = req.user.user_id;
    const addressId = parseInt(req.params.id, 10);

    if (isNaN(addressId) || addressId < 1) {
      return sendError(res, 'Invalid address ID.', 400);
    }

    const [result] = await pool.execute(
      `DELETE FROM addresses WHERE address_id = ? AND user_id = ?`,
      [addressId, userId]
    );

    if (result.affectedRows === 0) {
      return sendError(res, 'Address not found or does not belong to you.', 404);
    }

    await logAction(
      userId,
      'ADDRESS_DELETE',
      `User deleted address ID ${addressId}`,
      req.ip
    );

    return sendSuccess(res, 'Address deleted successfully');
  } catch (err) {
    next(err);
  }
}

// ================================================================
// PUT /api/profile/addresses/:id
// Body: { address_line, city, state, pincode }
// Customer only (enforced in router). Edits an existing address.
// ================================================================
async function updateAddress(req, res, next) {
  try {
    const userId    = req.user.user_id;
    const addressId = parseInt(req.params.id, 10);

    if (isNaN(addressId) || addressId < 1) {
      return sendError(res, 'Invalid address ID.', 400);
    }

    let { address_line, city, state, pincode } = req.body;

    // ---- Validation — all four fields are required ----
    if (!address_line || !city || !state || !pincode) {
      return sendError(res, 'address_line, city, state, and pincode are all required.', 400);
    }

    address_line = String(address_line).trim();
    city         = String(city).trim();
    state        = String(state).trim();
    pincode      = String(pincode).trim();

    // Pincode: exactly 6 digits
    if (!/^\d{6}$/.test(pincode)) {
      return sendError(res, 'Pincode must be exactly 6 digits.', 400);
    }

    // Check address belongs to this user
    const [ownerCheck] = await pool.execute(
      `SELECT address_id FROM addresses WHERE address_id = ? AND user_id = ?`,
      [addressId, userId]
    );

    if (ownerCheck.length === 0) {
      return sendError(res, 'Address not found or does not belong to you.', 404);
    }

    // Update address
    await pool.execute(
      `UPDATE addresses
         SET address_line = ?, city = ?, state = ?, pincode = ?
       WHERE address_id = ? AND user_id = ?`,
      [address_line, city, state, pincode, addressId, userId]
    );

    // Fetch and return updated address
    const [updatedRows] = await pool.execute(
      `SELECT address_id, user_id, address_line, city, state, pincode, is_default
       FROM   addresses
       WHERE  address_id = ?`,
      [addressId]
    );

    await logAction(
      userId,
      'ADDRESS_UPDATE',
      `User updated address ID ${addressId}`,
      req.ip
    );

    return sendSuccess(res, 'Address updated successfully', { address: updatedRows[0] });
  } catch (err) {
    next(err);
  }
}

// ================================================================
// PATCH /api/profile/addresses/:id/default
// Sets one address as the default; clears all others first.
// Customer only (enforced in router).
// ================================================================
async function setDefaultAddress(req, res, next) {
  try {
    const userId    = req.user.user_id;
    const addressId = parseInt(req.params.id, 10);

    if (isNaN(addressId) || addressId < 1) {
      return sendError(res, 'Invalid address ID.', 400);
    }

    // Check address belongs to this user
    const [ownerCheck] = await pool.execute(
      `SELECT address_id FROM addresses WHERE address_id = ? AND user_id = ?`,
      [addressId, userId]
    );

    if (ownerCheck.length === 0) {
      return sendError(res, 'Address not found or does not belong to you.', 404);
    }

    // Clear all existing defaults for this user first
    await pool.execute(
      `UPDATE addresses SET is_default = 0 WHERE user_id = ?`,
      [userId]
    );

    // Mark the chosen address as default
    await pool.execute(
      `UPDATE addresses SET is_default = 1 WHERE address_id = ? AND user_id = ?`,
      [addressId, userId]
    );

    await logAction(
      userId,
      'ADDRESS_SET_DEFAULT',
      `User set address ID ${addressId} as default`,
      req.ip
    );

    return sendSuccess(res, 'Default address updated successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
};
