/**
 * Address Controller
 * Manages persistent user shipping addresses stored in the `addresses` table.
 */

const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * GET /api/addresses
 * Retrieves all saved addresses for the authenticated user, default first, then newest.
 */
async function getUserAddresses(req, res, next) {
  try {
    const userId = req.user.user_id;

    const [addresses] = await pool.query(
      `SELECT address_id, user_id, address_line, city, state, pincode, is_default 
       FROM addresses 
       WHERE user_id = ? 
       ORDER BY is_default DESC, address_id DESC`,
      [userId]
    );

    return sendSuccess(res, 'Addresses retrieved successfully', addresses);
  } catch (error) {
    console.error('Error fetching addresses:', error);
    return sendError(res, 'Failed to retrieve addresses.', 500);
  }
}

/**
 * POST /api/addresses
 * Saves a new shipping address to the database for the authenticated user.
 * Automatically marks as default if requested or if it's the customer's first address.
 */
async function addAddress(req, res, next) {
  try {
    const userId = req.user.user_id;
    const { address_line, city, state, pincode, is_default } = req.body;

    // Validation
    if (!address_line || !address_line.trim()) {
      return sendError(res, 'Address line is required.', 400);
    }
    if (!city || !city.trim()) {
      return sendError(res, 'City is required.', 400);
    }
    if (!state || !state.trim()) {
      return sendError(res, 'State is required.', 400);
    }
    if (!pincode || !pincode.trim()) {
      return sendError(res, 'Pincode is required.', 400);
    }

    const cleanLine = address_line.trim();
    const cleanCity = city.trim();
    const cleanState = state.trim();
    const cleanPincode = pincode.trim();

    // Check count of user's existing addresses
    const [existing] = await pool.query(
      `SELECT COUNT(*) AS total FROM addresses WHERE user_id = ?`,
      [userId]
    );

    const isFirstAddress = existing[0].total === 0;
    const shouldBeDefault = Boolean(is_default) || isFirstAddress ? 1 : 0;

    // If setting as default, clear any existing default address for this user
    if (shouldBeDefault === 1) {
      await pool.query(
        `UPDATE addresses SET is_default = 0 WHERE user_id = ?`,
        [userId]
      );
    }

    const [result] = await pool.query(
      `INSERT INTO addresses (user_id, address_line, city, state, pincode, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, cleanLine, cleanCity, cleanState, cleanPincode, shouldBeDefault]
    );

    const newAddress = {
      address_id: result.insertId,
      user_id: userId,
      address_line: cleanLine,
      city: cleanCity,
      state: cleanState,
      pincode: cleanPincode,
      is_default: shouldBeDefault
    };

    return sendSuccess(res, 'Address saved successfully!', newAddress, 201);
  } catch (error) {
    console.error('Error adding address:', error);
    return sendError(res, 'Failed to save address.', 500);
  }
}

/**
 * PATCH /api/addresses/:id/default
 * Sets the specified address as the default shipping address for the user.
 */
async function setDefaultAddress(req, res, next) {
  try {
    const userId = req.user.user_id;
    const addressId = parseInt(req.params.id, 10);

    if (!addressId || isNaN(addressId)) {
      return sendError(res, 'Valid address ID is required.', 400);
    }

    // Verify address exists and belongs to this user
    const [check] = await pool.query(
      `SELECT address_id FROM addresses WHERE address_id = ? AND user_id = ?`,
      [addressId, userId]
    );

    if (check.length === 0) {
      return sendError(res, 'Address not found or unauthorized.', 404);
    }

    // Reset current defaults for user
    await pool.query(
      `UPDATE addresses SET is_default = 0 WHERE user_id = ?`,
      [userId]
    );

    // Set new default
    await pool.query(
      `UPDATE addresses SET is_default = 1 WHERE address_id = ? AND user_id = ?`,
      [addressId, userId]
    );

    return sendSuccess(res, 'Default shipping address updated successfully.');
  } catch (error) {
    console.error('Error setting default address:', error);
    return sendError(res, 'Failed to update default address.', 500);
  }
}

/**
 * DELETE /api/addresses/:id
 * Deletes a saved address belonging to the authenticated user.
 */
async function deleteAddress(req, res, next) {
  try {
    const userId = req.user.user_id;
    const addressId = parseInt(req.params.id, 10);

    if (!addressId || isNaN(addressId)) {
      return sendError(res, 'Valid address ID is required.', 400);
    }

    // Check if the address being deleted is default
    const [target] = await pool.query(
      `SELECT is_default FROM addresses WHERE address_id = ? AND user_id = ?`,
      [addressId, userId]
    );

    if (target.length === 0) {
      return sendError(res, 'Address not found or unauthorized to delete.', 404);
    }

    const wasDefault = target[0].is_default === 1;

    const [result] = await pool.query(
      `DELETE FROM addresses WHERE address_id = ? AND user_id = ?`,
      [addressId, userId]
    );

    // If deleted address was default, promote the newest remaining address to default
    if (wasDefault) {
      await pool.query(
        `UPDATE addresses 
         SET is_default = 1 
         WHERE user_id = ? 
         ORDER BY address_id DESC 
         LIMIT 1`,
        [userId]
      );
    }

    return sendSuccess(res, 'Address deleted successfully.');
  } catch (error) {
    console.error('Error deleting address:', error);
    return sendError(res, 'Failed to delete address.', 500);
  }
}

module.exports = {
  getUserAddresses,
  addAddress,
  setDefaultAddress,
  deleteAddress
};
