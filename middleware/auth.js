const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/response');

/**
 * Authentication Middleware
 * Validates the JSON Web Token provided in the Authorization header.
 * Expected Header: Authorization: Bearer <token>
 * Attaches decoded user payload { user_id, role, email } to `req.user`.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'Authentication required. Please provide a valid Bearer token.', 401);
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return sendError(res, 'Authentication token missing.', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey_change_in_production');
    
    // Attach decoded token payload to request
    req.user = {
      user_id: decoded.user_id,
      role: decoded.role,
      email: decoded.email
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'Session expired. Please log in again.', 401);
    }
    return sendError(res, 'Invalid or tampered authentication token.', 401);
  }
}

module.exports = {
  authenticate
};
