/**
 * Address Controller
 * Manages persistent user shipping addresses stored in the `addresses` table.
 */

const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * GET /api/addresses
 * Retrieves all saved addresses for the authenticated user, newest first.
 */
async function getUserAddresses(req, res, next) {
  try {
    const userId = req.user.user_id;

    const [addresses] = await pool.query(
      `SELECT address_id, user_id, address_line, city, state, pincode 
       FROM addresses 
       WHERE user_id = ? 
       ORDER BY address_id DESC`,
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
 */
async function addAddress(req, res, next) {
  try {
    const userId = req.user.user_id;
    const { address_line, city, state, pincode } = req.body;

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

    const [result] = await pool.query(
      `INSERT INTO addresses (user_id, address_line, city, state, pincode)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, cleanLine, cleanCity, cleanState, cleanPincode]
    );

    const newAddress = {
      address_id: result.insertId,
      user_id: userId,
      address_line: cleanLine,
      city: cleanCity,
      state: cleanState,
      pincode: cleanPincode
    };

    return sendSuccess(res, 'Address saved successfully!', newAddress, 201);
  } catch (error) {
    console.error('Error adding address:', error);
    return sendError(res, 'Failed to save address.', 500);
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

    const [result] = await pool.query(
      `DELETE FROM addresses WHERE address_id = ? AND user_id = ?`,
      [addressId, userId]
    );

    if (result.affectedRows === 0) {
      return sendError(res, 'Address not found or unauthorized to delete.', 404);
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
  deleteAddress
};
