const { sendError } = require('../utils/response');

/**
 * Role-Based Access Control (RBAC) Middleware
 * Restricts endpoint access to specific roles.
 * Must be used AFTER `authenticate` middleware.
 *
 * @param {...string} allowedRoles - List of permitted roles (e.g., 'Customer', 'Seller', 'Admin', 'Super Admin')
 * @returns {Function} Express middleware function
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return sendError(res, 'Authentication required before checking permissions.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        `Access denied. Role "${req.user.role}" does not have permission to access this resource.`,
        403
      );
    }

    next();
  };
}

module.exports = {
  authorizeRoles
};
