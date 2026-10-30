const { pool } = require('../config/db');

/**
 * Inserts an audit trail record into system_logs.
 * This function NEVER throws an error, ensuring logging failures do not disrupt core business logic.
 *
 * @param {number|null} userId - ID of the user performing the action, or null if unauthenticated
 * @param {string} action - Action name/verb (e.g., 'REGISTER', 'LOGIN', 'LOGIN_FAILED')
 * @param {string} description - Details about the action
 * @param {string} [ip=null] - Client IP address
 * @returns {Promise<boolean>} - Resolves to true if recorded, false if logging failed
 */
async function logAction(userId, action, description, ip = null) {
  try {
    const validUserId = userId && Number.isInteger(Number(userId)) ? Number(userId) : null;
    const cleanAction = String(action || 'UNKNOWN_ACTION').substring(0, 100);
    const cleanDesc = description ? String(description) : null;
    const cleanIp = ip ? String(ip).substring(0, 50) : null;

    const sql = `
      INSERT INTO system_logs (user_id, action, description, ip_address)
      VALUES (?, ?, ?, ?)
    `;

    await pool.execute(sql, [validUserId, cleanAction, cleanDesc, cleanIp]);
    return true;
  } catch (err) {
    // Audit logging failure should never crash the server or request
    console.error(`[AUDIT_LOG_ERROR] Failed to record action "${action}":`, err.message);
    return false;
  }
}

module.exports = logAction;
