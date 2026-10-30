/**
 * Standardized API Response Utilities
 * Ensures all REST endpoints return a consistent JSON payload structure across the entire application.
 */

/**
 * Send standard success JSON response
 * @param {import('express').Response} res - Express response object
 * @param {string} message - Informative success message
 * @param {any} [data=null] - Payload to return to client
 * @param {number} [statusCode=200] - HTTP status code
 */
function sendSuccess(res, message, data = null, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

/**
 * Send standard error JSON response
 * @param {import('express').Response} res - Express response object
 * @param {string} message - Error description
 * @param {number} [statusCode=400] - HTTP status code
 * @param {any} [errors=null] - Optional field validation errors or details
 */
function sendError(res, message, statusCode = 400, errors = null) {
  const payload = {
    success: false,
    message
  };

  if (errors !== null && errors !== undefined) {
    payload.errors = errors;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  sendSuccess,
  sendError
};
